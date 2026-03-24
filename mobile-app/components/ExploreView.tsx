import React, { useState } from 'react';
import { StyleSheet, View, Text, Dimensions } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Colors, MapConfig, Shadows } from '@/constants/theme';
import { LatLng, Place } from '../types';

interface ExploreViewProps {
  places: Place[];
  onPlaceSelect: (place: Place) => void;
  selectedPlace?: Place;
  routePoints?: LatLng[];
  /** When true, map fills only its parent container instead of full screen */
  compact?: boolean;
}

export default function ExploreView({
  places,
  onPlaceSelect,
  selectedPlace,
  routePoints,
  compact,
}: ExploreViewProps) {
  const [region, setRegion] = useState(MapConfig.initialRegion);

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={compact ? styles.mapCompact : styles.mapFull}
        initialRegion={region}
        customMapStyle={MapConfig.darkMapStyle}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {places.map((place) => {
          const isSelected = selectedPlace?.id === place.id;
          const score = place.matchScore ?? 50;
          const isHigh = score >= 70;
          const isMed = score >= 40;

          return (
            <Marker
              key={place.id}
              coordinate={place.location}
              onPress={() => onPlaceSelect(place)}
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
        })}

        {routePoints && (
          <Polyline
            coordinates={routePoints}
            strokeWidth={4}
            strokeColor={Colors.brandViolet}
            lineDashPattern={[1, 0]}
          />
        )}
      </MapView>
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
});
