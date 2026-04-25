/**
 * Mapai — Social Screen
 * PRD §8.3.9: Social Tab with three sub-tabs: Feed, Loved Places, Recently Viewed.
 *
 * Key changes from previous version:
 *  - Sub-tab navigation (Feed / Loved Places / Recently Viewed)
 *  - Feed now uses authenticated apiClient via useFriendFeed hook (fixes 401)
 *  - Actor names/avatars come from the enriched backend response (no N+1 fetches)
 *  - Loved Places sub-tab renders the user's full loved list inline
 *  - Recently Viewed sub-tab renders the user's view history
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
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
import { useAuth } from '@/context/AuthContext';
import apiClient from '@/services/api/client';
import {
  FeedItem,
  RecentPlace,
  useFriendFeed,
  useLovedPlaces,
  useRecentPlacesViewed,
} from '@/services/api/hooks';

// ─── Constants ────────────────────────────────────────────────
const TOP_INSET = Platform.OS === 'ios' ? 54 : 34;

const REACTIONS = [
  { key: 'heart',    emoji: '\u2764\uFE0F' },
  { key: 'fire',     emoji: '\uD83D\uDD25' },
  { key: 'clap',     emoji: '\uD83D\uDC4F' },
  { key: 'drool',    emoji: '\uD83E\uDD24' },
  { key: 'bookmark', emoji: '\uD83D\uDD16' },
  { key: 'question', emoji: '\u2753' },
] as const;
type ReactionKey = (typeof REACTIONS)[number]['key'];

const AVATAR_COLORS = [
  '#0558E8', '#7C3AED', '#10B981',
  '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6',
];

type SubTab = 'feed' | 'loved' | 'recent';

// ─── Helpers ──────────────────────────────────────────────────
function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function actorInitial(id: string, name?: string | null): string {
  if (name && name.length > 0) return name[0].toUpperCase();
  return id[0]?.toUpperCase() ?? '?';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  if (h < 24) return h + 'h ago';
  if (d < 7) return d + 'd ago';
  return new Date(iso).toLocaleDateString();
}

function activityLabel(type: string): string {
  switch (type) {
    case 'place_loved':   return ' loved ';
    case 'place_visited': return ' visited ';
    case 'review_posted': return ' reviewed ';
    case 'place_shared':  return ' shared ';
    default:              return ' checked out ';
  }
}

function relativeDate(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return d + ' days ago';
  const w = Math.floor(d / 7);
  if (w < 5) return w + (w > 1 ? ' weeks ago' : ' week ago');
  const mo = Math.floor(d / 30);
  return mo + (mo > 1 ? ' months ago' : ' month ago');
}

// ─── Feed Card ────────────────────────────────────────────────
interface FeedCardProps {
  item: FeedItem & { myReaction?: ReactionKey | null };
  onReact: (id: string, reaction: ReactionKey) => void;
  onPlacePress: (placeId: string, placeName?: string) => void;
}

function FeedCard({ item, onReact, onPlacePress }: FeedCardProps) {
  const bg = avatarColor(item.actor_id);
  const initial = actorInitial(item.actor_id, item.actor_name);
  const displayName = item.actor_name ?? item.actor_username ?? 'A friend';

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => onPlacePress(item.place_id, item.place_name)}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { width: 36, height: 36, borderRadius: 18, backgroundColor: bg }]}>
          <Text style={[styles.avatarInitial, { fontSize: 14 }]}>{initial}</Text>
        </View>
        <View style={styles.cardMeta}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.friendName}>{displayName}</Text>
            <Text style={styles.actionText}>{activityLabel(item.activity_type)}</Text>
          </View>
          <Text style={styles.placeName} numberOfLines={1}>{item.place_name ?? item.place_id}</Text>
        </View>
        <Text style={styles.timeAgo}>{timeAgo(item.created_at)}</Text>
      </View>

      {!!item.metadata?.one_line_review && (
        <View style={styles.reviewRow}>
          <Ionicons name="chatbubble-outline" size={13} color={Colors.textTertiary} />
          <Text style={styles.reviewText} numberOfLines={2}>
            "{item.metadata.one_line_review}"
          </Text>
        </View>
      )}

      <View style={styles.reactionBar}>
        {REACTIONS.map(({ key, emoji }) => (
          <TouchableOpacity
            key={key}
            style={[styles.reactionBtn, item.myReaction === key && styles.reactionBtnActive]}
            onPress={() => onReact(item.id, key)}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text style={styles.reactionEmoji}>{emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </TouchableOpacity>
  );
}

// ─── Loved Place Card ─────────────────────────────────────────
interface LovedPlace {
  id: string;
  place_id: string;
  place_name?: string;
  rating?: number;
  one_line_review?: string;
  visit_count?: number;
  last_visited_at?: string;
  visibility?: string;
}

function LovedCard({ item, onPress }: { item: LovedPlace; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FEE2E2' }]}>
          <Ionicons name="heart" size={18} color="#EF4444" />
        </View>
        <View style={styles.cardMeta}>
          <Text style={styles.placeName} numberOfLines={1}>{item.place_name ?? item.place_id}</Text>
          {item.last_visited_at && (
            <Text style={styles.timeAgo}>Last visited {relativeDate(item.last_visited_at)}</Text>
          )}
        </View>
        {item.visit_count != null && item.visit_count > 1 && (
          <View style={styles.visitBadge}>
            <Text style={styles.visitBadgeText}>{item.visit_count}x</Text>
          </View>
        )}
      </View>
      {!!item.one_line_review && (
        <View style={styles.reviewRow}>
          <Ionicons name="chatbubble-outline" size={13} color={Colors.textTertiary} />
          <Text style={styles.reviewText} numberOfLines={2}>"{item.one_line_review}"</Text>
        </View>
      )}
      {item.rating != null && (
        <View style={{ flexDirection: 'row', gap: 2 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Ionicons
              key={i}
              name={i < item.rating! ? 'star' : 'star-outline'}
              size={13}
              color="#F59E0B"
            />
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Recent Place Card ────────────────────────────────────────
function RecentCard({ item, onPress }: { item: RecentPlace; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFF6FF' }]}>
          <Ionicons name="location-outline" size={18} color={Colors.brandBlue} />
        </View>
        <View style={styles.cardMeta}>
          <Text style={styles.placeName} numberOfLines={1}>{item.place_name ?? item.place_id}</Text>
          <Text style={styles.timeAgo}>Viewed {relativeDate(item.last_viewed_at)}</Text>
        </View>
        {item.view_count > 1 && (
          <View style={styles.visitBadge}>
            <Text style={styles.visitBadgeText}>{item.view_count}x</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ─────────────────────────────────────────────
export default function SocialScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SubTab>('feed');
  const [localReactions, setLocalReactions] = useState<Record<string, ReactionKey | null>>({});

  const { data: feedData, isLoading: feedLoading, isError: feedError, refetch: refetchFeed } = useFriendFeed(20);
  const { data: lovedData, isLoading: lovedLoading, refetch: refetchLoved } = useLovedPlaces(user?.id);
  const { data: recentPlaces = [], isLoading: recentLoading, refetch: refetchRecent } = useRecentPlacesViewed(20);

  const lovedPlaces: LovedPlace[] = (lovedData as any)?.places ?? lovedData ?? [];

  const handleReact = useCallback(async (activityId: string, reaction: ReactionKey) => {
    const current = localReactions[activityId] ?? null;
    const next = current === reaction ? null : reaction;
    setLocalReactions(prev => ({ ...prev, [activityId]: next }));
    try {
      if (next) {
        await apiClient.post('/v1/social/react', { activity_id: activityId, reaction: next });
      } else {
        await apiClient.delete('/v1/social/react/' + activityId);
      }
    } catch {
      setLocalReactions(prev => ({ ...prev, [activityId]: current }));
    }
  }, [localReactions]);

  const handlePlacePress = useCallback((placeId: string, placeName?: string) => {
    router.push({ pathname: '/place/[id]', params: { id: placeId, name: placeName } } as any);
  }, [router]);

  const handleRefresh = useCallback(() => {
    if (activeTab === 'feed') refetchFeed();
    else if (activeTab === 'loved') refetchLoved();
    else refetchRecent();
  }, [activeTab, refetchFeed, refetchLoved, refetchRecent]);

  const feedItems = (feedData?.items ?? []).map(item => ({
    ...item,
    myReaction: localReactions[item.id] ?? null,
  }));

  const isLoading = activeTab === 'feed' ? feedLoading
    : activeTab === 'loved' ? lovedLoading
    : recentLoading;

  return (
    <View style={[styles.root, { paddingTop: TOP_INSET }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Social</Text>
        <TouchableOpacity
          style={styles.planTripBtn}
          onPress={() => router.push('/friends' as any)}
          accessibilityLabel="Friends"
        >
          <Ionicons name="people-outline" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Sub-tab bar */}
      <View style={styles.tabBar}>
        {([
          { key: 'feed',   label: 'Feed',           icon: 'newspaper-outline' },
          { key: 'loved',  label: 'Loved Places',   icon: 'heart-outline' },
          { key: 'recent', label: 'Recently Viewed', icon: 'time-outline' },
        ] as { key: SubTab; label: string; icon: any }[]).map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={activeTab === tab.key ? Colors.brandBlue : Colors.textSecondary}
            />
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.brandBlue} />
        </View>
      ) : activeTab === 'feed' ? (
        feedError ? (
          <View style={styles.centered}>
            <Ionicons name="cloud-offline-outline" size={40} color={Colors.textTertiary} />
            <Text style={styles.errorText}>Could not load feed. Check your connection.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetchFeed()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={feedItems}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={false} onRefresh={handleRefresh} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color={Colors.textTertiary} />
                <Text style={styles.emptyTitle}>No activity yet</Text>
                <Text style={styles.emptySubtitle}>
                  When your friends love or visit places, they will show up here.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <FeedCard item={item} onReact={handleReact} onPlacePress={handlePlacePress} />
            )}
          />
        )
      ) : activeTab === 'loved' ? (
        <FlatList
          data={lovedPlaces}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={false} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="heart-outline" size={48} color={Colors.textTertiary} />
              <Text style={styles.emptyTitle}>No loved places yet</Text>
              <Text style={styles.emptySubtitle}>
                Tap the heart on any place detail screen to save it here.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <LovedCard
              item={item}
              onPress={() => handlePlacePress(item.place_id, item.place_name)}
            />
          )}
        />
      ) : (
        <FlatList
          data={recentPlaces}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={false} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="time-outline" size={48} color={Colors.textTertiary} />
              <Text style={styles.emptyTitle}>No recently viewed places</Text>
              <Text style={styles.emptySubtitle}>
                Places you open will appear here so you can find them again quickly.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <RecentCard
              item={item}
              onPress={() => handlePlacePress(item.place_id, item.place_name)}
            />
          )}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
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
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  planTripBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.brandBlue },
  headerTitle: { fontSize: Typography.sizes.md, fontWeight: '700', color: Colors.textPrimary },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.07)', backgroundColor: Colors.background },
  tabItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.sm, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabItemActive: { borderBottomColor: Colors.brandBlue },
  tabLabel: { fontSize: 11, fontWeight: '500', color: Colors.textSecondary },
  tabLabelActive: { color: Colors.brandBlue, fontWeight: '700' },
  listContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: 40, gap: Spacing.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  errorText: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, textAlign: 'center', paddingHorizontal: Spacing.xl },
  retryBtn: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, backgroundColor: Colors.brandBlue, borderRadius: BorderRadius.md },
  retryText: { color: '#fff', fontWeight: '600', fontSize: Typography.sizes.sm },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.sizes.md, fontWeight: '700', color: Colors.textPrimary },
  emptySubtitle: { fontSize: Typography.sizes.sm, color: Colors.textSecondary, textAlign: 'center', paddingHorizontal: Spacing.xl, lineHeight: 20 },
  card: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', padding: Spacing.base, gap: Spacing.sm, ...Shadows.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  cardMeta: { flex: 1, justifyContent: 'center' },
  cardTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' },
  friendName: { fontSize: Typography.sizes.sm, fontWeight: '700', color: '#111827' },
  actionText: { fontSize: Typography.sizes.sm, fontWeight: '400', color: '#6B7280' },
  placeName: { fontSize: Typography.sizes.sm, fontWeight: '700', color: Colors.brandBlue, marginTop: 2 },
  timeAgo: { fontSize: 11, color: '#9CA3AF', marginTop: 2, flexShrink: 0 },
  reviewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 2 },
  reviewText: { flex: 1, fontSize: Typography.sizes.sm, color: Colors.textSecondary, lineHeight: 19, fontStyle: 'italic' },
  avatar: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarInitial: { color: '#FFFFFF', fontWeight: '700' },
  reactionBar: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', paddingTop: Spacing.xs },
  reactionBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  reactionBtnActive: { backgroundColor: '#7C3AED1A', borderColor: '#7C3AED' },
  reactionEmoji: { fontSize: 14, lineHeight: 18 },
  visitBadge: { backgroundColor: Colors.brandBlue + '15', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start' },
  visitBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.brandBlue },
});
