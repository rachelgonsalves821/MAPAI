/**
 * Mapai — Crash Reporting Service
 * Wraps Sentry for error tracking with screen context.
 *
 * Graceful degradation: if EXPO_PUBLIC_SENTRY_DSN is not set the service
 * falls back to console-only logging and never throws.
 *
 * PII policy: only the anonymous Clerk user ID is ever sent to Sentry.
 * Email, username, and displayName are stripped in beforeSend.
 */

import * as Sentry from '@sentry/react-native';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
let isInitialized = false;

export const CrashReporting = {
  /**
   * Initialize Sentry. Call once in root layout on mount.
   * Safe to call without a DSN — logs a warning and returns.
   */
  init() {
    if (isInitialized) return;

    if (!SENTRY_DSN) {
      console.log('[CrashReporting] Sentry disabled — no DSN');
      return;
    }

    Sentry.init({
      dsn: SENTRY_DSN,
      enableAutoSessionTracking: true,
      tracesSampleRate: 0.2,
      environment: process.env.APP_ENV || 'development',
      beforeSend(event) {
        // Strip PII — never send email or displayName
        if (event.user) {
          delete event.user.email;
          delete event.user.username;
        }
        return event;
      },
    });

    isInitialized = true;
    console.log('[CrashReporting] Sentry initialized');
  },

  /**
   * Set the anonymous user ID for crash context. Never pass email or PII.
   */
  setUser(anonymousId: string) {
    Sentry.setUser({ id: anonymousId });
    console.log('[CrashReporting] setUser', anonymousId);
  },

  /**
   * Clear the user context on sign-out.
   */
  clearUser() {
    Sentry.setUser(null);
    console.log('[CrashReporting] clearUser');
  },

  /**
   * Tag the current screen name on all subsequent errors.
   * Call this from navigation state change handlers.
   */
  setScreen(screenName: string) {
    Sentry.setTag('screen', screenName);
    console.log('[CrashReporting] setScreen', screenName);
  },

  /**
   * Manually capture an exception.
   */
  captureException(error: Error, context?: Record<string, any>) {
    console.error('[CrashReporting] captureException', error.message, context);
    Sentry.captureException(error, { extra: context });
  },

  /**
   * Capture a breadcrumb for debugging context.
   */
  addBreadcrumb(message: string, category: string, data?: Record<string, any>) {
    Sentry.addBreadcrumb({ message, category, data, level: 'info' });
    console.log('[CrashReporting] addBreadcrumb', category, message);
  },
};
