import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '@/constants/theme';
import { useMapStore } from '@/store/mapStore';
import { Place } from '@/types';

function PlaceCard({ place }: { place: Place }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/place/${place.id}` as any)}
      activeOpacity={0.8}
    >
      <View style={styles.cardBody}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>{place.name}</Text>
          <Text style={styles.cardAddress} numberOfLines={1}>{place.address}</Text>
          {place.matchReasons && place.matchReasons.length > 0 && (
            <Text style={styles.cardReason} numberOfLines={2}>
              {place.matchReasons[0]}
            </Text>
          )}
        </View>
        <View style={styles.scoreRing}>
          <Text style={styles.scoreText}>{place.matchScore}</Text>
          <Text style={styles.scorePercent}>%</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function DiscoverScreen() {
  const { discoveryPlaces } = useMapStore();

  if (discoveryPlaces.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Discover</Text>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="map-outline" size={56} color={Colors.textTertiary} />
          <Text style={styles.emptyTitle}>No results yet</Text>
          <Text style={styles.emptySubtitle}>
            Find places by chatting on the Search tab — your results will appear here.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Discover</Text>
        <Text style={styles.headerCount}>{discoveryPlaces.length} places</Text>
      </View>
      <FlatList
        data={discoveryPlaces}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PlaceCard place={item} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  headerCount: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 20,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 16,
    ...Shadows.sm,
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
    marginRight: 12,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  cardAddress: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginBottom: 6,
  },
  cardReason: {
    fontSize: 12,
    color: Colors.brandViolet,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  scoreRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: Colors.brandBlue,
    alignItems: 'baseline' as any,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  scoreText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.brandBlue,
  },
  scorePercent: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
});
