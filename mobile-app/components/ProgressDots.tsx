/**
 * Mapai — Progress Dots
 * 4-step progress indicator for onboarding screens.
 */

import React from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Colors, Spacing } from '@/constants/theme';

const TOTAL_STEPS = 4;
const DOT_SIZE = 8;
const DOT_ACTIVE_WIDTH = 24;

interface ProgressDotsProps {
  currentStep: number; // 1-based
}

export default function ProgressDots({ currentStep }: ProgressDotsProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: TOTAL_STEPS }, (_, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === currentStep;
        const isCompleted = stepNum < currentStep;

        return (
          <View
            key={i}
            style={[
              styles.dot,
              isActive && styles.dotActive,
              isCompleted && styles.dotCompleted,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: Colors.surfaceElevated,
  },
  dotActive: {
    width: DOT_ACTIVE_WIDTH,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: Colors.brandBlue,
  },
  dotCompleted: {
    backgroundColor: Colors.brandBlue,
  },
});
