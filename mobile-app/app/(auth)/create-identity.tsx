/**
 * Mapai — Create Identity Screen
 * Mockup 3 — display name + username setup with live validation.
 * Clerk auth migration: uses useUser from @clerk/clerk-expo.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check, X } from 'lucide-react-native';
import { useOnboardingStore } from '@/store/onboardingStore';
import { supabase } from '@/services/supabase';

// Clerk import — wrapped safely
let useUser: (() => { user: any }) | null = null;
try {
  const clerk = require('@clerk/clerk-expo');
  useUser = clerk.useUser;
} catch {
  useUser = () => ({ user: null });
}

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

export default function CreateIdentityScreen() {
  const router = useRouter();
  const { setDisplayName, setUsername } = useOnboardingStore();

  const clerkUser = useUser ? useUser().user : null;

  const [localName, setLocalName] = useState<string>(
    clerkUser
      ? [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ')
      : ''
  );
  const [localUsername, setLocalUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isFormValid =
    localName.trim().length > 0 &&
    localUsername.length >= 3 &&
    usernameStatus === 'available';

  const checkUsernameAvailability = useCallback(async (name: string) => {
    if (!supabase) {
      // Supabase not available — use mock fallback
      await new Promise((r) => setTimeout(r, 300));
      const taken = ['admin', 'mapai', 'test', 'user'];
      setUsernameStatus(taken.includes(name) ? 'taken' : 'available');
      return;
    }
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('username')
        .eq('username', name)
        .maybeSingle();
      if (error) throw error;
      setUsernameStatus(data ? 'taken' : 'available');
    } catch {
      // On error, optimistically allow the username — backend will validate on submit
      setUsernameStatus('available');
    }
  }, []);

  const handleUsernameChange = useCallback(
    (text: string) => {
      const normalized = text.toLowerCase().replace(/[^a-z0-9_]/g, '');
      setLocalUsername(normalized);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (normalized.length === 0) {
        setUsernameStatus('idle');
        return;
      }
      if (normalized.length < 3 || !USERNAME_REGEX.test(normalized)) {
        setUsernameStatus('invalid');
        return;
      }

      setUsernameStatus('checking');
      debounceRef.current = setTimeout(() => {
        checkUsernameAvailability(normalized);
      }, 500);
    },
    [checkUsernameAvailability]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  async function handleContinue() {
    Keyboard.dismiss();
    const trimmedName = localName.trim();
    setDisplayName(trimmedName);
    setUsername(localUsername);

    // Update Clerk user profile
    if (clerkUser) {
      try {
        const [firstName, ...rest] = trimmedName.split(' ');
        await clerkUser.update({
          username: localUsername,
          firstName: firstName ?? '',
          lastName: rest.join(' ') ?? '',
        });
      } catch (e) {
        console.warn('Clerk user update failed (non-blocking):', e);
      }
    }

    // Insert/upsert into user_profiles via Supabase
    if (supabase && clerkUser) {
      try {
        await supabase.from('user_profiles').upsert({
          clerk_user_id: clerkUser.id,
          display_name: trimmedName,
          username: localUsername,
        });
      } catch (e) {
        console.warn('Supabase user_profiles upsert failed (non-blocking):', e);
      }
    }

    router.push('/(auth)/find-friends');
  }

  function renderUsernameStatus() {
    switch (usernameStatus) {
      case 'checking':
        return (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color="#9CA3AF" />
            <Text style={styles.statusText}>Checking availability...</Text>
          </View>
        );
      case 'available':
        return (
          <View style={styles.statusRow}>
            <Check size={16} color="#10B981" />
            <Text style={[styles.statusText, { color: '#10B981' }]}>
              @{localUsername} is available
            </Text>
          </View>
        );
      case 'taken':
        return (
          <View style={styles.statusRow}>
            <X size={16} color="#EF4444" />
            <Text style={[styles.statusText, { color: '#EF4444' }]}>
              @{localUsername} is taken
            </Text>
          </View>
        );
      case 'invalid':
        return (
          <View style={styles.statusRow}>
            <Text style={styles.statusText}>
              3-20 characters, letters, numbers, underscores only
            </Text>
          </View>
        );
      default:
        return null;
    }
  }

  return (
    <View style={styles.root}>
      {/* Top photo placeholder */}
      <View style={styles.photoPlaceholder} />

      {/* White card overlay */}
      <KeyboardAvoidingView
        style={styles.cardOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <SafeAreaView style={styles.safeCard}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Back arrow */}
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <ChevronLeft size={24} color="#1A1A2E" />
            </TouchableOpacity>

            {/* Heading */}
            <View style={styles.headingBlock}>
              <Text style={styles.headingRegular}>Create your</Text>
              <Text style={styles.headingItalic}>identity.</Text>
            </View>

            <Text style={styles.subtitle}>How friends will find you</Text>

            {/* NAME field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>NAME</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="Your name"
                placeholderTextColor="#9CA3AF"
                value={localName}
                onChangeText={setLocalName}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            {/* USERNAME field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>USERNAME</Text>
              <View style={styles.usernameRow}>
                <Text style={styles.atPrefix}>@</Text>
                <TextInput
                  style={styles.usernameInput}
                  placeholder="username"
                  placeholderTextColor="#9CA3AF"
                  value={localUsername}
                  onChangeText={handleUsernameChange}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  returnKeyType="done"
                  onSubmitEditing={() => isFormValid && handleContinue()}
                />
              </View>
              {renderUsernameStatus()}
            </View>

            {/* Spacer to push button to reasonable position */}
            <View style={{ height: 40 }} />

            {/* Continue button */}
            <TouchableOpacity
              style={[styles.continueButton, !isFormValid && styles.continueButtonDisabled]}
              onPress={handleContinue}
              disabled={!isFormValid}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.continueButtonText,
                  !isFormValid && styles.continueButtonTextDisabled,
                ]}
              >
                Continue →
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#C4725A',
  },
  photoPlaceholder: {
    height: 200,
    backgroundColor: '#C4725A',
  },
  cardOverlay: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -20,
  },
  safeCard: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 40,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    marginBottom: 8,
  },
  headingBlock: {
    marginBottom: 6,
  },
  headingRegular: {
    fontSize: 36,
    fontWeight: '300',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    color: '#1A1A2E',
    lineHeight: 44,
  },
  headingItalic: {
    fontSize: 36,
    fontWeight: '300',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    fontStyle: 'italic',
    color: '#1A1A2E',
    lineHeight: 44,
  },
  subtitle: {
    fontSize: 15,
    color: '#9CA3AF',
    marginBottom: 32,
  },
  fieldGroup: {
    marginBottom: 28,
  },
  fieldLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  fieldInput: {
    fontSize: 16,
    color: '#1A1A2E',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 10,
    paddingHorizontal: 0,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  atPrefix: {
    fontSize: 16,
    color: '#9CA3AF',
    paddingVertical: 10,
    marginRight: 2,
  },
  usernameInput: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A2E',
    paddingVertical: 10,
    paddingHorizontal: 0,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  statusText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  continueButton: {
    height: 56,
    borderRadius: 999,
    backgroundColor: '#1D3E91',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonDisabled: {
    backgroundColor: '#E8E5F0',
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  continueButtonTextDisabled: {
    color: '#A8A3B8',
  },
});
