/**
 * Mapai — Onboarding Preferences Screen
 * Step 3: Price range, ambiance, and service speed selection.
 * All tap UI — no text inputs.
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';

// ─── Option Data ─────────────────────────────────────────

const PRICE_OPTIONS = [
  { id: 'budget', label: '$', description: 'Budget-friendly' },
  { id: 'moderate', label: '$$', description: 'Moderate' },
  { id: 'upscale', label: '$$$', description: 'Upscale' },
  { id: 'splurge', label: '$$$$', description: 'Special occasions' },
];

const AMBIANCE_OPTIONS = [
  { id: 'cozy', label: 'Cozy & Quiet', icon: 'cafe-outline' },
  { id: 'vibey', label: 'Vibey & Trendy', icon: 'sparkles-outline' },
  { id: 'lively', label: 'Lively & Social', icon: 'people-outline' },
  { id: 'outdoor', label: 'Outdoor & Open', icon: 'leaf-outline' },
  { id: 'intimate', label: 'Intimate & Dark', icon: 'moon-outline' },
  { id: 'work', label: 'Work-Friendly', icon: 'laptop-outline' },
];

const SPEED_OPTIONS = [
  { id: 'relaxed', label: 'Relaxed', description: 'No rush, enjoy the experience' },
  { id: 'moderate', label: 'Moderate', description: 'Normal pace is fine' },
  { id: 'fast', label: 'Fast', description: 'In & out, efficient service' },
];

// ─── Screen ──────────────────────────────────────────────

export default function PreferencesScreen() {
  const router = useRouter();
  const { interests } = useLocalSearchParams<{ interests: string }>();

  const [selectedPrices, setSelectedPrices] = useState<string[]>([]);
  const [selectedAmbiance, setSelectedAmbiance] = useState<string[]>([]);
  const [selectedSpeed, setSelectedSpeed] = useState<string>('');

  const togglePrice = (id: string) => {
    setSelectedPrices((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const toggleAmbiance = (id: string) => {
    setSelectedAmbiance((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const canContinue = selectedPrices.length > 0 && selectedSpeed !== '';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Your vibe, your call</Text>
        <Text style={styles.subtitle}>
          Help mapai personalize your experience.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Price Range */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Price Range</Text>
          <Text style={styles.sectionHint}>Select all that work for you</Text>
          <View style={styles.optionRow}>
            {PRICE_OPTIONS.map((option) => {
              const isSelected = selectedPrices.includes(option.id);
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.priceChip, isSelected && styles.chipSelected]}
                  onPress={() => togglePrice(option.id)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.priceLabel,
                      isSelected && styles.labelSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                  <Text
                    style={[
                      styles.priceDesc,
                      isSelected && styles.descSelected,
                    ]}
                  >
                    {option.description}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Ambiance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ambiance</Text>
          <Text style={styles.sectionHint}>What kind of places do you love?</Text>
          <View style={styles.ambianceGrid}>
            {AMBIANCE_OPTIONS.map((option) => {
              const isSelected = selectedAmbiance.includes(option.id);
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.ambianceChip,
                    isSelected && styles.chipSelected,
                  ]}
                  onPress={() => toggleAmbiance(option.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={option.icon as any}
                    size={20}
                    color={isSelected ? Colors.textOnBrand : Colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.ambianceLabel,
                      isSelected && styles.labelSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Service Speed */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service Speed</Text>
          <Text style={styles.sectionHint}>How do you like to dine?</Text>
          <View style={styles.speedList}>
            {SPEED_OPTIONS.map((option) => {
              const isSelected = selectedSpeed === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.speedChip, isSelected && styles.chipSelected]}
                  onPress={() => setSelectedSpeed(option.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.speedContent}>
                    <Text
                      style={[
                        styles.speedLabel,
                        isSelected && styles.labelSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                    <Text
                      style={[
                        styles.speedDesc,
                        isSelected && styles.descSelected,
                      ]}
                    >
                      {option.description}
                    </Text>
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={22} color={Colors.textOnBrand} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            !canContinue && styles.primaryButtonDisabled,
          ]}
          onPress={() => {
            if (canContinue) {
              router.push({
                pathname: '/(onboarding)/profile',
                params: {
                  interests: interests || '',
                  priceRange: selectedPrices.join(','),
                  ambiance: selectedAmbiance.join(','),
                  serviceSpeed: selectedSpeed,
                },
              });
            }
          }}
          disabled={!canContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Almost Done</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────

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
    fontWeight: '700',
    fontSize: Typography.sizes.xl,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.sizes.base,
    color: Colors.textSecondary,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['3xl'],
  },
  section: {
    marginTop: Spacing.xl,
  },
  sectionTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  sectionHint: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.base,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  priceChip: {
    flex: 1,
    minWidth: '22%',
    alignItems: 'center',
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  chipSelected: {
    backgroundColor: Colors.brandBlue,
    borderColor: Colors.brandBlue,
  },
  priceLabel: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  priceDesc: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  labelSelected: {
    color: Colors.textOnBrand,
  },
  descSelected: {
    color: 'rgba(255,255,255,0.7)',
  },
  ambianceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  ambianceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    minWidth: '45%',
    flexGrow: 1,
  },
  ambianceLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  speedList: {
    gap: Spacing.sm,
  },
  speedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  speedContent: {
    flex: 1,
  },
  speedLabel: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  speedDesc: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    marginTop: 2,
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
    fontWeight: '600',
    fontSize: Typography.sizes.md,
    color: Colors.textOnBrand,
  },
});
