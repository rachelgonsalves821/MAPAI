/**
 * Mapai — CollapsedChatBar
 *
 * The compact bottom-sheet face: a pill search input + quick-action chips.
 * Any tap calls onFocus, which tells ChatOverlay to expand the sheet.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';
import { useLocationStore } from '@/store/locationStore';

// ─── Constants ───────────────────────────────────────────────

const QUICK_CHIPS = ['Coffee nearby', 'Lunch under $15', 'Open now'];

// ─── Props ───────────────────────────────────────────────────

interface CollapsedChatBarProps {
  onFocus: (initialQuery?: string) => void;
}

// ─── Component ───────────────────────────────────────────────

export default function CollapsedChatBar({ onFocus }: CollapsedChatBarProps) {
  const isDefault = useLocationStore((s) => s.isDefault);

  return (
    <View style={styles.root}>
      {/* Pill input row */}
      <TouchableOpacity
        style={styles.pill}
        activeOpacity={0.85}
        onPress={() => onFocus()}
        accessibilityRole="button"
        accessibilityLabel="Open chat search"
      >
        <Ionicons
          name="search"
          size={17}
          color={Colors.textTertiary}
          style={styles.searchIcon}
        />
        <Text style={styles.placeholder} numberOfLines={1}>
          Where do you want to go?
        </Text>
        {isDefault && (
          <View style={styles.locationFallback}>
            <Ionicons name="location" size={12} color="#D97706" />
            <Text style={styles.locationFallbackText}>Boston</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.micBtn}
          activeOpacity={0.8}
          onPress={() => onFocus()}
          accessibilityRole="button"
          accessibilityLabel="Voice search"
        >
          <Ionicons name="mic" size={17} color="#FFFFFF" />
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Quick-action chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipContent}
      >
        {QUICK_CHIPS.map((chip) => (
          <TouchableOpacity
            key={chip}
            style={styles.chip}
            activeOpacity={0.75}
            onPress={() => onFocus(chip)}
            accessibilityRole="button"
            accessibilityLabel={chip}
          >
            <Text style={styles.chipText}>{chip}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    gap: Spacing.sm,
  },

  // Pill input
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingLeft: Spacing.md,
    paddingRight: 5,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  placeholder: {
    flex: 1,
    fontSize: 15,
    color: Colors.textTertiary,
    fontWeight: '400',
  },
  micBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationFallback: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    marginRight: Spacing.sm,
  },
  locationFallbackText: {
    color: '#D97706',
    fontSize: 11,
    fontWeight: '600' as const,
  },

  // Chips
  chipScroll: {
    flexGrow: 0,
  },
  chipContent: {
    gap: Spacing.sm,
    paddingRight: Spacing.xs,
  },
  chip: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
});
