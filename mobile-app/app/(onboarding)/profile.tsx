/**
 * Mapai — Onboarding Profile Screen (Final Step)
 * Collects display name + shows summary of all selections.
 * Saves preferences to backend + Zustand store.
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '@/services/api/client';
import { useAuth } from '@/context/AuthContext';
import { useAuthStore } from '@/store/authStore';
import { useOnboardingStore } from '@/store/onboardingStore';

export default function ProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    interests: string;
    priceRange: string;
    ambiance: string;
    serviceSpeed: string;
  }>();
  const { updateUser, user } = useAuth();
  const authStore = useAuthStore();
  const onboardingStore = useOnboardingStore();

  const [name, setName] = useState(user?.displayName || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedInterests = params.interests ? params.interests.split(',') : [];
  const selectedPrices = params.priceRange ? params.priceRange.split(',') : [];
  const selectedAmbiance = params.ambiance ? params.ambiance.split(',') : [];
  const selectedSpeed = params.serviceSpeed || 'moderate';

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter your name to continue.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Build price range from selections
      const priceMap: Record<string, number> = {
        budget: 1,
        moderate: 2,
        upscale: 3,
        splurge: 4,
      };
      const priceNums = selectedPrices.map((p) => priceMap[p] || 2);
      const priceRange = {
        min: Math.min(...(priceNums.length > 0 ? priceNums : [1])),
        max: Math.max(...(priceNums.length > 0 ? priceNums : [3])),
      };

      // Map interests to cuisine preferences
      const cuisinePrefs = selectedInterests.filter((i) =>
        ['food', 'coffee', 'gems'].includes(i)
      );
      const ambiancePrefs = [
        ...selectedInterests.filter((i) =>
          ['nightlife', 'culture', 'outdoors', 'music', 'work', 'vibey'].includes(i)
        ),
        ...selectedAmbiance,
      ];

      const payload = {
        display_name: name,
        preferences: {
          cuisine_preferences: cuisinePrefs,
          ambiance_preferences: ambiancePrefs,
          dietary_restrictions: [],
          price_range: priceRange,
        },
      };

      // Save to backend (non-blocking)
      try {
        await apiClient.post('/v1/user/onboarding', payload);
      } catch (apiErr) {
        console.warn('Backend onboarding call failed (non-blocking):', apiErr);
      }

      // Save to Zustand stores
      const fullPreferences = {
        categories: selectedInterests,
        priceRange: selectedPrices,
        ambiance: selectedAmbiance,
        serviceSpeed: selectedSpeed,
        dietaryRestrictions: [],
      };

      authStore.updatePreferences(fullPreferences);
      onboardingStore.setPreferences(fullPreferences);
      onboardingStore.complete();

      // Mark onboarding complete in AuthContext and navigate
      updateUser({ displayName: name, onboardingComplete: true });
      router.replace('/home');
    } catch (error) {
      console.error('Error during onboarding:', error);
      updateUser({ displayName: name, onboardingComplete: true });
      router.replace('/home');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>All set! Who are we speaking with?</Text>
        <Text style={styles.subtitle}>Last step to personalize your experience.</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Rachel Gonsalves"
            placeholderTextColor={Colors.textTertiary}
            value={name}
            onChangeText={setName}
            autoFocus
            autoCapitalize="words"
          />
        </View>

        {/* Summary: Interests */}
        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>Your Interests</Text>
          <View style={styles.badgeRow}>
            {selectedInterests.map((tag) => (
              <View key={tag} style={styles.badge}>
                <Text style={styles.badgeText}>
                  {tag.replace(/^\w/, (c) => c.toUpperCase())}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Summary: Preferences */}
        {(selectedPrices.length > 0 || selectedAmbiance.length > 0 || selectedSpeed) && (
          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>Your Preferences</Text>

            {selectedPrices.length > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Price</Text>
                <View style={styles.badgeRow}>
                  {selectedPrices.map((p) => (
                    <View key={p} style={styles.badgeMuted}>
                      <Text style={styles.badgeMutedText}>
                        {p.replace(/^\w/, (c) => c.toUpperCase())}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {selectedAmbiance.length > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Ambiance</Text>
                <View style={styles.badgeRow}>
                  {selectedAmbiance.map((a) => (
                    <View key={a} style={styles.badgeMuted}>
                      <Text style={styles.badgeMutedText}>
                        {a.replace(/^\w/, (c) => c.toUpperCase())}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {selectedSpeed && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Pace</Text>
                <View style={styles.badgeMuted}>
                  <Text style={styles.badgeMutedText}>
                    {selectedSpeed.replace(/^\w/, (c) => c.toUpperCase())}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, !name.trim() && styles.primaryButtonDisabled]}
          onPress={handleSubmit}
          disabled={!name.trim() || isSubmitting}
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator color={Colors.textOnBrand} />
          ) : (
            <Text style={styles.buttonText}>Finish Setup</Text>
          )}
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
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.base,
  },
  backButton: {
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.sizes.base,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  inputContainer: {
    marginBottom: Spacing.base,
  },
  label: {
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
    color: Colors.brandBlue,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: '#F9FAFB',
    height: 56,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.base,
    color: Colors.textPrimary,
    fontSize: Typography.sizes.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  summaryBox: {
    backgroundColor: Colors.surfaceElevated,
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  summaryTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.base,
  },
  summaryRow: {
    marginBottom: Spacing.md,
  },
  summaryLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  badge: {
    backgroundColor: 'rgba(29, 62, 145, 0.12)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  badgeText: {
    fontSize: Typography.sizes.sm,
    fontWeight: '500',
    color: Colors.brandBlue,
  },
  badgeMuted: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  badgeMutedText: {
    fontSize: Typography.sizes.sm,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.base,
  },
  primaryButton: {
    backgroundColor: Colors.brandBlue,
    height: 56,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: Colors.surfaceElevated,
    opacity: 0.5,
  },
  buttonText: {
    fontSize: Typography.sizes.md,
    fontWeight: '600',
    color: Colors.textOnBrand,
  },
});
