/**
 * Mapai — Social Feed Screen
 * Phase 2: Friend activity feed with emoji reactions.
 * Route: /social
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  BorderRadius,
  Colors,
  Shadows,
  Spacing,
  Typography,
} from '@/constants/theme';

import { BACKEND_URL } from '@/constants/api';

// ─── Constants ────────────────────────────────────────────────

const TOP_INSET = Platform.OS === 'ios' ? 54 : 34;

// Reaction emoji definitions — order matches PRD FR-8 reaction bar spec
const REACTIONS = [
  { key: 'heart',    emoji: '❤️' },
  { key: 'fire',     emoji: '🔥' },
  { key: 'clap',     emoji: '👏' },
  { key: 'drool',    emoji: '🤤' },
  { key: 'bookmark', emoji: '🔖' },
  { key: 'question', emoji: '❓' },
] as const;

type ReactionKey = (typeof REACTIONS)[number]['key'];

// Avatar background palette — cycles by hash of actor_id
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

interface FeedItem {
  id: string;
  actor_id: string;
  actor_name?: string;
  activity_type: string;
  place_id: string;
  place_name: string;
  metadata?: {
    one_line_review?: string;
    rating?: number;
  };
  created_at: string;
  // Optimistic local reaction state
  myReaction?: ReactionKey | null;
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

function formatTimeAgo(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';

  const d = new Date(isoDate);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function activityLabel(activityType: string): string {
  switch (activityType) {
    case 'loved_place':   return 'loved';
    case 'visited_place': return 'visited';
    case 'reviewed':      return 'reviewed';
    case 'saved':         return 'saved';
    default:              return 'liked';
  }
}

// ─── Sub-components ───────────────────────────────────────────

function FriendAvatar({
  actorId,
  actorName,
  size = 40,
}: {
  actorId: string;
  actorName?: string;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: avatarColor(actorId),
        },
      ]}
    >
      <Text style={[styles.avatarInitial, { fontSize: size * 0.38 }]}>
        {actorInitial(actorId, actorName)}
      </Text>
    </View>
  );
}

function ReactionBar({
  itemId,
  activeReaction,
  onReact,
}: {
  itemId: string;
  activeReaction?: ReactionKey | null;
  onReact: (itemId: string, reaction: ReactionKey) => void;
}) {
  return (
    <View style={styles.reactionBar}>
      {REACTIONS.map(({ key, emoji }) => {
        const isActive = activeReaction === key;
        return (
          <TouchableOpacity
            key={key}
            style={[
              styles.reactionBtn,
              isActive && styles.reactionBtnActive,
            ]}
            onPress={() => onReact(itemId, key)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`React with ${key}`}
          >
            <Text style={styles.reactionEmoji}>{emoji}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function FeedCard({
  item,
  onReact,
  onPlacePress,
}: {
  item: FeedItem;
  onReact: (itemId: string, reaction: ReactionKey) => void;
  onPlacePress: (placeId: string, placeName: string) => void;
}) {
  const displayName = item.actor_name ?? item.actor_id;

  return (
    <View style={styles.card}>
      {/* Card header row */}
      <View style={styles.cardHeader}>
        <FriendAvatar actorId={item.actor_id} actorName={item.actor_name} />

        <View style={styles.cardMeta}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.friendName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.actionText}>
              {' '}{activityLabel(item.activity_type)}{' '}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => onPlacePress(item.place_id, item.place_name)}
            activeOpacity={0.7}
          >
            <Text style={styles.placeName} numberOfLines={1}>
              {item.place_name}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.timeAgo}>
          {formatTimeAgo(item.created_at)}
        </Text>
      </View>

      {/* One-line review */}
      {item.metadata?.one_line_review ? (
        <View style={styles.reviewRow}>
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={13}
            color={Colors.textTertiary}
          />
          <Text style={styles.reviewText} numberOfLines={2}>
            {item.metadata.one_line_review}
          </Text>
        </View>
      ) : null}

      {/* Reaction bar */}
      <ReactionBar
        itemId={item.id}
        activeReaction={item.myReaction}
        onReact={onReact}
      />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────

export default function SocialFeedScreen() {
  const router = useRouter();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creatingTrip, setCreatingTrip] = useState(false);

  // Scroll-based header shadow
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerElevation = scrollY.interpolate({
    inputRange: [0, 20],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const fetchFeed = useCallback(async (cursor?: string) => {
    try {
      const url = cursor
        ? `${BACKEND_URL}/v1/social/feed?limit=20&cursor=${encodeURIComponent(cursor)}`
        : `${BACKEND_URL}/v1/social/feed?limit=20`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Feed returned ${res.status}`);
      const json = await res.json();
      const data = json.data;
      return {
        items: (data?.items ?? []) as FeedItem[],
        nextCursor: (data?.next_cursor ?? null) as string | null,
      };
    } catch (err) {
      throw err;
    }
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { items: fetched, nextCursor: cursor } = await fetchFeed();
      setItems(fetched);
      setNextCursor(cursor);
    } catch {
      setError('Could not load your friends feed. Try again.');
    } finally {
      setLoading(false);
    }
  }, [fetchFeed]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const { items: fetched, nextCursor: cursor } = await fetchFeed();
      setItems(fetched);
      setNextCursor(cursor);
    } catch {
      setError('Could not refresh feed.');
    } finally {
      setRefreshing(false);
    }
  }, [fetchFeed]);

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { items: more, nextCursor: cursor } = await fetchFeed(nextCursor);
      setItems((prev) => [...prev, ...more]);
      setNextCursor(cursor);
    } catch {
      // Silent fail on pagination
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, fetchFeed]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // ── Plan a trip handler ──────────────────────────────────

  const handlePlanTrip = useCallback(async () => {
    if (creatingTrip) return;
    setCreatingTrip(true);
    try {
      const res = await fetch(`${BACKEND_URL}/v1/planning/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Trip', friend_ids: [] }),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const json = await res.json();
      const sessionId = json.data?.session?.id;
      if (sessionId) {
        router.push(`/planning/${sessionId}` as any);
      }
    } catch {
      // Silent fail — user can try again
    } finally {
      setCreatingTrip(false);
    }
  }, [creatingTrip, router]);

  // ── Reaction handler ────────────────────────────────────────

  const handleReact = useCallback(
    async (itemId: string, reaction: ReactionKey) => {
      // Optimistic update: toggle or set new reaction
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== itemId) return item;
          const isSame = item.myReaction === reaction;
          return { ...item, myReaction: isSame ? null : reaction };
        }),
      );

      const item = items.find((i) => i.id === itemId);
      const isSame = item?.myReaction === reaction;

      try {
        if (isSame) {
          // Remove reaction
          await fetch(`${BACKEND_URL}/v1/social/react/${itemId}`, {
            method: 'DELETE',
          });
        } else {
          // Add reaction
          await fetch(`${BACKEND_URL}/v1/social/react`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activity_id: itemId, reaction }),
          });
        }
      } catch {
        // Revert on failure
        setItems((prev) =>
          prev.map((i) => {
            if (i.id !== itemId) return i;
            return { ...i, myReaction: item?.myReaction ?? null };
          }),
        );
      }
    },
    [items],
  );

  // ── Place navigation ────────────────────────────────────────

  const handlePlacePress = useCallback(
    (placeId: string, _placeName: string) => {
      router.push(`/place/${placeId}` as any);
    },
    [router],
  );

  // ── Render ──────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      {/* Animated header with scroll shadow */}
      <Animated.View
        style={[
          styles.header,
          { paddingTop: TOP_INSET },
          {
            shadowOpacity: headerElevation.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.08],
            }),
          },
        ]}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Friends</Text>

        {/* Plan a trip button */}
        <TouchableOpacity
          style={styles.planTripBtn}
          onPress={handlePlanTrip}
          disabled={creatingTrip}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Plan a trip with friends"
        >
          {creatingTrip ? (
            <ActivityIndicator size="small" color={Colors.textOnBrand} />
          ) : (
            <Ionicons name="map" size={16} color={Colors.textOnBrand} />
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* Feed content */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.brandBlue} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons
            name="cloud-offline-outline"
            size={40}
            color={Colors.textTertiary}
          />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={loadInitial}
            activeOpacity={0.8}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false },
          )}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.brandBlue}
              colors={[Colors.brandBlue]}
            />
          }
          onScrollEndDrag={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } =
              nativeEvent;
            const nearBottom =
              layoutMeasurement.height + contentOffset.y >=
              contentSize.height - 120;
            if (nearBottom) handleLoadMore();
          }}
        >
          {items.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="people-outline"
                size={48}
                color={Colors.textTertiary}
              />
              <Text style={styles.emptyTitle}>No activity yet</Text>
              <Text style={styles.emptySubtitle}>
                When your friends love places, they will show up here.
              </Text>
            </View>
          ) : (
            items.map((item) => (
              <FeedCard
                key={item.id}
                item={item}
                onReact={handleReact}
                onPlacePress={handlePlacePress}
              />
            ))
          )}

          {loadingMore && (
            <View style={styles.loadMoreIndicator}>
              <ActivityIndicator size="small" color={Colors.brandBlue} />
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.background,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTripBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandBlue,
  },
  headerTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: 40,
    gap: Spacing.md,
  },

  // States
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  errorText: {
    color: Colors.textSecondary,
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
  retryBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.brandBlue,
    borderRadius: BorderRadius.md,
  },
  retryText: {
    color: Colors.textOnBrand,
    fontWeight: '600',
    fontSize: Typography.sizes.sm,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    lineHeight: 20,
  },
  loadMoreIndicator: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },

  // Feed card
  card: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    padding: Spacing.base,
    gap: Spacing.sm,
    ...Shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  cardMeta: {
    flex: 1,
    justifyContent: 'center',
  },
  cardTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  friendName: {
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
    color: '#111827',
  },
  actionText: {
    fontSize: Typography.sizes.sm,
    fontWeight: '400',
    color: '#6B7280',
  },
  placeName: {
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
    color: '#0558E8',
    marginTop: 2,
  },
  timeAgo: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
    flexShrink: 0,
  },

  // Review text
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 2,
  },
  reviewText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    lineHeight: 19,
    fontStyle: 'italic',
  },

  // Avatar
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Reactions
  reactionBar: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    paddingTop: Spacing.xs,
  },
  reactionBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  reactionBtnActive: {
    backgroundColor: Colors.brandViolet + '1A', // 10% opacity purple fill
    borderColor: Colors.brandViolet,
  },
  reactionEmoji: {
    fontSize: 14,
    lineHeight: 18,
  },
});
