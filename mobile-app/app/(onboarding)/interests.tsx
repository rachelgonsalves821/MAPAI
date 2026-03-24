import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';

const INTERESTS = [
  { id: 'food', label: 'Food & Drink', icon: 'restaurant-outline' },
  { id: 'nightlife', label: 'Nightlife', icon: 'beer-outline' },
  { id: 'culture', label: 'Art & Culture', icon: 'color-palette-outline' },
  { id: 'outdoors', label: 'Outdoors', icon: 'leaf-outline' },
  { id: 'shopping', label: 'Shopping', icon: 'cart-outline' },
  { id: 'gems', label: 'Hidden Gems', icon: 'diamond-outline' },
  { id: 'music', label: 'Live Music', icon: 'musical-notes-outline' },
  { id: 'coffee', label: 'Coffee Shops', icon: 'cafe-outline' },
  { id: 'work', label: 'Work Friendly', icon: 'laptop-outline' },
  { id: 'vibey', label: 'Vibey Spots', icon: 'sparkles-outline' },
];

export default function InterestsScreen() {
  const router = useRouter();
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);

  const toggleInterest = (id: string) => {
    setSelectedInterests((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>What are you looking for?</Text>
        <Text style={styles.subtitle}>Select at least 3 to help mapai get to know you.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.interestsGrid}>
          {INTERESTS.map((interest) => {
            const isSelected = selectedInterests.includes(interest.id);
            return (
              <TouchableOpacity
                key={interest.id}
                style={[
                  styles.interestChip,
                  isSelected && styles.interestChipSelected,
                ]}
                onPress={() => toggleInterest(interest.id)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={interest.icon as any}
                  size={20}
                  color={isSelected ? Colors.textOnBrand : Colors.textSecondary}
                />
                <Text
                  style={[
                    styles.interestLabel,
                    isSelected && styles.interestLabelSelected,
                  ]}
                >
                  {interest.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            selectedInterests.length < 3 && styles.primaryButtonDisabled,
          ]}
          onPress={() => {
            if (selectedInterests.length >= 3) {
              router.push({
                pathname: '/(onboarding)/preferences',
                params: { interests: selectedInterests.join(',') },
              });
            }
          }}
          disabled={selectedInterests.length < 3}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Next Step</Text>
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
    fontWeight: '700',
    fontSize: Typography.sizes.xl,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.sizes.base,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  interestsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  interestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    minWidth: '45%',
    flexGrow: 1,
    gap: Spacing.sm,
  },
  interestChipSelected: {
    backgroundColor: Colors.brandBlue,
    borderColor: Colors.brandBlue,
  },
  interestLabel: {
    fontWeight: '500',
    fontSize: Typography.sizes.base,
    color: Colors.textSecondary,
  },
  interestLabelSelected: {
    color: Colors.textOnBrand,
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
