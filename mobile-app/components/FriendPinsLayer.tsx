/**
 * Mapai — FriendPinsLayer
 * Phase 2: Renders purple friend pins on the map using feed data.
 *
 * Strategy: fetch the last 50 feed items, extract unique place_ids that
 * friends have loved, and render Marker components inside the parent MapView.
 * A custom callout tooltip shows the friend's name and review on tap.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Callout, Marker } from 'react-native-maps';
import { Colors, Shadows, Spacing, Typography } from '@/constants/theme';

import apiClient from '@/services/api/client';

// ─── Constants ────────────────────────────────────────────────

// Avatar palette — same deterministic hash used in social.tsx
const AVATAR_COLORS = [
  '#0558E8',
  '#7C3AED',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#3B82F6',
  '#8B5CF6',
];

// ─── Types ────────────────────────────────────────────────────

interface RawFeedItem {
  id: string;
  actor_id: string;
  actor_name?: string;
  activity_type: string;
  place_id: string;
  place_name: string;
  metadata?: {
    location?: { latitude: number; longitude: number };
    latitude?: number;
    longitude?: number;
    one_line_review?: string;
  };
  created_at: string;
}

// A consolidated pin entry for one place on the map
interface FriendPin {
  place_id: string;
  place_name: string;
  latitude: number;
  longitude: number;
  // All friends who have this place in the feed (de-duped by actor_id)
  friends: Array<{
    actor_id: string;
    actor_name?: string;
    one_line_review?: string;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────

function avatarColor(actorId: string): string {
  let hash = 0;
  for (let i = 0; i < actorId.length; i++) {
    hash = (hash * 31 + actorId.charCodeAt(i)) & 0xffff;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function actorInitial(actorId: string, actorName?: string): string {
  if (actorName && actorName.length > 0) return actorName[0].toUpperCase();
  return actorId[0]?.toUpperCase() ?? '?';
}

function extractLocation(
  item: RawFeedItem,
): { latitude: number; longitude: number } | null {
  // Backend may embed location in metadata under various shapes
  const m = item.metadata;
  if (!m) return null;

  if (
    m.location &&
    typeof m.location.latitude === 'number' &&
    typeof m.location.longitude === 'number'
  ) {
    return { latitude: m.location.latitude, longitude: m.location.longitude };
  }

  if (typeof m.latitude === 'number' && typeof m.longitude === 'number') {
    return { latitude: m.latitude, longitude: m.longitude };
  }

  return null;
}

// ─── Sub-components ───────────────────────────────────────────

/** The purple circle marker rendered on the map for one friend pin. */
function PinMarker({ pin }: { pin: FriendPin }) {
  const count = pin.friends.length;
  const firstFriend = pin.friends[0];
  const bgColor = avatarColor(firstFriend.actor_id);
  const initial = actorInitial(firstFriend.actor_id, firstFriend.actor_name);
  const displayName = firstFriend.actor_name ?? firstFriend.actor_id;

  // Pulse animation on mount for a subtle entry cue
  const scale = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [scale]);

  return (
    <Animated.View style={[styles.pinWrapper, { transform: [{ scale }] }]}>
      <View style={[styles.pinCircle, { backgroundColor: bgColor }]}>
        <Text style={styles.pinInitial}>{initial}</Text>
      </View>

      {/* Count badge — only shown when multiple friends */}
      {count > 1 && (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{count}</Text>
        </View>
      )}

      {/* Callout shown on tap */}
      <Callout tooltip>
        <View style={styles.callout}>
          <Text style={styles.calloutPlace} numberOfLines={1}>
            {pin.place_name}
          </Text>

          {pin.friends.slice(0, 3).map((f) => (
            <View key={f.actor_id} style={styles.calloutFriendRow}>
              <View
                style={[
                  styles.calloutAvatar,
                  { backgroundColor: avatarColor(f.actor_id) },
                ]}
              >
                <Text style={styles.calloutAvatarInitial}>
                  {actorInitial(f.actor_id, f.actor_name)}
                </Text>
              </View>
              <View style={styles.calloutFriendInfo}>
                <Text style={styles.calloutFriendName}>
                  {f.actor_name ?? f.actor_id}
                </Text>
                {f.one_line_review ? (
                  <Text style={styles.calloutReview} numberOfLines={1}>
                    {f.one_line_review}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}

          {count > 3 && (
            <Text style={styles.calloutMore}>+{count - 3} more friends</Text>
          )}
        </View>
      </Callout>
    </Animated.View>
  );
}

// ─── Main Component ───────────────────────────────────────────

/**
 * Drop this inside a <MapView> to show purple friend pins.
 * Fetches the last 50 social feed items to derive place locations.
 * Places without location data in the feed metadata are silently skipped.
 */
export default function FriendPinsLayer() {
  const [pins, setPins] = useState<FriendPin[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchPins() {
      try {
        const res = await apiClient.get('/v1/social/feed?limit=50');
        const json = res.data;
        const rawItems: RawFeedItem[] = json.data?.items ?? [];

        // Only consider "loved_place" activity types for the pins
        const lovedItems = rawItems.filter(
          (item) => item.activity_type === 'place_loved',
        );

        // Aggregate by place_id
        const pinMap = new Map<string, FriendPin>();

        for (const item of lovedItems) {
          const loc = extractLocation(item);
          if (!loc) continue; // Skip items with no location data

          const existing = pinMap.get(item.place_id);
          const friendEntry = {
            actor_id: item.actor_id,
            actor_name: item.actor_name,
            one_line_review: item.metadata?.one_line_review,
          };

          if (existing) {
            // De-dupe by actor_id — keep first entry per friend per place
            const alreadyHas = existing.friends.some(
              (f) => f.actor_id === item.actor_id,
            );
            if (!alreadyHas) {
              existing.friends.push(friendEntry);
            }
          } else {
            pinMap.set(item.place_id, {
              place_id: item.place_id,
              place_name: item.place_name,
              latitude: loc.latitude,
              longitude: loc.longitude,
              friends: [friendEntry],
            });
          }
        }

        if (!cancelled) {
          setPins(Array.from(pinMap.values()));
        }
      } catch {
        // Non-blocking — friend pins are best-effort
      }
    }

    fetchPins();
    return () => {
      cancelled = true;
    };
  }, []);

  // Memoize to prevent re-rendering all pins on unrelated parent re-renders
  const pinMarkers = useMemo(
    () =>
      pins.map((pin) => (
        <Marker
          key={pin.place_id}
          coordinate={{
            latitude: pin.latitude,
            longitude: pin.longitude,
          }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
        >
          <PinMarker pin={pin} />
        </Marker>
      )),
    [pins],
  );

  // Renders null when no pins — safe to include inside MapView unconditionally
  return <>{pinMarkers}</>;
}

// ─── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Map pin
  pinWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    ...Shadows.md,
  },
  pinInitial: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  countBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.error,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  countBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Callout tooltip
  callout: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: Spacing.md,
    minWidth: 200,
    maxWidth: 260,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    ...Shadows.md,
    gap: Spacing.sm,
  },
  calloutPlace: {
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
    color: '#0558E8',
    marginBottom: 4,
  },
  calloutFriendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  calloutAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  calloutAvatarInitial: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  calloutFriendInfo: {
    flex: 1,
  },
  calloutFriendName: {
    fontSize: Typography.sizes.xs,
    fontWeight: '700',
    color: '#111827',
  },
  calloutReview: {
    fontSize: Typography.sizes.xs,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 1,
  },
  calloutMore: {
    fontSize: Typography.sizes.xs,
    color: Colors.textTertiary,
    fontStyle: 'italic',
    marginTop: 2,
  },
});
