/**
 * Mapai — Delete Account Screen
 * Apple App Store requirement: in-app account deletion.
 * Requires typing "DELETE" to confirm.
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Linking,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useAuthStore } from '@/store/authStore';
import { useOnboardingStore } from '@/store/onboardingStore';
import apiClient from '@/services/api/client';

type ScreenState = 'idle' | 'loading' | 'error';

const DELETION_ITEMS = [
  { icon: 'person-outline', text: 'User profile and preferences' },
  { icon: 'chatbubbles-outline', text: 'Conversation history' },
  { icon: 'brain-outline', text: 'Memory model and all stored preferences' },
  { icon: 'heart-outline', text: 'Loved places and saved locations' },
  { icon: 'people-outline', text: 'Friend connections (mutual removal)' },
];

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [confirmText, setConfirmText] = useState('');
  const [screenState, setScreenState] = useState<ScreenState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const isConfirmed = confirmText === 'DELETE';

  const handleDelete = async () => {
    if (!isConfirmed) return;

    setScreenState('loading');
    setErrorMessage('');

    try {
      await apiClient.delete('/v1/user/account');

      // Clear all local state
      useAuthStore.getState().logout();
      useOnboardingStore.getState().reset();
      await signOut();

      router.replace('/(auth)/landing');
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.title ||
        err.message ||
        'Account deletion failed. Please try again or contact support.';
      setErrorMessage(msg);
      setScreenState('error');
    }
  };

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@mapai.app?subject=Account%20Deletion%20Issue');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#111827" />
            </TouchableOpacity>
            <Text style={styles.title}>Delete Account</Text>
          </View>

          {/* Warning banner */}
          <View style={styles.warningBanner}>
            <Ionicons name="warning" size={20} color="#B91C1C" />
            <Text style={styles.warningText}>
              This action is permanent and cannot be undone.
            </Text>
          </View>

          {/* What will be deleted */}
          <Text style={styles.sectionTitle}>What will be deleted</Text>
          <View style={styles.itemList}>
            {DELETION_ITEMS.map((item, i) => (
              <View key={i} style={styles.itemRow}>
                <View style={styles.itemIconWrap}>
                  <Ionicons name={item.icon as any} size={18} color="#B91C1C" />
                </View>
                <Text style={styles.itemText}>{item.text}</Text>
              </View>
            ))}
          </View>

          {/* Confirmation input */}
          <Text style={styles.confirmLabel}>
            Type <Text style={styles.confirmBold}>DELETE</Text> to confirm
          </Text>
          <TextInput
            style={[
              styles.confirmInput,
              isConfirmed && styles.confirmInputValid,
            ]}
            value={confirmText}
            onChangeText={(t) => setConfirmText(t.toUpperCase())}
            placeholder="Type DELETE"
            placeholderTextColor="#D1D5DB"
            autoCapitalize="characters"
            autoCorrect={false}
            editable={screenState !== 'loading'}
          />

          {/* Error message */}
          {screenState === 'error' && (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{errorMessage}</Text>
              <TouchableOpacity onPress={handleContactSupport}>
                <Text style={styles.supportLink}>Contact support@mapai.app</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Delete button */}
          <TouchableOpacity
            style={[
              styles.deleteButton,
              !isConfirmed && styles.deleteButtonDisabled,
            ]}
            onPress={handleDelete}
            disabled={!isConfirmed || screenState === 'loading'}
            activeOpacity={0.8}
          >
            {screenState === 'loading' ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text
                style={[
                  styles.deleteButtonText,
                  !isConfirmed && styles.deleteButtonTextDisabled,
                ]}
              >
                Delete My Account
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 28,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#B91C1C',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  itemList: {
    gap: 12,
    marginBottom: 32,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  confirmLabel: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 10,
  },
  confirmBold: {
    fontWeight: '700',
    color: '#B91C1C',
  },
  confirmInput: {
    height: 52,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    letterSpacing: 2,
    marginBottom: 24,
  },
  confirmInputValid: {
    borderColor: '#B91C1C',
    backgroundColor: '#FEF2F2',
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#B91C1C',
    marginBottom: 8,
  },
  supportLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1D3E91',
    textDecorationLine: 'underline',
  },
  deleteButton: {
    height: 56,
    borderRadius: 999,
    backgroundColor: '#B91C1C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonDisabled: {
    backgroundColor: '#F3F4F6',
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  deleteButtonTextDisabled: {
    color: '#9CA3AF',
  },
});
