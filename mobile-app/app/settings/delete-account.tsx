/**
 * Mapai — Delete Account Screen
 * Destructive action screen with explicit confirmation gate.
 * Route: /settings/delete-account
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useAuthStore } from '@/store/authStore';
import { useOnboardingStore } from '@/store/onboardingStore';
import apiClient from '@/services/api/client';

const CONFIRM_WORD = 'DELETE';
const SUPPORT_EMAIL = 'support@mapai.app';

// Everything that will be permanently removed, shown to the user before they commit.
const DELETION_ITEMS: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string }[] = [
  { icon: 'person-circle-outline', label: 'User profile and preferences' },
  { icon: 'chatbubbles-outline',    label: 'Conversation history' },
  { icon: 'brain-outline' as any,   label: 'Memory model and all stored preferences' },
  { icon: 'heart-outline',          label: 'Loved places and saved locations' },
  { icon: 'people-outline',         label: 'Friend connections (mutual removal)' },
];

type ScreenState = 'idle' | 'loading' | 'error';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [confirmText, setConfirmText] = useState('');
  const [screenState, setScreenState] = useState<ScreenState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const isConfirmed = confirmText === CONFIRM_WORD;

  const handleDelete = useCallback(async () => {
    if (!isConfirmed || screenState === 'loading') return;

    setScreenState('loading');
    setErrorMessage('');

    try {
      await apiClient.delete('/v1/user/account');

      // Wipe all local state after the server confirms deletion.
      useAuthStore.getState().logout();
      useOnboardingStore.getState().reset();
      await signOut();

      // Replace the entire navigation stack so the user cannot go back.
      router.replace('/(auth)/sign-in');
    } catch (err: any) {
      const serverMessage: string =
        err?.response?.data?.message ||
        err?.message ||
        'Something went wrong. Please try again or contact support.';

      setErrorMessage(serverMessage);
      setScreenState('error');
    }
  }, [isConfirmed, screenState, signOut, router]);

  const handleOpenSupport = useCallback(() => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Account%20Deletion%20Issue`);
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Delete Account</Text>

        {/* Spacer keeps title centred */}
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Warning banner ── */}
        <View style={styles.warningBanner}>
          <View style={styles.warningIconWrap}>
            <Ionicons name="warning" size={28} color={Colors.error} />
          </View>
          <Text style={styles.warningTitle}>This action is permanent</Text>
          <Text style={styles.warningSubtitle}>
            Deleting your account cannot be undone. All of your data will be
            immediately and irreversibly removed from our servers.
          </Text>
        </View>

        {/* ── What gets deleted ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>What will be deleted</Text>

          <View style={styles.deletionList}>
            {DELETION_ITEMS.map((item) => (
              <View key={item.label} style={styles.deletionRow}>
                <View style={styles.deletionIconWrap}>
                  <Ionicons name={item.icon} size={18} color={Colors.error} />
                </View>
                <Text style={styles.deletionText}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Confirmation input ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Confirm deletion</Text>
          <Text style={styles.inputPrompt}>
            Type{' '}
            <Text style={styles.inputPromptWord}>DELETE</Text>
            {' '}to enable the button below.
          </Text>

          <TextInput
            style={[
              styles.confirmInput,
              isConfirmed && styles.confirmInputValid,
              screenState === 'error' && !isConfirmed && styles.confirmInputError,
            ]}
            value={confirmText}
            onChangeText={(t) => {
              setConfirmText(t.toUpperCase());
              if (screenState === 'error') setScreenState('idle');
            }}
            placeholder="Type DELETE here"
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            returnKeyType="done"
            editable={screenState !== 'loading'}
            accessibilityLabel="Type DELETE to confirm account deletion"
          />

          {isConfirmed && (
            <View style={styles.validRow}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.error} />
              <Text style={styles.validText}>Confirmation accepted</Text>
            </View>
          )}
        </View>

        {/* ── Error state ── */}
        {screenState === 'error' && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={20} color={Colors.error} />
            <View style={styles.errorCardBody}>
              <Text style={styles.errorCardTitle}>Deletion failed</Text>
              <Text style={styles.errorCardMessage}>{errorMessage}</Text>
              <TouchableOpacity
                onPress={handleOpenSupport}
                accessibilityRole="link"
                accessibilityLabel="Email support"
              >
                <Text style={styles.errorCardLink}>{SUPPORT_EMAIL}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Delete button ── */}
        <TouchableOpacity
          style={[
            styles.deleteButton,
            !isConfirmed && styles.deleteButtonDisabled,
            screenState === 'loading' && styles.deleteButtonLoading,
          ]}
          onPress={handleDelete}
          disabled={!isConfirmed || screenState === 'loading'}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Delete my account"
          accessibilityState={{ disabled: !isConfirmed || screenState === 'loading' }}
        >
          {screenState === 'loading' ? (
            <ActivityIndicator color={Colors.textOnBrand} size="small" />
          ) : (
            <>
              <Ionicons
                name="trash-outline"
                size={18}
                color={isConfirmed ? Colors.textOnBrand : Colors.textTertiary}
              />
              <Text
                style={[
                  styles.deleteButtonText,
                  !isConfirmed && styles.deleteButtonTextDisabled,
                ]}
              >
                Delete My Account
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* ── Cancel link ── */}
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
          disabled={screenState === 'loading'}
          accessibilityRole="button"
          accessibilityLabel="Cancel and go back"
        >
          <Text style={styles.cancelText}>Cancel — keep my account</Text>
        </TouchableOpacity>

        {/* Bottom breathing room above keyboard */}
        <View style={styles.bottomPad} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // ── Header ──────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBorder,
    backgroundColor: Colors.background,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  headerSpacer: {
    width: 40,
  },

  // ── Scroll ──────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.xl,
  },

  // ── Warning banner ───────────────────────────────────────
  warningBanner: {
    backgroundColor: '#FEF2F2',   // red-50 — intentionally hardcoded for destructive tone
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#FECACA',       // red-200
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  warningIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEE2E2',   // red-100
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  warningTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: '800',
    color: '#991B1B',             // red-800
    letterSpacing: -0.3,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  warningSubtitle: {
    fontSize: Typography.sizes.sm,
    color: '#B91C1C',             // red-700
    lineHeight: Typography.sizes.sm * Typography.lineHeights.relaxed,
    textAlign: 'center',
    fontWeight: '500',
  },

  // ── Sections ─────────────────────────────────────────────
  section: {
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },

  // ── Deletion list ─────────────────────────────────────────
  deletionList: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  deletionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBorder,
    gap: Spacing.md,
  },
  deletionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  deletionText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textPrimary,
    fontWeight: '500',
    flex: 1,
    lineHeight: Typography.sizes.sm * Typography.lineHeights.normal,
  },

  // ── Confirmation input ────────────────────────────────────
  inputPrompt: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    lineHeight: Typography.sizes.sm * Typography.lineHeights.relaxed,
    fontWeight: '500',
  },
  inputPromptWord: {
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  confirmInput: {
    height: 52,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.base,
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: 2,
  },
  confirmInputValid: {
    borderColor: Colors.error,
    backgroundColor: '#FEF2F2',
  },
  confirmInputError: {
    borderColor: Colors.error,
  },
  validRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  validText: {
    fontSize: Typography.sizes.xs,
    color: Colors.error,
    fontWeight: '600',
  },

  // ── Error card ────────────────────────────────────────────
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: '#FEF2F2',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: Spacing.base,
    marginBottom: Spacing.xl,
  },
  errorCardBody: {
    flex: 1,
    gap: Spacing.xs,
  },
  errorCardTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
    color: '#991B1B',
  },
  errorCardMessage: {
    fontSize: Typography.sizes.sm,
    color: '#B91C1C',
    lineHeight: Typography.sizes.sm * Typography.lineHeights.relaxed,
    fontWeight: '500',
  },
  errorCardLink: {
    fontSize: Typography.sizes.sm,
    color: Colors.brandBlue,
    fontWeight: '600',
    textDecorationLine: 'underline',
    marginTop: Spacing.xs,
  },

  // ── Delete button ─────────────────────────────────────────
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.error,
    borderRadius: BorderRadius.pill,
    height: 54,
    marginBottom: Spacing.md,
  },
  deleteButtonDisabled: {
    backgroundColor: Colors.surfaceElevated,
  },
  deleteButtonLoading: {
    backgroundColor: Colors.error,
    opacity: 0.75,
  },
  deleteButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    color: Colors.textOnBrand,
    letterSpacing: -0.1,
  },
  deleteButtonTextDisabled: {
    color: Colors.textTertiary,
  },

  // ── Cancel link ───────────────────────────────────────────
  cancelButton: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  cancelText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },

  bottomPad: {
    height: Spacing['3xl'],
  },
});
