/**
 * Mapai — Home Screen (Phase 1 rewrite)
 *
 * Map-dominant layout:
 *  - Full-screen MapView as base layer via ExploreView (compact mode)
 *  - Floating header: neighborhood pill (left) + profile button (right)
 *  - Black Animated.View overlay dims the map when chat is expanded
 *  - ChatOverlay bottom sheet anchored at the bottom
 */

import React, { useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows, Spacing, BorderRadius } from '@/constants/theme';
import ExploreView from '@/components/ExploreView';
import ChatOverlay from '@/components/ChatOverlay';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import { Place } from '@/types';
import { useLoyaltyBalance } from '@/services/api/hooks';

// ─── Layout constants ────────────────────────────────────────

const TOP_INSET = Platform.OS === 'ios' ? 54 : 34;

// ─── Main Screen ─────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const { discoveryPlaces, selectedPlace, setSelectedPlace } = useMapStore();
  const { mapOpacity } = useUIStore();
  const { data: pointsBalance = null } = useLoyaltyBalance();

  const dimOpacity = useRef(new Animated.Value(0)).current;

  // Sync Animated.Value with store mapOpacity
  // mapOpacity: 1.0 = no dim (chat closed), 0.3 = dim (chat open)
  // dimOpacity: 0 = transparent overlay, 1 = opaque
  // Conversion: dimOverlayOpacity = 1 - mapOpacity  (1.0 → 0, 0.3 → 0.7)
  React.useEffect(() => {
    const targetDim = parseFloat((1 - mapOpacity).toFixed(2));
    Animated.timing(dimOpacity, {
      toValue: targetDim,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [mapOpacity, dimOpacity]);

  const handlePlaceSelect = useCallback(
    (place: Place) => setSelectedPlace(place),
    [setSelectedPlace],
  );

  const openProfile = useCallback(() => {
    router.push('/profile' as any);
  }, [router]);

  const openSocial = useCallback(() => {
    router.push('/social' as any);
  }, [router]);

  const openRewards = useCallback(() => {
    router.push('/rewards' as any);
  }, [router]);

  return (
    <View style={styles.root}>
      {/* ── Full-screen map base layer ───────────────── */}
      <View style={styles.mapLayer}>
        <ExploreView
          places={discoveryPlaces}
          onPlaceSelect={handlePlaceSelect}
          selectedPlace={selectedPlace ?? undefined}
          compact
        />
      </View>

      {/* ── Dim overlay (activated when chat expands) ── */}
      <Animated.View
        style={[styles.dimOverlay, { opacity: dimOpacity }]}
        pointerEvents="none"
      />

      {/* ── Floating header ─────────────────────────── */}
      <View style={[styles.header, { top: TOP_INSET }]}>
        {/* Neighborhood pill */}
        <TouchableOpacity
          style={styles.locationPill}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Current neighborhood: Back Bay, Boston"
        >
          <Ionicons name="location" size={14} color={Colors.brandBlue} />
          <Text style={styles.locationText}>Back Bay, Boston</Text>
        </TouchableOpacity>

        {/* Right-side button group */}
        <View style={styles.headerRight}>
          {/* Points & Rewards badge */}
          <TouchableOpacity
            style={styles.pointsBadge}
            onPress={openRewards}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Points and rewards"
          >
            <Ionicons name="gift" size={14} color={Colors.brandBlue} />
            <Text style={styles.pointsText}>
              {pointsBalance !== null ? pointsBalance : '–'}
            </Text>
            <Text style={styles.ptsLabel}>pts</Text>
          </TouchableOpacity>

          {/* Profile button */}
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={openProfile}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            <Ionicons
              name="person-outline"
              size={19}
              color={Colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Chat overlay bottom sheet ────────────────── */}
      <ChatOverlay />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },

  // Full-screen map fills entire screen
  mapLayer: {
    ...StyleSheet.absoluteFillObject,
  },

  // Semi-transparent black overlay that dims the map
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    // opacity is driven by Animated.Value
  },

  // Floating header row
  header: {
    position: 'absolute',
    left: Spacing.base,
    right: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: BorderRadius.full,
    ...Shadows.md,
  },
  locationText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.md,
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.brandBlue,
    ...Shadows.md,
  },
  pointsText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.brandBlue,
  },
  ptsLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
});
