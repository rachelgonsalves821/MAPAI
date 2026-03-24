/**
 * Mapai — Onboarding Completion Screen
 * Step 4: Success confirmation, personalized message, enter app.
 */

import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import ProgressDots from '@/components/ProgressDots';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useAuth } from '@/context/AuthContext';
import { useAuthStore } from '@/store/authStore';
import apiClient from '@/services/api/client';

export default function CompleteScreen() {
  const router = useRouter();
  const { displayName, username, selectedFriends, complete } = useOnboardingStore();
  const { updateUser } = useAuth();
  const authStore = useAuthStore();

  // Entrance animation
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const friendCount = selectedFriends.length;
  const friendText =
    friendCount === 0
      ? "Let's explore."
      : friendCount === 1
        ? '1 friend connected. Let\u2019s explore.'
        : `${friendCount} friends connected. Let\u2019s explore.`;

  const handleOpenMap = async () => {
    // Save to backend (non-blocking)
    try {
      await apiClient.post('/v1/user/onboarding', {
        display_name: displayName,
        username,
        friends: selectedFriends,
      });
    } catch {
      console.warn('Backend onboarding save failed (non-blocking)');
    }

    // Update stores
    complete();
    authStore.setUser({
      id: 'dev-user-001',
      username,
      displayName,
      preferences: {
        categories: [],
        priceRange: [],
        ambiance: [],
        serviceSpeed: '',
        dietaryRestrictions: [],
      },
      social: {
        friendsCount: friendCount,
        mutuals: 0,
      },
    });

    // Mark complete in AuthContext — triggers route guard → /home
    updateUser({
      displayName,
      username,
      onboardingComplete: true,
    });

    router.replace('/home');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ProgressDots currentStep={4} />

      <View style={styles.content}>
        <Animated.View
          style={[
            styles.checkContainer,
            { transform: [{ scale: scaleAnim }] },
          ]}
        >
          <Ionicons name="checkmark-circle" size={80} color={Colors.success} />
        </Animated.View>

        <Animated.View style={[styles.textContainer, { opacity: fadeAnim }]}>
          <Text style={styles.title}>
            You're all set, {displayName || 'Explorer'}
          </Text>
          <Text style={styles.subtitle}>{friendText}</Text>
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleOpenMap}
          activeOpacity={0.8}
        >
          <Ionicons name="map" size={20} color={Colors.textOnBrand} />
          <Text style={styles.buttonText}>Open my map</Text>
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
  checkContainer: {
    marginBottom: Spacing['2xl'],
  },
  textContainer: {
    alignItems: 'center',
  },
  title: {
    fontWeight: '700',
    fontSize: Typography.sizes.xl,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  subtitle: {
    fontSize: Typography.sizes.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
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
