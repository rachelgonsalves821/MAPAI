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
// Supabase session token cache.
//
// Calling supabase.auth.getSession() per-request was producing
//   AbortError: Lock broken by another request with the 'steal' option
// because supabase-js uses a browser LockManager lock and multiple concurrent
// callers (interceptor, AuthContext, onboarding screens) were contending for it.
//
// Instead, we call getSession() exactly once at module load and then keep the
// cache warm via onAuthStateChange. The interceptor does a synchronous read of
// _supabaseToken — no lock, no concurrency.
// ---------------------------------------------------------------------------
let _supabaseToken: string | null = null;
let _authInitPromise: Promise<void> | null = null;

function initAuthCache(): Promise<void> {
  if (_authInitPromise) return _authInitPromise;
  _authInitPromise = (async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      _supabaseToken = session?.access_token ?? null;
    } catch (e) {
      console.warn('[API] initial getSession() failed:', (e as Error).message);
    }
    supabase.auth.onAuthStateChange((_event, session) => {
      _supabaseToken = session?.access_token ?? null;
    });
  })();
  return _authInitPromise;
}

// Kick off initialization eagerly so the cache is warm by the time requests fire.
initAuthCache();

// ---------------------------------------------------------------------------
// Legacy token setters — kept so ApiTokenSync in _layout.tsx and any
// dev/guest-mode callers can still push a token into the same cache.
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
// Token resolution order (all non-blocking after first request):
//  1. _supabaseToken — cache populated by initAuthCache() + onAuthStateChange.
//  2. _authToken — legacy cache used by ApiTokenSync / guest mode.
//  3. _getToken() — live getter (last-resort; only set by ApiTokenSync).
//  4. AsyncStorage 'auth_token' — legacy dev token fallback.
// ---------------------------------------------------------------------------
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      // Block on the very first request so the cache has a chance to warm up.
      // Subsequent calls resolve synchronously because _authInitPromise is
      // already fulfilled.
      await initAuthCache();

      let token = _supabaseToken ?? _authToken;
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
