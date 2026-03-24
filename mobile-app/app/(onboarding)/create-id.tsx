/**
 * Mapai — Create ID Screen
 * Step 2: Display name + username with @ prefix, live validation.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import ProgressDots from '@/components/ProgressDots';
import { useOnboardingStore } from '@/store/onboardingStore';

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

// Username rules: 3-20 chars, lowercase letters, numbers, underscores
const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

export default function CreateIdScreen() {
  const router = useRouter();
  const { displayName, username, setDisplayName, setUsername } = useOnboardingStore();

  const [localName, setLocalName] = useState(displayName);
  const [localUsername, setLocalUsername] = useState(username);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isFormValid =
    localName.trim().length > 0 &&
    localUsername.length >= 3 &&
    usernameStatus === 'available';

  const handleUsernameChange = useCallback((text: string) => {
    // Normalize: lowercase, strip spaces
    const normalized = text.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setLocalUsername(normalized);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (normalized.length < 3) {
      setUsernameStatus(normalized.length === 0 ? 'idle' : 'invalid');
      return;
    }

    if (!USERNAME_REGEX.test(normalized)) {
      setUsernameStatus('invalid');
      return;
    }

    setUsernameStatus('checking');
    debounceRef.current = setTimeout(() => {
      checkUsernameAvailability(normalized);
    }, 500);
  }, []);

  // Mock availability check — real backend call later
  const checkUsernameAvailability = async (name: string) => {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Mock: these usernames are "taken"
    const takenUsernames = ['admin', 'mapai', 'test', 'user'];
    if (takenUsernames.includes(name)) {
      setUsernameStatus('taken');
    } else {
      setUsernameStatus('available');
    }
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleContinue = () => {
    Keyboard.dismiss();
    setDisplayName(localName.trim());
    setUsername(localUsername);
    router.push('/(onboarding)/find-friends');
  };

  const renderUsernameHint = () => {
    switch (usernameStatus) {
      case 'checking':
        return (
          <View style={styles.hintRow}>
            <ActivityIndicator size="small" color={Colors.textTertiary} />
            <Text style={styles.hintText}>Checking availability...</Text>
          </View>
        );
      case 'available':
        return (
          <View style={styles.hintRow}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
            <Text style={[styles.hintText, { color: Colors.success }]}>
              @{localUsername} is available
            </Text>
          </View>
        );
      case 'taken':
        return (
          <View style={styles.hintRow}>
            <Ionicons name="close-circle" size={16} color={Colors.error} />
            <Text style={[styles.hintText, { color: Colors.error }]}>
              @{localUsername} is taken
            </Text>
          </View>
        );
      case 'invalid':
        return (
          <View style={styles.hintRow}>
            <Text style={[styles.hintText, { color: Colors.textTertiary }]}>
              3-20 characters, letters, numbers, underscores
            </Text>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ProgressDots currentStep={2} />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Create your identity</Text>
          <Text style={styles.subtitle}>
            This is how people will find and recognize you on Mapai.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Display Name</Text>
            <TextInput
              style={[styles.input, localName.trim() && styles.inputFocused]}
              placeholder="Your name"
              placeholderTextColor={Colors.textTertiary}
              value={localName}
              onChangeText={setLocalName}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <View style={styles.usernameInputWrap}>
              <Text style={styles.atPrefix}>@</Text>
              <TextInput
                style={[styles.usernameInput, usernameStatus === 'available' && styles.inputFocused]}
                placeholder="username"
                placeholderTextColor={Colors.textTertiary}
                value={localUsername}
                onChangeText={handleUsernameChange}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                returnKeyType="done"
                onSubmitEditing={() => isFormValid && handleContinue()}
              />
            </View>
            {renderUsernameHint()}
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.primaryButton, !isFormValid && styles.primaryButtonDisabled]}
            onPress={handleContinue}
            disabled={!isFormValid}
            activeOpacity={0.8}
          >
            <Text style={[styles.buttonText, !isFormValid && styles.buttonTextDisabled]}>
              Continue
            </Text>
            <Ionicons
              name="arrow-forward"
              size={20}
              color={isFormValid ? Colors.textOnBrand : Colors.textTertiary}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.base,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    marginBottom: Spacing.base,
  },
  title: {
    fontWeight: '700',
    fontSize: Typography.sizes.xl,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: Typography.sizes.base,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  form: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing['2xl'],
    gap: Spacing.xl,
  },
  inputGroup: {
    gap: Spacing.sm,
  },
  label: {
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: Colors.surface,
    height: 56,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.base,
    color: Colors.textPrimary,
    fontSize: Typography.sizes.md,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
  },
  inputFocused: {
    borderColor: Colors.brandBlue,
    backgroundColor: Colors.background,
  },
  usernameInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    height: 56,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.base,
  },
  atPrefix: {
    fontSize: Typography.sizes.md,
    color: Colors.textTertiary,
    fontWeight: '500',
    marginRight: 2,
  },
  usernameInput: {
    flex: 1,
    height: 56,
    color: Colors.textPrimary,
    fontSize: Typography.sizes.md,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  hintText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textTertiary,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['3xl'],
    paddingTop: Spacing.base,
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
  primaryButtonDisabled: {
    backgroundColor: Colors.surfaceElevated,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    fontWeight: '600',
    fontSize: Typography.sizes.md,
    color: Colors.textOnBrand,
  },
  buttonTextDisabled: {
    color: Colors.textTertiary,
  },
});
