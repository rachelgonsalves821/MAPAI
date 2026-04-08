/**
 * Mapai — Preference Detail Screen
 * View, edit, or delete a single learned preference dimension.
 * Navigated to from the Profile tab preference cards.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { useDeletePreference, useUpdatePreference } from '@/services/api/hooks';

// ─── Source label mapping ──────────────────────────────────────────────────────

function getSourceLabel(source: string): string {
  switch (source) {
    case 'explicit':
      return 'You told us';
    case 'inferred':
      return 'Learned from conversations';
    case 'behavioral':
      return 'Observed from your activity';
    default:
      return 'Learned from conversations';
  }
}

function getSourceIcon(source: string): keyof typeof Ionicons.glyphMap {
  switch (source) {
    case 'explicit':
      return 'person-outline';
    case 'inferred':
      return 'chatbubble-outline';
    case 'behavioral':
      return 'analytics-outline';
    default:
      return 'chatbubble-outline';
  }
}

// ─── Relative time helper ──────────────────────────────────────────────────────

function toRelativeTime(dateStr: string | undefined): string {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Unknown';

  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  if (diffWeeks < 5) return `${diffWeeks} week${diffWeeks !== 1 ? 's' : ''} ago`;
  return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`;
}

// ─── Dimension display name ────────────────────────────────────────────────────

function getDimensionDisplayName(dimension: string): string {
  const map: Record<string, string> = {
    cuisine_like: 'Cuisine — Loves',
    cuisine_dislike: 'Cuisine — Avoids',
    speed_sensitivity: 'Service Speed',
    price_preference: 'Price Range',
    ambiance_preference: 'Ambiance',
    dietary_restriction: 'Dietary Restriction',
  };
  if (map[dimension]) return map[dimension];
  // Fallback: capitalise and replace underscores
  return dimension
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PreferenceDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    dimension: string;
    value: string;
    confidence: string;
    source: string;
    lastUpdated: string;
  }>();

  const dimension = params.dimension ?? '';
  const initialValue = params.value ?? '';
  const confidence = parseFloat(params.confidence ?? '0');
  const source = params.source ?? 'inferred';
  const lastUpdated = params.lastUpdated ?? '';

  const [editedValue, setEditedValue] = useState(initialValue);

  const deleteMutation = useDeletePreference();
  const updateMutation = useUpdatePreference();

  const isBusy = deleteMutation.isPending || updateMutation.isPending;
  const confidencePct = Math.round(Math.min(Math.max(confidence, 0), 1) * 100);

  const confidenceColor =
    confidencePct >= 70
      ? Colors.brandBlue
      : confidencePct >= 40
      ? Colors.brandViolet
      : Colors.textTertiary;

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!editedValue.trim()) {
      Alert.alert('Value required', 'Please enter a value before saving.');
      return;
    }
    await updateMutation.mutateAsync({
      dimension,
      value: editedValue.trim(),
      // Fall back to 0.7 if the param was unparseable
      confidence: isNaN(confidence) ? 0.7 : confidence,
    });
    router.back();
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete This Preference?',
      `Mapai will forget that it learned "${getDimensionDisplayName(dimension)}". This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteMutation.mutateAsync(dimension);
            router.back();
          },
        },
      ]
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.back()}
            disabled={isBusy}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {getDimensionDisplayName(dimension)}
          </Text>
          <View style={styles.iconButton} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Value input card */}
          <View style={styles.sectionLabel}>
            <Text style={styles.sectionLabelText}>VALUE</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.inputHint}>
              Edit the value Mapai has learned about you.
            </Text>
            <TextInput
              style={styles.textInput}
              value={editedValue}
              onChangeText={setEditedValue}
              placeholder="Enter value..."
              placeholderTextColor={Colors.textTertiary}
              autoCapitalize="none"
              returnKeyType="done"
              editable={!isBusy}
            />
          </View>

          {/* Confidence card */}
          <View style={styles.sectionLabel}>
            <Text style={styles.sectionLabelText}>CONFIDENCE</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.confidenceRow}>
              <Text style={styles.confidencePercent}>{confidencePct}%</Text>
              <Text style={styles.confidenceDesc}>
                {confidencePct >= 70
                  ? 'High confidence — frequently reinforced'
                  : confidencePct >= 40
                  ? 'Medium confidence — seen a few times'
                  : 'Low confidence — early signal'}
              </Text>
            </View>
            <View style={styles.confidenceBarTrack}>
              <View
                style={[
                  styles.confidenceBarFill,
                  { width: `${confidencePct}%`, backgroundColor: confidenceColor },
                ]}
              />
            </View>
          </View>

          {/* About this preference card */}
          <View style={styles.sectionLabel}>
            <Text style={styles.sectionLabelText}>ABOUT THIS PREFERENCE</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.metaRow}>
              <View style={[styles.metaIconBg, { backgroundColor: Colors.brandViolet + '18' }]}>
                <Ionicons
                  name={getSourceIcon(source)}
                  size={16}
                  color={Colors.brandViolet}
                />
              </View>
              <View style={styles.metaContent}>
                <Text style={styles.metaLabel}>Source</Text>
                <Text style={styles.metaValue}>{getSourceLabel(source)}</Text>
              </View>
            </View>

            <View style={styles.metaDivider} />

            <View style={styles.metaRow}>
              <View style={[styles.metaIconBg, { backgroundColor: Colors.brandBlue + '18' }]}>
                <Ionicons name="time-outline" size={16} color={Colors.brandBlue} />
              </View>
              <View style={styles.metaContent}>
                <Text style={styles.metaLabel}>Last updated</Text>
                <Text style={styles.metaValue}>{toRelativeTime(lastUpdated)}</Text>
              </View>
            </View>
          </View>

          {/* Action buttons */}
          <TouchableOpacity
            style={[styles.saveButton, isBusy && styles.buttonDisabled]}
            onPress={handleSave}
            activeOpacity={0.8}
            disabled={isBusy}
          >
            {updateMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.textOnBrand} />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.deleteButton, isBusy && styles.buttonDisabled]}
            onPress={handleDelete}
            activeOpacity={0.8}
            disabled={isBusy}
          >
            {deleteMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.error} />
            ) : (
              <>
                <Ionicons name="trash-outline" size={16} color={Colors.error} />
                <Text style={styles.deleteButtonText}>Delete This Preference</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
    flex: 1,
    fontSize: Typography.sizes.md,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    textAlign: 'center',
    marginHorizontal: Spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.base,
    paddingBottom: Spacing['4xl'],
  },
  sectionLabel: {
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
    marginLeft: 4,
  },
  sectionLabelText: {
    fontSize: Typography.sizes.xs,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.base,
    ...Shadows.sm,
  },
  inputHint: {
    fontSize: Typography.sizes.xs,
    color: Colors.textTertiary,
    marginBottom: Spacing.sm,
  },
  textInput: {
    fontSize: Typography.sizes.base,
    fontWeight: '500',
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    backgroundColor: Colors.surface,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  confidencePercent: {
    fontSize: Typography.sizes.xl,
    fontWeight: '800',
    color: Colors.textPrimary,
    minWidth: 52,
  },
  confidenceDesc: {
    flex: 1,
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    lineHeight: Typography.sizes.xs * Typography.lineHeights.relaxed,
  },
  confidenceBarTrack: {
    height: 6,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  confidenceBarFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  metaIconBg: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaContent: {
    flex: 1,
  },
  metaLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textTertiary,
    fontWeight: '500',
  },
  metaValue: {
    fontSize: Typography.sizes.sm,
    color: Colors.textPrimary,
    fontWeight: '600',
    marginTop: 2,
  },
  metaDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.surfaceBorder,
    marginVertical: Spacing.md,
    marginLeft: 34 + Spacing.md,
  },
  saveButton: {
    backgroundColor: Colors.brandBlue,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xl,
    ...Shadows.sm,
  },
  saveButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    color: Colors.textOnBrand,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md + 2,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.error + '40',
    backgroundColor: Colors.error + '08',
  },
  deleteButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: Colors.error,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
