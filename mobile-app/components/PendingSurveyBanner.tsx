/**
 * Mapai — Pending Survey Banner
 * Shown on the home/map tab when the user has an unfinished arrival survey
 * from a previous session. Tapping it opens the SurveyModal inline.
 *
 * Rendered as a floating pill above the bottom tab bar so it never blocks
 * map content. Auto-hides once the survey is completed or dismissed.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { usePendingSurvey } from '@/services/api/survey';
import SurveyModal from '@/components/SurveyModal';

export default function PendingSurveyBanner() {
  const { data: pendingSurvey, isLoading } = usePendingSurvey();
  const [dismissed, setDismissed] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Track the survey id so we don't re-show after dismiss
  const shownSurveyId = useRef<string | null>(null);

  const slideAnim = useRef(new Animated.Value(60)).current;

  // Slide in when a fresh pending survey arrives
  useEffect(() => {
    if (!pendingSurvey || dismissed || isLoading) return;
    if (shownSurveyId.current === pendingSurvey.id) return; // already shown this one

    shownSurveyId.current = pendingSurvey.id;

    Animated.spring(slideAnim, {
      toValue: 0,
      tension: 100,
      friction: 9,
      useNativeDriver: true,
    }).start();
  }, [pendingSurvey, dismissed, isLoading]);

  const hide = () => {
    Animated.timing(slideAnim, {
      toValue: 80,
      duration: 220,
      useNativeDriver: true,
    }).start(() => setDismissed(true));
  };

  if (!pendingSurvey || dismissed) return null;

  return (
    <>
      <Animated.View
        style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.pill}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Complete your pending survey to earn points"
        >
          <View style={styles.iconWrap}>
            <Ionicons name="clipboard-outline" size={16} color={Colors.brandBlue} />
          </View>
          <View style={styles.textWrap}>
            <Text style={styles.label}>Survey waiting</Text>
            <Text style={styles.sub}>Tap to complete and earn points</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.brandBlue} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dismissBtn}
          onPress={hide}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss pending survey banner"
        >
          <Ionicons name="close" size={16} color={Colors.textTertiary} />
        </TouchableOpacity>
      </Animated.View>

      <SurveyModal
        visible={modalVisible}
        survey={pendingSurvey}
        onComplete={() => {
          setModalVisible(false);
          hide();
        }}
        onSkip={() => {
          setModalVisible(false);
          // Keep banner visible — user may want to come back to it
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    bottom: 104, // above tab bar (88px iOS tab bar + 16px gap)
    left: Spacing.base,
    right: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    zIndex: 200,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    borderWidth: 1.5,
    borderColor: Colors.brandBlue + '30',
    ...Shadows.md,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.brandBlue + '12',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
  },
  label: {
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  sub: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  dismissBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...Shadows.sm,
  },
});
