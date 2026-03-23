import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Colors, Typography, Spacing, BorderRadius, MapConfig, Shadows } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { LatLng, Place } from '../types';
import { useUIStore } from '@/store/uiStore';

interface ExploreViewProps {
  places: Place[];
  onPlaceSelect: (place: Place) => void;
  selectedPlace?: Place;
  routePoints?: LatLng[];
}

export default function ExploreView({
  places,
  onPlaceSelect,
  selectedPlace,
  routePoints
}: ExploreViewProps) {
  const [region, setRegion] = useState(MapConfig.initialRegion);
  const { mapOpacity } = useUIStore();

  return (
    <View style={styles.container}>
      <View style={{ flex: 1, opacity: mapOpacity }}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={region}
        customMapStyle={MapConfig.darkMapStyle}
        onRegionChangeComplete={setRegion}
        showsUserLocation
      >
        {places.map((place) => (
          <Marker
            key={place.id}
            coordinate={place.location}
            onPress={() => onPlaceSelect(place)}
          >
            <View style={[
              styles.markerContainer,
              selectedPlace?.id === place.id && styles.markerActive
            ]}>
              <View style={[
                styles.markerCircle,
                { backgroundColor: place.matchScore >= 70 ? Colors.matchHigh : place.matchScore >= 40 ? Colors.matchMedium : Colors.matchLow }
              ]}>
                <Text style={styles.markerText}>{place.matchScore}%</Text>
              </View>
              <View style={styles.markerTail} />
            </View>
          </Marker>
        ))}

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

      {/* Floating UI Elements */}
      <View style={styles.floatingContainer}>
        <TouchableOpacity style={styles.locationButton} activeOpacity={0.8}>
          <Ionicons name="location" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  map: {
    width: width,
    height: height,
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerActive: {
    transform: [{ scale: 1.2 }],
    zIndex: 10,
  },
  markerCircle: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    ...Shadows.sm,
  },
  markerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  markerTail: {
    width: 2,
    height: 4,
    backgroundColor: Colors.surfaceBorder,
  },
  floatingContainer: {
    position: 'absolute',
    right: 20,
    bottom: 120, // Above tab bar
    gap: 12,
  },
  locationButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    ...Shadows.md,
  },
});
