import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axiosRetry from 'axios-retry';
import { CrashReporting } from '../CrashReporting';
import { showApiError, onUnauthorized } from './errorHandler';
import { BACKEND_URL } from '@/constants/api';
import { supabase } from '@/services/supabase';

const apiClient: AxiosInstance = axios.create({
  baseURL: BACKEND_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ---------------------------------------------------------------------------
// Retry configuration
// Retries 3 times by default with exponential backoff + jitter (100ms, 400ms,
// 1600ms). POST /chat/ endpoints are capped at 1 retry (set per-request below)
// because LLM calls are expensive and non-idempotent.
// ---------------------------------------------------------------------------
axiosRetry(apiClient, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay, // 100ms, 400ms, 1600ms with jitter
  retryCondition: (error: AxiosError) => {
    // Retry on network errors (no response object)
    if (!error.response) return true;
    // Retry on transient server-side and rate-limit status codes
    const status = error.response.status;
    return [408, 429, 500, 502, 503, 504].includes(status);
  },
  onRetry: (retryCount, error, requestConfig) => {
    console.log(`[API] Retry ${retryCount} for ${requestConfig.url}`);
  },
});

// ---------------------------------------------------------------------------
// Auth token — legacy cache kept for backwards compatibility with ApiTokenSync
// in _layout.tsx. The interceptor now calls supabase.auth.getSession() directly
// as the primary source, so these exports are effectively no-ops but remain to
// avoid breaking existing imports.
// ---------------------------------------------------------------------------
let _authToken: string | null = null;
export function setApiAuthToken(token: string | null) {
  _authToken = token;
}

let _getToken: (() => Promise<string | null>) | null = null;
export function setApiTokenGetter(fn: (() => Promise<string | null>) | null) {
  _getToken = fn;
}

// ---------------------------------------------------------------------------
// Request interceptor: inject auth token + per-endpoint overrides
//
// Token resolution order:
//  1. supabase.auth.getSession() — primary. supabase-js keeps the session in
//     memory and auto-refreshes before expiry, so this is cheap and always
//     returns the freshest token.
//  2. _authToken cache — fallback if supabase returned null (e.g. guest mode
//     where ApiTokenSync has pushed a custom token).
//  3. AsyncStorage 'auth_token' — legacy fallback for dev tokens.
// ---------------------------------------------------------------------------
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      let token: string | null = null;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        token = session?.access_token ?? null;
      } catch (e) {
        console.warn('[API] supabase.auth.getSession() threw:', e);
      }

      if (!token && _authToken) token = _authToken;
      if (!token && _getToken) token = await _getToken().catch(() => null);
      if (!token) token = await AsyncStorage.getItem('auth_token');

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        console.log(
          `[API] ${config.method?.toUpperCase()} ${config.url} token=${token.slice(0, 20)}...`
        );
      } else {
        console.warn(
          `[API] ${config.method?.toUpperCase()} ${config.url} — NO TOKEN available`
        );
      }
    } catch (error) {
      console.error('[API] Error retrieving auth token:', error);
    }

    // LLM calls can take longer — extend the timeout to 30 seconds.
    // The server enforces a 20s ceiling on the Gemini call itself, so this
    // gives room for DB overhead + a provider fallback before the client cuts off.
    if (config.url?.includes('/chat/')) {
      config.timeout = 30000;
    }

    // Chat POSTs are non-idempotent (DB writes + LLM calls) — never retry them.
    if (config.method === 'post' && config.url?.includes('/chat/')) {
      config['axios-retry'] = { retries: 0 };
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ---------------------------------------------------------------------------
// Response interceptor: observability + error surfacing
// ---------------------------------------------------------------------------
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response ? error.response.status : null;

    if (status === 401) {
      console.warn('Unauthorized access - token may be invalid or expired');
      // Notify the auth layer so it can trigger a token refresh or sign-out
      onUnauthorized();
    } else if (status === 404) {
      console.error('Resource not found:', error.config?.url);
    } else if (status !== null && status >= 500) {
      console.error('Server error reported by Mapai Backend');
      CrashReporting.captureException(error as unknown as Error, {
        url: error.config?.url,
        status,
      });
    } else if (!error.response) {
      // Network error — no HTTP response at all
      CrashReporting.addBreadcrumb('Network error', 'api', {
        url: error.config?.url,
      });
    }

    // Surface a user-facing toast for all non-401 errors (401 is handled
    // silently via token refresh in the auth layer)
    showApiError(error);

    return Promise.reject(error);
  }
);

export default apiClient;
