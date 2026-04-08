import React, { useMemo, useState } from 'react';
import { StyleSheet, View, Text, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// ClusteredMapView is a drop-in replacement for react-native-maps MapView.
// It accepts all existing MapView props plus clustering-specific props.
import ClusteredMapView from 'react-native-map-clustering';
import { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Colors, MapConfig, Shadows } from '@/constants/theme';
import { LatLng, Place } from '../types';
import FriendPinsLayer from '@/components/FriendPinsLayer';

// ─── Cluster sizing ───────────────────────────────────────────
// Base diameter for a cluster bubble. When the cluster holds more than 10
// pins, we add 8 px to make the badge feel heavier.
const CLUSTER_BASE_SIZE = 40;
const CLUSTER_LARGE_BUMP = 8;

interface ExploreViewProps {
  places: Place[];
  onPlaceSelect: (place: Place) => void;
  selectedPlace?: Place;
  routePoints?: LatLng[];
  /** When true, map fills only its parent container instead of full screen */
  compact?: boolean;
  /** Set of place IDs the current user has loved — renders a heart pin instead of the regular dot */
  lovedPlaceIds?: Set<string>;
}

export default function ExploreView({
  places,
  onPlaceSelect,
  selectedPlace,
  routePoints,
  compact,
  lovedPlaceIds,
}: ExploreViewProps) {
  const [region, setRegion] = useState(MapConfig.initialRegion);

  // Memoize place markers so the array reference only changes when the
  // places list or the selected place changes. This prevents ClusteredMapView
  // from recalculating cluster geometry on unrelated parent re-renders.
  const placeMarkers = useMemo(
    () =>
      places.map((place) => {
        const isSelected = selectedPlace?.id === place.id;
        const isLoved = lovedPlaceIds?.has(place.id);
        const score = place.matchScore ?? 50;
        const isHigh = score >= 70;
        const isMed = score >= 40;

        if (isLoved) {
          return (
            <Marker
              key={place.id}
              coordinate={place.location}
              onPress={() => onPlaceSelect(place)}
              tracksViewChanges={isSelected}
            >
              <View style={[styles.pin, isSelected && styles.pinSelected, styles.pinLoved]}>
                <Ionicons name="heart" size={14} color="#EF4444" />
              </View>
            </Marker>
          );
        }

        return (
          <Marker
            key={place.id}
            coordinate={place.location}
            onPress={() => onPlaceSelect(place)}
            // tracksViewChanges=true only while a marker is selected so the
            // selection ring animates correctly; false otherwise to avoid
            // unnecessary native re-renders on every frame.
            tracksViewChanges={isSelected}
          >
            <View style={[styles.pin, isSelected && styles.pinSelected]}>
              <View
                style={[
                  styles.pinDot,
                  {
                    backgroundColor: isHigh
                      ? Colors.brandBlue
                      : isMed
                      ? Colors.matchMedium
                      : Colors.matchLow,
                  },
                ]}
              />
            </View>
          </Marker>
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [places, selectedPlace?.id, lovedPlaceIds],
  );

  return (
    <View style={styles.container}>
      <ClusteredMapView
        provider={PROVIDER_GOOGLE}
        style={compact ? styles.mapCompact : styles.mapFull}
        initialRegion={region}
        customMapStyle={MapConfig.darkMapStyle}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        showsMyLocationButton={false}
        // ── Clustering configuration ──────────────────────────
        clusterColor={Colors.brandBlue}
        clusterTextColor="#FFFFFF"
        clusterFontFamily="System"
        // Group pins within 50 px of each other on screen.
        radius={50}
        // Above zoom level 16 all individual pins become visible.
        maxZoom={16}
        // Require at least 3 pins before forming a cluster bubble.
        minPoints={3}
        // Supercluster tile extent — 512 gives good spatial resolution.
        extent={512}
        // Animate cluster split/merge transitions as the user zooms.
        animationEnabled
        // Custom cluster bubble — branded Electric Blue with white count label.
        // The library automatically calls onPress to zoom in on the cluster.
        renderCluster={(cluster: any) => {
          const { id, geometry, onPress, properties } = cluster;
          const points: number = properties.point_count;
          const isLarge = points > 10;
          const size = CLUSTER_BASE_SIZE + (isLarge ? CLUSTER_LARGE_BUMP : 0);

          return (
            <Marker
              key={`cluster-${id}`}
              coordinate={{
                latitude: geometry.coordinates[1],
                longitude: geometry.coordinates[0],
              }}
              onPress={onPress}
              // Clusters are static once rendered at a given zoom level.
              tracksViewChanges={false}
            >
              <View
                style={[
                  styles.cluster,
                  {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                  },
                ]}
              >
                <Text style={styles.clusterText}>{points}</Text>
              </View>
            </Marker>
          );
        }}
      >
        {/* Place discovery markers — clustered automatically */}
        {placeMarkers}

        {/* Navigation route polyline — not affected by clustering */}
        {routePoints && (
          <Polyline
            coordinates={routePoints}
            strokeWidth={4}
            strokeColor={Colors.brandViolet}
            lineDashPattern={[1, 0]}
          />
        )}

        {/*
         * Friend pins (Phase 2) — rendered inside the same ClusteredMapView
         * so the library sees them. Friend pins are already deduplicated per
         * place in FriendPinsLayer and are small in number (max ~50). They
         * will cluster with place pins when geographically coincident, which
         * is acceptable. If future requirements demand separate cluster pools,
         * lift friend pins above the ClusteredMapView and overlay them on an
         * additional non-clustering MapView — but that approach costs an extra
         * native map instance.
         */}
        <FriendPinsLayer />
      </ClusteredMapView>
    </View>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  mapFull: {
    width,
    height,
  },
  mapCompact: {
    width: '100%',
    height: '100%',
  },
  pin: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
    ...Shadows.sm,
  },
  pinSelected: {
    transform: [{ scale: 1.3 }],
    backgroundColor: '#FFFFFF',
    ...Shadows.md,
  },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  pinLoved: {
    borderWidth: 1.5,
    borderColor: '#EF4444',
  },
  cluster: {
    backgroundColor: Colors.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    ...Shadows.md,
  },
  clusterText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
