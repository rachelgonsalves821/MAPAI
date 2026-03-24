/**
 * Mapai — Analytics Manager
 * Stub implementation. Segment / Amplitude are not yet installed.
 *
 * ATT (App Tracking Transparency) awareness:
 *   - ATT denied  → anonymous tracking only (no user_id, no email)
 *   - ATT granted → full user identification
 *
 * When a real analytics SDK is wired in, replace the console.log stubs in each
 * method with the corresponding SDK calls. The initAfterOnboarding entry-point
 * is the canonical place to request ATT and bootstrap the SDK.
 *
 * expo-tracking-transparency is wrapped in try/catch so the app builds before
 * the package is installed.
 */

import { usePermissionStore } from '../store/permissionStore';

// ─── Internal helpers ─────────────────────────────────────────────────────────

function getTrackingStatus() {
  return usePermissionStore.getState().trackingTransparency;
}

/**
 * Requests ATT permission and updates the permission store.
 * Returns the resolved status.
 */
async function requestTrackingPermission(): Promise<'granted' | 'denied' | 'undetermined'> {
  try {
    const TrackingTransparency = await import('expo-tracking-transparency');
    const { status } = await TrackingTransparency.requestTrackingPermissionsAsync();

    let normalised: 'granted' | 'denied' | 'undetermined';
    if (status === 'granted') {
      normalised = 'granted';
    } else if (status === 'denied') {
      normalised = 'denied';
    } else {
      normalised = 'undetermined';
    }

    usePermissionStore.getState().setTrackingTransparency(normalised);
    return normalised;
  } catch {
    // expo-tracking-transparency not installed yet — treat as undetermined.
    return 'undetermined';
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const AnalyticsManager = {
  /**
   * Must be called once after the user completes onboarding.
   * Requests ATT on iOS, then bootstraps the analytics SDK (when installed)
   * with the appropriate level of identification based on the ATT result.
   */
  async initAfterOnboarding(userId: string, email: string): Promise<void> {
    const attStatus = await requestTrackingPermission();

    if (attStatus === 'granted') {
      // Full identification — wire real SDK call here.
      console.log('[Analytics] initAfterOnboarding — ATT granted, full identification', {
        userId,
        email,
        attStatus,
      });
      AnalyticsManager.identify(userId, { email });
    } else {
      // Anonymous only — do NOT pass userId or email to the SDK.
      console.log('[Analytics] initAfterOnboarding — ATT denied/undetermined, anonymous mode', {
        attStatus,
      });
      AnalyticsManager.identify(undefined, {});
    }
  },

  /**
   * Tracks a named event with optional properties.
   * Respects ATT status — when denied, strips any PII from properties before
   * forwarding to the SDK.
   */
  track(event: string, properties?: Record<string, any>): void {
    const attStatus = getTrackingStatus();
    const safeProps = attStatus === 'granted' ? properties : stripPII(properties);
    console.log('[Analytics] track', event, safeProps);
    // TODO: analytics.track(event, safeProps);
  },

  /**
   * Associates a user identity with subsequent events.
   * Pass undefined for userId to stay in anonymous mode.
   */
  identify(userId?: string, traits?: Record<string, any>): void {
    const attStatus = getTrackingStatus();
    if (attStatus !== 'granted' && userId) {
      // ATT not granted — suppress identity linkage.
      console.log('[Analytics] identify — suppressed (ATT not granted)');
      return;
    }
    console.log('[Analytics] identify', userId, traits);
    // TODO: analytics.identify(userId, traits);
  },

  /**
   * Records a screen view.
   */
  screen(name: string, properties?: Record<string, any>): void {
    const attStatus = getTrackingStatus();
    const safeProps = attStatus === 'granted' ? properties : stripPII(properties);
    console.log('[Analytics] screen', name, safeProps);
    // TODO: analytics.screen(name, safeProps);
  },
};

// ─── Internal ─────────────────────────────────────────────────────────────────

/**
 * Removes known PII keys from an analytics properties object.
 * Extend this list as the data model grows.
 */
function stripPII(properties?: Record<string, any>): Record<string, any> | undefined {
  if (!properties) return properties;
  const PII_KEYS = ['email', 'phone', 'name', 'firstName', 'lastName', 'address', 'ip'];
  const sanitised: Record<string, any> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!PII_KEYS.includes(key)) {
      sanitised[key] = value;
    }
  }
  return sanitised;
}
