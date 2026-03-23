import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '@/constants/theme';
import ExploreView from '@/components/ExploreView';
import { Place } from '@/types';
import { decodePolyline } from '@/utils/polyline';
import { useNearbyPlaces, useRoutes } from '@/services/api/hooks';
import { useUIStore } from '@/store/uiStore';

export default function MapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ selectedPlaceId?: string }>();
  const { openChat } = useUIStore();

  const [selectedPlaceId, setSelectedPlaceId] = useState<string | undefined>();
  const [selectedRouteMode, setSelectedRouteMode] = useState<string | undefined>();

  const { data: places = [] } = useNearbyPlaces({
    lat: 42.3601,
    lng: -71.0589,
    radius: 3000
  });

  const selectedPlace = places.find((p: Place) => p.id === (params.selectedPlaceId || selectedPlaceId));

  const { data: availableRoutes = [] } = useRoutes({
    origin_lat: 42.3601,
    origin_lng: -71.0589,
    dest_lat: selectedPlace?.location.latitude || 0,
    dest_lng: selectedPlace?.location.longitude || 0,
    place_id: selectedPlace?.id || ''
  });

  const selectedRoute = availableRoutes.find((r: any) => r.mode === selectedRouteMode) || availableRoutes[0];

  useEffect(() => {
    if (params.selectedPlaceId && params.selectedPlaceId !== selectedPlaceId) {
      setSelectedPlaceId(params.selectedPlaceId);
      setSelectedRouteMode(undefined);
    }
  }, [params.selectedPlaceId]);

  useEffect(() => {
    if (availableRoutes.length > 0 && !selectedRouteMode) {
      setSelectedRouteMode(availableRoutes[0].mode);
    }
  }, [availableRoutes]);

  const handlePlaceSelect = (place: Place) => {
    setSelectedPlaceId(place.id);
    setSelectedRouteMode(undefined);
    router.setParams({ selectedPlaceId: place.id });
  };

  const navigateToSearch = (query?: string) => {
    openChat();
    router.push({
      pathname: '/(tabs)/search' as any,
      params: query ? { query } : {}
    });
  };

  return (
    <View style={styles.container}>
      <ExploreView
        places={places}
        onPlaceSelect={handlePlaceSelect}
        selectedPlace={selectedPlace}
        routePoints={selectedRoute ? decodePolyline(selectedRoute.polyline) : undefined}
      />

      {/* Route Selector */}
      {selectedPlace && availableRoutes.length > 0 && (
        <View style={styles.routeSelectorContainer}>
          <View style={styles.routeSelector}>
            {availableRoutes.map((route: any) => (
              <TouchableOpacity
                key={route.mode}
                style={[styles.routeTab, selectedRoute?.mode === route.mode && styles.routeTabActive]}
                onPress={() => setSelectedRouteMode(route.mode)}
              >
                <Ionicons
                  name={
                    route.mode === 'walking' ? 'walk' :
                    route.mode === 'transit' ? 'bus' :
                    route.mode === 'cycling' ? 'bicycle' : 'car'
                  }
                  size={20}
                  color={selectedRoute?.mode === route.mode ? Colors.brandBlue : Colors.textSecondary}
                />
                <Text style={[styles.routeTabText, selectedRoute?.mode === route.mode && styles.routeTabTextActive]}>
                  {route.description.split(':')[1].trim()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Floating Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.neighborhoodPill}>
          <Ionicons name="location" size={16} color={Colors.brandBlue} />
          <Text style={styles.neighborhoodText}>South End, Boston</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.profileButton} onPress={() => router.push('/(tabs)/profile' as any)}>
          <Ionicons name="person" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Chat Pill Overlay */}
      <View style={styles.bottomOverlay}>
        <TouchableOpacity
          style={styles.chatPill}
          activeOpacity={0.9}
          onPress={() => navigateToSearch()}
        >
          <Ionicons name="sparkles" size={20} color={Colors.brandViolet} />
          <Text style={styles.chatPillText}>Ask Mapai anything...</Text>
          <View style={styles.micIcon}>
            <Ionicons name="mic" size={18} color="#FFFFFF" />
          </View>
        </TouchableOpacity>

        <View style={styles.chipsRow}>
          {['Coffee nearby', 'Lunch under $15', 'Open now'].map((chip) => (
            <TouchableOpacity
              key={chip}
              style={styles.chip}
              onPress={() => navigateToSearch(chip)}
            >
              <Text style={styles.chipText}>{chip}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  neighborhoodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 8,
    ...Shadows.md,
  },
  neighborhoodText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    ...Shadows.md,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 120 : 100,
    left: 20,
    right: 20,
    gap: 12,
  },
  chatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 12,
    ...Shadows.md,
  },
  chatPillText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '400',
  },
  micIcon: {
    backgroundColor: Colors.brandBlue,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    ...Shadows.sm,
  },
  chipText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  routeSelectorContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 120 : 100,
    left: 20,
    right: 20,
    zIndex: 10,
  },
  routeSelector: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 6,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    justifyContent: 'space-around',
    ...Shadows.md,
  },
  routeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 15,
    gap: 6,
  },
  routeTabActive: {
    backgroundColor: 'rgba(29, 62, 145, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(29, 62, 145, 0.15)',
  },
  routeTabText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  routeTabTextActive: {
    color: Colors.brandBlue,
  },
});
