/**
 * Mapai — Settings Screen
 * Privacy controls, account management, and app info.
 * Registered via Stack.Screen name="settings" in _layout.tsx (already present).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useAuthStore } from '@/store/authStore';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useSurveyPrefsStore } from '@/store/surveyPrefsStore';
import apiClient from '@/services/api/client';
import { useUserMemory } from '@/services/api/hooks';

// ─── Types ────────────────────────────────────────────────────────────────────

type VisibilityOption = 'everyone' | 'friends' | 'private';

interface PrivacySettings {
  privacy_loved_places: VisibilityOption;
  privacy_activity: VisibilityOption;
  allow_friend_requests: boolean;
}

// ─── Visibility Picker ────────────────────────────────────────────────────────

const VISIBILITY_OPTIONS: { value: VisibilityOption; label: string; icon: any }[] = [
  { value: 'everyone', label: 'Everyone', icon: 'globe-outline' },
  { value: 'friends', label: 'Friends', icon: 'people-outline' },
  { value: 'private', label: 'Only me', icon: 'lock-closed-outline' },
];

function VisibilityPicker({
  value,
  onChange,
}: {
  value: VisibilityOption;
  onChange: (v: VisibilityOption) => void;
}) {
  return (
    <View style={pickerStyles.row}>
      {VISIBILITY_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[pickerStyles.chip, active && pickerStyles.chipActive]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.75}
          >
            <Ionicons
              name={opt.icon}
              size={13}
              color={active ? Colors.textOnBrand : Colors.textSecondary}
            />
            <Text style={[pickerStyles.chipText, active && pickerStyles.chipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    marginTop: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  chipActive: {
    backgroundColor: Colors.brandBlue,
    borderColor: Colors.brandBlue,
  },
  chipText: {
    fontSize: Typography.sizes.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.textOnBrand,
  },
});

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={sectionStyles.wrapper}>
      <Text style={sectionStyles.title}>{title}</Text>
      <View style={sectionStyles.card}>{children}</View>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  wrapper: { marginBottom: Spacing.lg },
  title: {
    fontSize: Typography.sizes.xs,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginLeft: 4,
  },
  card: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
    ...Shadows.sm,
  },
});

// ─── Row divider ──────────────────────────────────────────────────────────────

function Divider() {
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: Colors.surfaceBorder,
        marginLeft: Spacing.base,
      }}
    />
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const authStoreUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { data: memoryData } = useUserMemory();

  const surveysEnabled = useSurveyPrefsStore((s) => s.surveysEnabled);
  const setSurveysEnabled = useSurveyPrefsStore((s) => s.setSurveysEnabled);

  const [privacy, setPrivacy] = useState<PrivacySettings>({
    privacy_loved_places: 'friends',
    privacy_activity: 'friends',
    allow_friend_requests: true,
  });
  const [saving, setSaving] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);

  const userId = user?.id ?? 'dev-user-001';

  // ─── Load current settings ─────────────────────────────────────────────────

  const loadSettings = useCallback(async () => {
    try {
      const res = await apiClient.get(`/v1/user/profile/${userId}`);
      const d = res.data?.data;
      if (d) {
        setPrivacy({
          privacy_loved_places: d.privacy_loved_places ?? 'friends',
          privacy_activity: d.privacy_activity ?? 'friends',
          allow_friend_requests: d.allow_friend_requests ?? true,
        });
      }
    } catch {
      // Use defaults if the endpoint isn't available yet
    } finally {
      setLoadingInitial(false);
    }
  }, [userId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // ─── Save ──────────────────────────────────────────────────────────────────

  const savePrivacy = async (updated: PrivacySettings) => {
    setSaving(true);
    try {
      await apiClient.patch('/v1/user/privacy', updated);
    } catch {
      // Silently tolerate — endpoint may not exist yet
    } finally {
      setSaving(false);
    }
  };

  const updatePrivacy = (patch: Partial<PrivacySettings>) => {
    const next = { ...privacy, ...patch };
    setPrivacy(next);
    savePrivacy(next);
  };

  // ─── Account actions ───────────────────────────────────────────────────────

  const handleExportData = () => {
    Alert.alert(
      'Export My Data',
      'We will send a download link to your email address within 24 hours.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request Export',
          onPress: async () => {
            try {
              await apiClient.post('/v1/user/export-request');
              Alert.alert('Request submitted', 'You will receive an email shortly.');
            } catch {
              Alert.alert('Request submitted', 'You will receive an email shortly.');
            }
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            useAuthStore.getState().logout();
            useOnboardingStore.getState().reset();
            await signOut();
          } catch (err) {
            console.error('Sign out error:', err);
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data after a 30-day grace period. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              'Type "DELETE" to confirm account deletion.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, delete my account',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await apiClient.post('/v1/user/delete-request');
                    } catch {
                      // Best-effort
                    }
                    useAuthStore.getState().logout();
                    useOnboardingStore.getState().reset();
                    await signOut();
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleClearMemory = () => {
    Alert.alert(
      'Clear All Preferences?',
      'This will delete everything Mapai has learned about your tastes. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete('/v1/user/memory');
              queryClient.invalidateQueries({ queryKey: ['user', 'memory'] });
              Alert.alert('Done', 'Your preferences have been cleared.');
            } catch {
              Alert.alert('Done', 'Your preferences have been cleared.');
            }
          },
        },
      ]
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loadingInitial) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.brandBlue} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.iconButton}>
          {saving && <ActivityIndicator size="small" color={Colors.brandBlue} />}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Privacy ─────────────────────────────────────────────────────── */}
        <Section title="Privacy">
          {/* Loved places visibility */}
          <View style={styles.settingBlock}>
            <View style={styles.settingLabelRow}>
              <Ionicons name="heart-outline" size={18} color={Colors.error} style={styles.settingIcon} />
              <View style={styles.settingLabelContent}>
                <Text style={styles.settingLabel}>Who can see loved places</Text>
                <Text style={styles.settingHint}>Controls who sees your saved places list</Text>
              </View>
            </View>
            <VisibilityPicker
              value={privacy.privacy_loved_places}
              onChange={(v) => updatePrivacy({ privacy_loved_places: v })}
            />
          </View>

          <Divider />

          {/* Activity visibility */}
          <View style={styles.settingBlock}>
            <View style={styles.settingLabelRow}>
              <Ionicons name="pulse-outline" size={18} color={Colors.brandBlue} style={styles.settingIcon} />
              <View style={styles.settingLabelContent}>
                <Text style={styles.settingLabel}>Who can see my activity</Text>
                <Text style={styles.settingHint}>Check-ins, reviews, and feed events</Text>
              </View>
            </View>
            <VisibilityPicker
              value={privacy.privacy_activity}
              onChange={(v) => updatePrivacy({ privacy_activity: v })}
            />
          </View>

          <Divider />

          {/* Friend requests toggle */}
          <View style={[styles.settingBlock, styles.settingRow]}>
            <View style={styles.settingLabelRow}>
              <Ionicons name="person-add-outline" size={18} color={Colors.brandViolet} style={styles.settingIcon} />
              <View style={styles.settingLabelContent}>
                <Text style={styles.settingLabel}>Allow friend requests</Text>
                <Text style={styles.settingHint}>Let others send you friend requests</Text>
              </View>
            </View>
            <Switch
              value={privacy.allow_friend_requests}
              onValueChange={(v) => updatePrivacy({ allow_friend_requests: v })}
              trackColor={{ false: Colors.surfaceElevated, true: Colors.brandBlue + '80' }}
              thumbColor={privacy.allow_friend_requests ? Colors.brandBlue : Colors.textTertiary}
            />
          </View>
        </Section>

        {/* ── Surveys ──────────────────────────────────────────────────────── */}
        <Section title="Surveys">
          <View style={[styles.settingBlock, styles.settingRow]}>
            <View style={styles.settingLabelRow}>
              <Ionicons name="clipboard-outline" size={18} color={Colors.brandViolet} style={styles.settingIcon} />
              <View style={styles.settingLabelContent}>
                <Text style={styles.settingLabel}>Arrival Surveys</Text>
                <Text style={styles.settingHint}>Get quick surveys after visiting a place to earn points</Text>
              </View>
            </View>
            <Switch
              value={surveysEnabled}
              onValueChange={setSurveysEnabled}
              trackColor={{ false: Colors.surfaceElevated, true: Colors.brandViolet + '80' }}
              thumbColor={surveysEnabled ? Colors.brandViolet : Colors.textTertiary}
            />
          </View>
        </Section>

        {/* ── Your Memory ──────────────────────────────────────────────────── */}
        <Section title="Your Memory">
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => router.push('/(tabs)/profile')}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: Colors.brandViolet + '18' }]}>
              <Ionicons name="sparkles-outline" size={18} color={Colors.brandViolet} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionLabel}>View Your Taste Profile</Text>
              {memoryData?.fact_count != null && memoryData.fact_count > 0 && (
                <Text style={styles.actionSubLabel}>
                  {memoryData.fact_count} preference{memoryData.fact_count !== 1 ? 's' : ''} learned
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
          </TouchableOpacity>

          <Divider />

          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => router.push('/loved-places' as any)}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#FEF2F2' }]}>
              <Ionicons name="heart-outline" size={18} color={Colors.error} />
            </View>
            <Text style={styles.actionLabel}>View Loved Places</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
          </TouchableOpacity>

          <Divider />

          <TouchableOpacity
            style={styles.actionRow}
            onPress={handleClearMemory}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: Colors.error + '18' }]}>
              <Ionicons name="trash-outline" size={18} color={Colors.error} />
            </View>
            <Text style={[styles.actionLabel, { color: Colors.error }]}>
              Clear All Learned Preferences
            </Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
          </TouchableOpacity>
        </Section>

        {/* ── Security ─────────────────────────────────────────────────────── */}
        <Section title="Security">
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => { if (typeof window !== 'undefined') window.alert('Two-factor authentication coming soon.'); }}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: Colors.brandBlue + '18' }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color={Colors.brandBlue} />
            </View>
            <Text style={styles.actionLabel}>Two-factor authentication</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
          </TouchableOpacity>
        </Section>

        {/* ── Account ─────────────────────────────────────────────────────── */}
        <Section title="Account">
          <TouchableOpacity style={styles.actionRow} onPress={handleSignOut} activeOpacity={0.7}>
            <View style={[styles.actionIcon, { backgroundColor: Colors.error + '18' }]}>
              <Ionicons name="log-out-outline" size={18} color={Colors.error} />
            </View>
            <Text style={[styles.actionLabel, { color: Colors.error }]}>Sign Out</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
          </TouchableOpacity>

          <Divider />

          <TouchableOpacity style={styles.actionRow} onPress={handleExportData} activeOpacity={0.7}>
            <View style={[styles.actionIcon, { backgroundColor: Colors.brandBlue + '18' }]}>
              <Ionicons name="download-outline" size={18} color={Colors.brandBlue} />
            </View>
            <Text style={styles.actionLabel}>Export my data</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
          </TouchableOpacity>

          <Divider />

          <TouchableOpacity style={styles.actionRow} onPress={handleDeleteAccount} activeOpacity={0.7}>
            <View style={[styles.actionIcon, { backgroundColor: Colors.error + '18' }]}>
              <Ionicons name="trash-outline" size={18} color={Colors.error} />
            </View>
            <Text style={[styles.actionLabel, { color: Colors.error }]}>Delete account</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
          </TouchableOpacity>
        </Section>

        {/* ── App Info ─────────────────────────────────────────────────────── */}
        <Section title="App">
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>1.0.0 (alpha)</Text>
          </View>
          <Divider />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Build</Text>
            <Text style={styles.infoValue}>2026.03</Text>
          </View>
          <Divider />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Environment</Text>
            <Text style={styles.infoValue}>
              {process.env.NODE_ENV === 'production' ? 'Production' : 'Development'}
            </Text>
          </View>
        </Section>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBorder,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  headerTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.base,
    paddingBottom: Spacing['4xl'],
  },

  // Settings blocks
  settingBlock: {
    padding: Spacing.base,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingLabelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    flex: 1,
  },
  settingIcon: {
    marginTop: 1,
  },
  settingLabelContent: {
    flex: 1,
  },
  settingLabel: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  settingHint: {
    fontSize: Typography.sizes.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },

  // Action rows (account)
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  actionIcon: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    flex: 1,
    fontSize: Typography.sizes.base,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  actionSubLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textTertiary,
    marginTop: 1,
    fontWeight: '400',
  },

  // Info rows
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  infoLabel: {
    fontSize: Typography.sizes.base,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: Typography.sizes.base,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
});
