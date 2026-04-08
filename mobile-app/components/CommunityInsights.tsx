/**
 * Mapai — Community Insights Card
 * Displays aggregated survey stats for a place on the place detail screen.
 * Shows total visit count, average star rating, and top-3 dimension breakdowns
 * as horizontal progress bars.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { usePlaceSurveyStats } from '@/services/api/survey';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DimensionBreakdown {
  dimension: string;
  topAnswer: string;
  topPercent: number;
}

interface PlaceSurveyStats {
  totalResponses: number;
  averageRating: number;
  dimensions: DimensionBreakdown[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function starLabel(rating: number): string {
  return `\u2605 ${rating.toFixed(1)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  placeId: string;
}

export default function CommunityInsights({ placeId }: Props) {
  const { data, isLoading, isError } = usePlaceSurveyStats(placeId);

  if (isLoading || isError || !data) return null;

  const stats = data as PlaceSurveyStats;

  if (!stats.totalResponses || stats.totalResponses === 0) return null;

  const topDimensions = (stats.dimensions ?? []).slice(0, 3);

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Ionicons name="people" size={17} color={Colors.brandViolet} />
        <Text style={styles.sectionTitle}>Community Insights</Text>
      </View>

      <View style={styles.card}>
        {/* Summary row */}
        <View style={styles.summaryRow}>
          <Text style={styles.starRating}>{starLabel(stats.averageRating)}</Text>
          <Text style={styles.responseCount}>
            from {stats.totalResponses} visit{stats.totalResponses !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Dimension breakdowns */}
        {topDimensions.length > 0 && (
          <View style={styles.dimensionsContainer}>
            {topDimensions.map((dim, i) => (
              <View
                key={dim.dimension}
                style={[styles.dimensionRow, i < topDimensions.length - 1 && styles.dimensionRowGap]}
              >
                <View style={styles.dimensionLabelRow}>
                  <Text style={styles.dimensionName}>{dim.dimension}</Text>
                  <Text style={styles.dimensionAnswer}>
                    {dim.topAnswer} &middot; {dim.topPercent}%
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${Math.min(100, Math.max(0, dim.topPercent))}%` },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Matches `section` style in place/[id].tsx
  section: {
    paddingHorizontal: Spacing.base,
    marginTop: Spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  starRating: {
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    color: Colors.sun,
  },
  responseCount: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
  },
  dimensionsContainer: {
    gap: 0,
  },
  dimensionRow: {
    // gap handled via dimensionRowGap below
  },
  dimensionRowGap: {
    marginBottom: Spacing.md,
  },
  dimensionLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  dimensionName: {
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  dimensionAnswer: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
  },
  barTrack: {
    height: 6,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: Colors.brandViolet,
    borderRadius: BorderRadius.full,
  },
});
