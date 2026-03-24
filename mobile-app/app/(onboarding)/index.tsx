/**
 * Mapai — Onboarding Welcome Screen
 * Step 1: Centered icon, title, subtitle, 3 feature bullets, primary CTA.
 */

import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import ProgressDots from '@/components/ProgressDots';

const FEATURES = [
  { icon: 'compass-outline' as const, text: 'AI-powered place discovery tailored to you' },
  { icon: 'people-outline' as const, text: 'See where your friends go and what they love' },
  { icon: 'map-outline' as const, text: 'Your personal map that learns your taste' },
];

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ProgressDots currentStep={1} />

      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="navigate" size={48} color={Colors.brandBlue} />
        </View>

        <Text style={styles.title}>Welcome to Mapai</Text>
        <Text style={styles.subtitle}>
          Your AI-native discovery co-pilot.{'\n'}Personal, proactive, and built for you.
        </Text>

        <View style={styles.featuresContainer}>
          {FEATURES.map((feature, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={styles.featureIconWrap}>
                <Ionicons name={feature.icon} size={20} color={Colors.brandBlue} />
              </View>
              <Text style={styles.featureText}>{feature.text}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/(onboarding)/create-id')}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Get started</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.textOnBrand} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing['2xl'],
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: Colors.brandVioletLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing['2xl'],
    ...Shadows.sm,
  },
  title: {
    fontWeight: '700',
    fontSize: Typography.sizes['2xl'],
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  subtitle: {
    fontSize: Typography.sizes.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing['3xl'],
  },
  featuresContainer: {
    width: '100%',
    gap: Spacing.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
  },
  featureIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    flex: 1,
    fontSize: Typography.sizes.base,
    color: Colors.textPrimary,
    fontWeight: '400',
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['3xl'],
  },
  primaryButton: {
    backgroundColor: Colors.brandBlue,
    height: 56,
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadows.md,
  },
  buttonText: {
    fontWeight: '600',
    fontSize: Typography.sizes.md,
    color: Colors.textOnBrand,
  },
});
