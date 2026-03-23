import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '@/services/api/client';
import { useAuth } from '@/context/AuthContext';

export default function ProfileScreen() {
  const router = useRouter();
  const { interests } = useLocalSearchParams<{ interests: string }>();
  const { updateUser } = useAuth();

  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter your name to continue.');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const selectedInterests = interests ? interests.split(',') : [];
      
      // Map interests to the schema expected by the backend
      const payload = {
        display_name: name,
        preferences: {
          cuisine_preferences: selectedInterests.filter(i => ['food', 'coffee', 'gems'].includes(i)),
          ambiance_preferences: selectedInterests.filter(i => ['nightlife', 'culture', 'outdoors', 'music', 'work', 'vibey'].includes(i)),
          dietary_restrictions: [],
          price_range: { min: 1, max: 3 },
        }
      };

      const response = await apiClient.post('/v1/user/onboarding', payload);
      
      if (response.data.success) {
        // Mark onboarding complete BEFORE navigating to prevent routing loop
        updateUser({ onboardingComplete: true });
        router.replace('/(tabs)');
      } else {
        throw new Error('Onboarding failed');
      }
    } catch (error) {
      console.error('Error during onboarding:', error);
      Alert.alert(
        'Setup Error',
        'We couldn\'t save your profile. Would you like to try again?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Try Again', onPress: handleSubmit }
        ]
      );
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

      <View style={styles.content}>
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

        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>Your Interests</Text>
          <View style={styles.badgeRow}>
            {interests?.split(',').map(tag => (
              <View key={tag} style={styles.badge}>
                <Text style={styles.badgeText}>{tag.replace(/^\w/, c => c.toUpperCase())}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

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
  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
  },
  inputContainer: {
    marginBottom: Spacing['3xl'],
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
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  badge: {
    backgroundColor: 'rgba(5, 88, 232, 0.15)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  badgeText: {
    fontSize: Typography.sizes.sm,
    fontWeight: '500',
    color: Colors.brandBlue,
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
