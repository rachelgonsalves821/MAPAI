/**
 * Mapai — Centralized API Error Handler
 *
 * Classifies Axios errors into user-friendly toast messages and emits them
 * via a lightweight publish/subscribe bus that works in both React Native
 * (Hermes) and web environments without relying on Node's `events` module.
 *
 * Usage — subscribing from a Toast UI component:
 *
 *   import { apiErrorEvents } from '@/services/api/errorHandler';
 *
 *   useEffect(() => {
 *     const unsub = apiErrorEvents.on('toast', (toast) => showToast(toast));
 *     return unsub;
 *   }, []);
 *
 * Usage — registering an auth sign-out callback (call once from AuthContext):
 *
 *   import { setUnauthorizedHandler } from '@/services/api/errorHandler';
 *   setUnauthorizedHandler(() => signOut());
 */

import { AxiosError } from 'axios';

// ---------------------------------------------------------------------------
// Minimal publish/subscribe bus (no Node `events` dependency)
// ---------------------------------------------------------------------------

type Listener<T> = (payload: T) => void;

class MiniEmitter<EventMap extends Record<string, unknown>> {
  private _listeners: { [K in keyof EventMap]?: Array<Listener<EventMap[K]>> } = {};

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): () => void {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event]!.push(listener);

    // Return an unsubscribe function for easy cleanup in useEffect
    return () => this.off(event, listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const list = this._listeners[event];
    if (!list) return;
    this._listeners[event] = list.filter((l) => l !== listener) as typeof list;
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this._listeners[event];
    if (!list) return;
    // Shallow-copy before iterating so mid-emit unsubscribes don't cause skips
    [...list].forEach((l) => l(payload));
  }
}

// ---------------------------------------------------------------------------
// Public event bus types
// ---------------------------------------------------------------------------

export type ErrorToast = {
  message: string;
  type: 'error' | 'warning' | 'info';
};

type ApiErrorEvents = {
  toast: ErrorToast;
};

export const apiErrorEvents = new MiniEmitter<ApiErrorEvents>();

// ---------------------------------------------------------------------------
// Unauthorized (401) callback — wired up by AuthContext at startup
// ---------------------------------------------------------------------------

let _unauthorizedHandler: (() => void) | null = null;

/**
 * Register a callback that fires whenever the API returns HTTP 401.
 * Call this once from AuthContext so the auth layer can refresh tokens or
 * redirect the user to the sign-in screen.
 */
export function setUnauthorizedHandler(handler: () => void): void {
  _unauthorizedHandler = handler;
}

/**
 * Called by the Axios response interceptor on HTTP 401.
 * Internal to the api/ module — not intended for direct use outside.
 */
export function onUnauthorized(): void {
  _unauthorizedHandler?.();
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/**
 * Converts an AxiosError into a structured toast descriptor.
 */
export function classifyApiError(error: AxiosError): ErrorToast {
  if (!error.response) {
    return {
      message: 'No internet connection. Check your network.',
      type: 'warning',
    };
  }

  const status = error.response.status;

  switch (status) {
    case 401:
      return { message: 'Session expired. Signing you back in...', type: 'info' };
    case 408:
      return { message: 'Request timed out. Please try again.', type: 'warning' };
    case 429:
      return { message: 'Too many requests. Try again in a moment.', type: 'warning' };
    default:
      if (status >= 500) {
        return { message: 'Something went wrong. Please try again.', type: 'error' };
      }
      return { message: 'Request failed. Please try again.', type: 'error' };
  }
}

/**
 * Classifies the error and emits a toast event on `apiErrorEvents`.
 *
 * 401 errors are intentionally suppressed here — the auth layer handles them
 * silently via `onUnauthorized()` / token refresh without showing a toast.
 */
export function showApiError(error: AxiosError): void {
  // Suppress 401 — handled silently via token refresh
  if (error.response?.status === 401) return;

  const toast = classifyApiError(error);
  apiErrorEvents.emit('toast', toast);
}
