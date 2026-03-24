/**
 * Mapai — Crash Reporting Service
 * Wraps Sentry for error tracking with screen context.
 *
 * Setup: Once @sentry/react-native is installed, uncomment the Sentry imports
 * and remove the stub implementations.
 *
 * Install command:
 *   npx expo install @sentry/react-native
 *   npx sentry-wizard -i reactNative -p ios android
 *
 * Add to app.json plugins:
 *   ["@sentry/react-native/expo", { "organization": "mapai", "project": "mapai-ios" }]
 */

// import * as Sentry from '@sentry/react-native';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
let isInitialized = false;

export const CrashReporting = {
  /**
   * Initialize Sentry. Call once in root layout.
   */
  init() {
    if (isInitialized || !SENTRY_DSN) {
      if (!SENTRY_DSN) {
        console.log('[CrashReporting] No SENTRY_DSN set — crash reporting disabled');
      }
      return;
    }

    // Uncomment when @sentry/react-native is installed:
    // Sentry.init({
    //   dsn: SENTRY_DSN,
    //   enableAutoSessionTracking: true,
    //   tracesSampleRate: 0.2,
    //   environment: process.env.APP_ENV || 'development',
    //   beforeSend(event) {
    //     // Strip PII — never send email or displayName
    //     if (event.user) {
    //       delete event.user.email;
    //       delete event.user.username;
    //     }
    //     return event;
    //   },
    // });

    isInitialized = true;
    console.log('[CrashReporting] Sentry initialized');
  },

  /**
   * Set the anonymous user ID for crash context. Never pass email or PII.
   */
  setUser(anonymousId: string) {
    // Sentry.setUser({ id: anonymousId });
    console.log('[CrashReporting] setUser', anonymousId);
  },

  /**
   * Tag the current screen name on all subsequent errors.
   * Call this from navigation state change handlers.
   */
  setScreen(screenName: string) {
    // Sentry.setTag('screen', screenName);
    console.log('[CrashReporting] setScreen', screenName);
  },

  /**
   * Manually capture an exception.
   */
  captureException(error: Error, context?: Record<string, any>) {
    console.error('[CrashReporting] captureException', error.message, context);
    // Sentry.captureException(error, { extra: context });
  },

  /**
   * Capture a breadcrumb for debugging context.
   */
  addBreadcrumb(message: string, category: string, data?: Record<string, any>) {
    // Sentry.addBreadcrumb({ message, category, data, level: 'info' });
  },
};
