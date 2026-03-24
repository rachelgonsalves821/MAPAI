/**
 * NotificationPermissionPrompt
 *
 * A "pre-prompt" bottom sheet shown before triggering the one-time iOS system
 * notification permission dialog. Priming the user here dramatically improves
 * accept rates because they understand the value before the system alert fires.
 *
 * Animation strategy
 * ------------------
 * Two independent Reanimated shared values are driven in parallel whenever
 * `visible` flips:
 *   • backdropOpacity  — fades the semi-transparent scrim (withTiming, 280 ms)
 *   • sheetTranslateY  — slides the card up from below the fold (withSpring,
 *                        damping 18 / stiffness 200 for a crisp, non-bouncy feel)
 *
 * On dismiss we animate out first, then call the prop callback once the spring
 * settles so the parent can safely hide the modal without a visual jump.
 */

import React, { useEffect, useCallback } from 'react';
import {
  Modal,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationContext =
  | 'saved_place'
  | 'arrival_checkin'
  | 'friend_activity';

export interface NotificationPermissionPromptProps {
  visible: boolean;
  onAllow: () => void;
  onDismiss: () => void;
  context: NotificationContext;
}

// ─── Content map ─────────────────────────────────────────────────────────────

interface ContextContent {
  headline: string;
  benefit: string;
  /** Short label shown beneath the icon — reinforces the use-case at a glance */
  eyebrow: string;
}

const CONTEXT_CONTENT: Record<NotificationContext, ContextContent> = {
  saved_place: {
    eyebrow: 'Saved Places',
    headline: 'Never miss a moment',
    benefit: "Get notified when friends visit places you've saved",
  },
  arrival_checkin: {
    eyebrow: 'Arrival Check-in',
    headline: 'Arrived somewhere new?',
    benefit: 'Get a quick check-in prompt when you arrive at your destination',
  },
  friend_activity: {
    eyebrow: 'Friend Activity',
    headline: 'Stay in the loop',
    benefit: 'Stay in the loop when friends discover new spots',
  },
};

// ─── Animation constants ──────────────────────────────────────────────────────

const BACKDROP_OPACITY = 0.55;
const SHEET_OFFSCREEN = 380; // px below the fold — covers the tallest card size
const SPRING_CONFIG = { damping: 18, stiffness: 200, mass: 0.8 };
const FADE_DURATION = 260;
const FADE_OUT_DURATION = 200;

// ─── Component ────────────────────────────────────────────────────────────────

export default function NotificationPermissionPrompt({
  visible,
  onAllow,
  onDismiss,
  context,
}: NotificationPermissionPromptProps) {
  const backdropOpacity = useSharedValue(0);
  const sheetTranslateY = useSharedValue(SHEET_OFFSCREEN);

  // Animate in / out whenever `visible` changes
  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(BACKDROP_OPACITY, {
        duration: FADE_DURATION,
        easing: Easing.out(Easing.quad),
      });
      sheetTranslateY.value = withSpring(0, SPRING_CONFIG);
    } else {
      backdropOpacity.value = withTiming(0, { duration: FADE_OUT_DURATION });
      sheetTranslateY.value = withSpring(SHEET_OFFSCREEN, SPRING_CONFIG);
    }
  }, [visible, backdropOpacity, sheetTranslateY]);

  // ── Dismiss helpers ─────────────────────────────────────────────────────────
  // We animate out first, then call the prop so the parent hides the Modal
  // only after the sheet has fully retracted — no visual flicker.

  const animateOut = useCallback(
    (callback: () => void) => {
      backdropOpacity.value = withTiming(0, { duration: FADE_OUT_DURATION });
      sheetTranslateY.value = withSpring(
        SHEET_OFFSCREEN,
        SPRING_CONFIG,
        (finished) => {
          if (finished) runOnJS(callback)();
        },
      );
    },
    [backdropOpacity, sheetTranslateY],
  );

  const handleDismiss = useCallback(() => {
    animateOut(onDismiss);
  }, [animateOut, onDismiss]);

  const handleAllow = useCallback(() => {
    animateOut(onAllow);
  }, [animateOut, onAllow]);

  // ── Animated styles ─────────────────────────────────────────────────────────

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  // ── Content ─────────────────────────────────────────────────────────────────

  const { eyebrow, headline, benefit } = CONTEXT_CONTENT[context];

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"   // Reanimated owns all motion
      statusBarTranslucent   // Backdrop covers the status bar on Android
      onRequestClose={handleDismiss}
    >
      {/* Scrim — tapping it dismisses the sheet */}
      <TouchableWithoutFeedback onPress={handleDismiss} accessibilityLabel="Dismiss">
        <Animated.View style={[styles.backdrop, backdropStyle]} />
      </TouchableWithoutFeedback>

      {/* Bottom sheet card */}
      <Animated.View style={[styles.sheet, sheetStyle]}>
        {/* Drag handle — visual affordance only */}
        <View style={styles.handle} />

        {/* Icon badge */}
        <View style={styles.iconBadge}>
          <Ionicons
            name="notifications-outline"
            size={28}
            color={Colors.brandBlue}
          />
        </View>

        {/* Eyebrow */}
        <Text style={styles.eyebrow}>{eyebrow}</Text>

        {/* Headline */}
        <Text style={styles.headline}>{headline}</Text>

        {/* Benefit copy */}
        <Text style={styles.benefit}>{benefit}</Text>

        {/* Trust signals */}
        <View style={styles.trustRow}>
          <TrustPill icon="lock-closed-outline" label="No spam, ever" />
          <TrustPill icon="settings-outline" label="Change anytime" />
        </View>

        {/* Primary CTA */}
        <TouchableOpacity
          style={styles.allowButton}
          onPress={handleAllow}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Allow Notifications"
        >
          <Ionicons
            name="notifications"
            size={18}
            color={Colors.textOnBrand}
            style={styles.allowButtonIcon}
          />
          <Text style={styles.allowButtonText}>Allow Notifications</Text>
        </TouchableOpacity>

        {/* Secondary CTA */}
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={handleDismiss}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Not now"
        >
          <Text style={styles.dismissButtonText}>Not now</Text>
        </TouchableOpacity>

        {/* iOS home-indicator clearance */}
        <View style={styles.homeIndicatorSpacer} />
      </Animated.View>
    </Modal>
  );
}

// ─── Trust pill sub-component ─────────────────────────────────────────────────

interface TrustPillProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
}

function TrustPill({ icon, label }: TrustPillProps) {
  return (
    <View style={styles.trustPill}>
      <Ionicons name={icon} size={13} color={Colors.textSecondary} />
      <Text style={styles.trustPillText}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BOTTOM_SHEET_RADIUS = 24;
const ICON_BADGE_SIZE = 64;

const styles = StyleSheet.create({
  // Scrim
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },

  // Sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.background,
    borderTopLeftRadius: BOTTOM_SHEET_RADIUS,
    borderTopRightRadius: BOTTOM_SHEET_RADIUS,
    paddingHorizontal: Spacing['2xl'],
    paddingTop: Spacing.md,
    alignItems: 'center',
    // Shadow cast upward on iOS; elevation on Android
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 24,
  },

  // Drag handle
  handle: {
    width: 36,
    height: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceElevated,
    marginBottom: Spacing.xl,
  } as const,

  // Icon badge
  iconBadge: {
    width: ICON_BADGE_SIZE,
    height: ICON_BADGE_SIZE,
    borderRadius: ICON_BADGE_SIZE / 2,
    backgroundColor: Colors.brandVioletLight,  // Mist — matches AI palette
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.base,
    // Subtle glow so the icon pops on white
    shadowColor: Colors.brandBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },

  // Eyebrow
  eyebrow: {
    fontSize: Typography.sizes.xs,
    fontWeight: '700' as const,
    color: Colors.brandBlue,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },

  // Headline
  headline: {
    fontSize: Typography.sizes.xl,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: Spacing.sm,
  },

  // Benefit body copy
  benefit: {
    fontSize: Typography.sizes.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: Typography.sizes.base * Typography.lineHeights.relaxed,
    marginBottom: Spacing.lg,
    maxWidth: 300,
  },

  // Trust row
  trustRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },

  trustPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },

  trustPillText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },

  // Primary button
  allowButton: {
    width: '100%',
    height: 54,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.brandBlue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    // Shadow using the theme glow helper values inline
    shadowColor: Colors.brandBlue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },

  allowButtonIcon: {
    marginRight: Spacing.sm,
  },

  allowButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: '700' as const,
    color: Colors.textOnBrand,
    letterSpacing: 0.1,
  },

  // Dismiss text button
  dismissButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },

  dismissButtonText: {
    fontSize: Typography.sizes.sm,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },

  // iOS home-indicator clearance (34 px on modern iPhones, 0 on Android)
  homeIndicatorSpacer: {
    height: Platform.OS === 'ios' ? 34 : Spacing.base,
  },
});
