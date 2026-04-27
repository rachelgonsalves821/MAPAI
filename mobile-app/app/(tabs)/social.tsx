import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Platform,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows, Spacing, Typography, BorderRadius } from '@/constants/theme';
import apiClient from '@/services/api/client';
import { useFriendRequests, useFriends, type FriendEntry } from '@/services/api/social';
import { useLovedPlaces } from '@/services/api/hooks';
import { useAuth } from '@/context/AuthContext';

// ─── Types ──────────────────────────────────────────────────

const REACTIONS = [
    { key: 'heart',    emoji: '❤️' },
    { key: 'fire',     emoji: '🔥' },
    { key: 'clap',     emoji: '👏' },
    { key: 'drool',    emoji: '🤤' },
    { key: 'bookmark', emoji: '🔖' },
    { key: 'question', emoji: '❓' },
] as const;

type ReactionKey = (typeof REACTIONS)[number]['key'];

interface FeedItem {
    id: string;
    actor_id: string;
    actor_name?: string;
    activity_type: string;
    place_id: string;
    place_name: string;
    metadata?: { one_line_review?: string; rating?: number };
    created_at: string;
    myReaction?: ReactionKey | null;
}

// ─── Helpers ────────────────────────────────────────────────

const AVATAR_COLORS = ['#0558E8', '#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6'];

function avatarColor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffff;
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatTimeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60_000);
    const hrs = Math.floor(ms / 3_600_000);
    const days = Math.floor(ms / 86_400_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    if (days === 1) return 'Yesterday';
    const d = new Date(iso);
    return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getDate()}`;
}

function activityLabel(type: string): string {
    switch (type) {
        case 'loved_place':   return 'loved';
        case 'visited_place': return 'visited';
        case 'reviewed':      return 'reviewed';
        case 'saved':         return 'saved';
        default:              return 'liked';
    }
}

// ─── Sub-components ─────────────────────────────────────────

function FriendAvatar({ actorId, actorName, size = 36 }: { actorId: string; actorName?: string; size?: number }) {
    const initial = actorName?.[0]?.toUpperCase() ?? actorId[0]?.toUpperCase() ?? '?';
    return (
        <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(actorId) }]}>
            <Text style={[s.avatarInitial, { fontSize: size * 0.38 }]}>{initial}</Text>
        </View>
    );
}

function ReactionBar({ itemId, active, onReact }: { itemId: string; active?: ReactionKey | null; onReact: (id: string, r: ReactionKey) => void }) {
    return (
        <View style={s.reactionBar}>
            {REACTIONS.map(({ key, emoji }) => (
                <TouchableOpacity
                    key={key}
                    style={[s.reactionBtn, active === key && s.reactionBtnActive]}
                    onPress={() => onReact(itemId, key)}
                    activeOpacity={0.75}
                >
                    <Text style={s.reactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

function FeedCard({ item, onReact, onPlace }: { item: FeedItem; onReact: (id: string, r: ReactionKey) => void; onPlace: (id: string) => void }) {
    return (
        <View style={s.card}>
            <View style={s.cardHeader}>
                <FriendAvatar actorId={item.actor_id} actorName={item.actor_name} />
                <View style={s.cardMeta}>
                    <View style={s.cardTitleRow}>
                        <Text style={s.friendName}>{item.actor_name ?? item.actor_id}</Text>
                        <Text style={s.actionText}> {activityLabel(item.activity_type)} </Text>
                    </View>
                    <TouchableOpacity onPress={() => onPlace(item.place_id)} activeOpacity={0.7}>
                        <Text style={s.placeName} numberOfLines={1}>{item.place_name}</Text>
                    </TouchableOpacity>
                </View>
                <Text style={s.timeAgo}>{formatTimeAgo(item.created_at)}</Text>
            </View>
            {item.metadata?.one_line_review ? (
                <View style={s.reviewRow}>
                    <Ionicons name="chatbubble-ellipses-outline" size={13} color={Colors.textTertiary} />
                    <Text style={s.reviewText} numberOfLines={2}>{item.metadata.one_line_review}</Text>
                </View>
            ) : null}
            <ReactionBar itemId={item.id} active={item.myReaction} onReact={onReact} />
        </View>
    );
}

// ─── Friends Tab ─────────────────────────────────────────────

const AVATAR_COLORS_FRIENDS = ['#0558E8', '#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6'];

function friendAvatarColor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffff;
    return AVATAR_COLORS_FRIENDS[hash % AVATAR_COLORS_FRIENDS.length];
}

function friendInitials(displayName: string, username: string): string {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (displayName[0] ?? username[0] ?? '?').toUpperCase();
}

function FriendRow({ entry }: { entry: FriendEntry }) {
    const user = entry.friend;
    return (
        <View style={s.friendRow}>
            <View style={[
                s.friendAvatar,
                { backgroundColor: friendAvatarColor(user.id) },
            ]}>
                <Text style={s.friendAvatarText}>
                    {friendInitials(user.display_name, user.username)}
                </Text>
            </View>
            <View style={s.friendInfo}>
                <Text style={s.friendDisplayName} numberOfLines={1}>{user.display_name}</Text>
                <Text style={s.friendUsername}>@{user.username}</Text>
            </View>
        </View>
    );
}

function FriendsTab() {
    const router = useRouter();
    const { data: friends, isLoading, isError, refetch, isRefetching } = useFriends();
    const { data: requests } = useFriendRequests();
    const incomingCount = requests?.incoming?.length ?? 0;

    const hasFriends = (friends?.length ?? 0) > 0;

    return (
        <ScrollView
            style={s.scroll}
            contentContainerStyle={[s.friendsScrollContent, !hasFriends && { flex: 1 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
                <RefreshControl
                    refreshing={isRefetching}
                    onRefresh={() => refetch()}
                    tintColor={Colors.brandBlue}
                    colors={[Colors.brandBlue]}
                />
            }
        >
            {/* Action row — Add Friends + Requests */}
            <View style={s.friendsActionRow}>
                <TouchableOpacity
                    style={s.friendsActionBtn}
                    onPress={() => router.push('/add-friends' as any)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Add friends"
                >
                    <View style={s.friendsActionIcon}>
                        <Ionicons name="person-add-outline" size={18} color={Colors.brandBlue} />
                    </View>
                    <Text style={s.friendsActionLabel}>Add Friends</Text>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={s.friendsActionBtn}
                    onPress={() => router.push('/friend-requests' as any)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Friend requests"
                >
                    <View style={s.friendsActionIcon}>
                        <Ionicons name="mail-outline" size={18} color={Colors.brandViolet} />
                    </View>
                    <Text style={s.friendsActionLabel}>Friend Requests</Text>
                    <View style={s.friendsActionRight}>
                        {incomingCount > 0 && (
                            <View style={s.requestBadge}>
                                <Text style={s.requestBadgeText}>{incomingCount}</Text>
                            </View>
                        )}
                        <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
                    </View>
                </TouchableOpacity>
            </View>

            {/* Friends list */}
            {isLoading ? (
                <View style={s.centered}>
                    <ActivityIndicator size="large" color={Colors.brandBlue} />
                </View>
            ) : isError ? (
                <View style={s.centered}>
                    <Text style={s.errorText}>Could not load friends.</Text>
                    <TouchableOpacity style={s.retryBtn} onPress={() => refetch()}>
                        <Text style={s.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : hasFriends ? (
                <View style={s.friendsList}>
                    <Text style={s.friendsListHeader}>
                        {friends!.length} Friend{friends!.length !== 1 ? 's' : ''}
                    </Text>
                    {friends!.map((entry) => (
                        <FriendRow key={entry.friend_id} entry={entry} />
                    ))}
                </View>
            ) : (
                <View style={s.emptyState}>
                    <Ionicons name="people-outline" size={48} color={Colors.textTertiary} />
                    <Text style={s.emptyTitle}>No friends yet</Text>
                    <Text style={s.emptySubtitle}>
                        Search for people you know and send a friend request.
                    </Text>
                </View>
            )}
        </ScrollView>
    );
}

// ─── Loved Tab ──────────────────────────────────────────────

function LovedTab() {
    const router = useRouter();
    const { user } = useAuth();
    const { data, isLoading, refetch, isRefetching } = useLovedPlaces(user?.id);
    const places: any[] = data?.places ?? [];

    if (isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40 }}>
                <ActivityIndicator size="large" color={Colors.brandBlue} />
            </View>
        );
    }

    if (places.length === 0) {
        return (
            <View style={s.emptyState}>
                <View style={s.emptyIcon}>
                    <Ionicons name="heart" size={40} color="#EF4444" />
                </View>
                <Text style={s.emptyTitle}>No loved places yet</Text>
                <Text style={s.emptySubtitle}>
                    Tap the heart on places you love and they'll appear here.
                </Text>
            </View>
        );
    }

    return (
        <ScrollView
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.brandBlue} />}
            contentContainerStyle={{ paddingBottom: 32 }}
        >
            {places.map((place: any) => (
                <TouchableOpacity
                    key={place.place_id || place.id}
                    style={lovedStyles.card}
                    onPress={() => router.push(`/place/${place.place_id || place.id}` as any)}
                    activeOpacity={0.7}
                >
                    <View style={lovedStyles.avatar}>
                        <Ionicons name="heart" size={20} color="#EF4444" />
                    </View>
                    <View style={lovedStyles.info}>
                        <Text style={lovedStyles.name} numberOfLines={1}>
                            {place.place_name || place.name || 'Unnamed place'}
                        </Text>
                        {place.one_line_review ? (
                            <Text style={lovedStyles.review} numberOfLines={1}>{place.one_line_review}</Text>
                        ) : place.personal_note ? (
                            <Text style={lovedStyles.review} numberOfLines={1}>{place.personal_note}</Text>
                        ) : null}
                        {place.visit_count > 0 && (
                            <Text style={lovedStyles.visits}>Visited {place.visit_count}x</Text>
                        )}
                    </View>
                    {place.rating && (
                        <View style={lovedStyles.ratingBadge}>
                            <Ionicons name="star" size={12} color="#F59E0B" />
                            <Text style={lovedStyles.ratingText}>{place.rating}</Text>
                        </View>
                    )}
                    <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
                </TouchableOpacity>
            ))}
            <TouchableOpacity
                style={lovedStyles.seeAllBtn}
                onPress={() => router.push('/loved-places' as any)}
            >
                <Text style={lovedStyles.seeAllText}>See All Loved Places</Text>
                <Ionicons name="arrow-forward" size={16} color={Colors.brandBlue} />
            </TouchableOpacity>
        </ScrollView>
    );
}

const lovedStyles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        marginHorizontal: Spacing.md,
        marginBottom: Spacing.sm,
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        ...Shadows.sm,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#FEE2E2',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: Spacing.sm,
    },
    info: { flex: 1 },
    name: {
        fontSize: Typography.sizes.md,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    review: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        marginTop: 2,
        fontStyle: 'italic',
    },
    visits: {
        fontSize: Typography.sizes.xs,
        color: Colors.textTertiary,
        marginTop: 2,
    },
    ratingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 999,
        marginRight: Spacing.xs,
    },
    ratingText: {
        fontSize: Typography.sizes.xs,
        fontWeight: '600',
        color: '#92400E',
        marginLeft: 2,
    },
    seeAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.md,
        gap: 6,
    },
    seeAllText: {
        fontSize: Typography.sizes.sm,
        fontWeight: '600',
        color: Colors.brandBlue,
    },
});

// ─── Main Screen ────────────────────────────────────────────

export default function SocialScreen() {
    const router = useRouter();
    const [activeTab, setActiveTab] = React.useState('Feed');

    // Feed state
    const [items, setItems] = useState<FeedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchFeed = useCallback(async () => {
        const res = await apiClient.get('/v1/social/feed?limit=20');
        return (res.data?.data?.items ?? []) as FeedItem[];
    }, []);

    const loadInitial = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setItems(await fetchFeed());
        } catch {
            setError('Could not load feed.');
        } finally {
            setLoading(false);
        }
    }, [fetchFeed]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        try { setItems(await fetchFeed()); } catch { /* keep existing */ }
        setRefreshing(false);
    }, [fetchFeed]);

    useEffect(() => { loadInitial(); }, [loadInitial]);

    const handleReact = useCallback(async (itemId: string, reaction: ReactionKey) => {
        const prev = items.find(i => i.id === itemId)?.myReaction;
        const isSame = prev === reaction;

        setItems(cur => cur.map(i => i.id === itemId ? { ...i, myReaction: isSame ? null : reaction } : i));

        try {
            if (isSame) {
                await apiClient.delete(`/v1/social/react/${itemId}`);
            } else {
                await apiClient.post('/v1/social/react', { activity_id: itemId, reaction });
            }
        } catch {
            setItems(cur => cur.map(i => i.id === itemId ? { ...i, myReaction: prev ?? null } : i));
        }
    }, [items]);

    const handlePlacePress = useCallback((placeId: string) => {
        router.push(`/place/${placeId}` as any);
    }, [router]);

    // ─── Render ─────────────────────────────────────────────

    const renderFeed = () => {
        if (loading) {
            return <View style={s.centered}><ActivityIndicator size="large" color={Colors.brandBlue} /></View>;
        }
        if (error) {
            return (
                <View style={s.centered}>
                    <Ionicons name="cloud-offline-outline" size={40} color={Colors.textTertiary} />
                    <Text style={s.errorText}>{error}</Text>
                    <TouchableOpacity style={s.retryBtn} onPress={loadInitial}><Text style={s.retryText}>Retry</Text></TouchableOpacity>
                </View>
            );
        }
        return (
            <ScrollView
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.brandBlue} colors={[Colors.brandBlue]} />}
            >
                {items.length === 0 ? (
                    <View style={s.emptyFeed}>
                        <Ionicons name="newspaper-outline" size={48} color={Colors.textTertiary} />
                        <Text style={s.emptyTitle}>No activity yet</Text>
                        <Text style={s.emptySubtitle}>When your friends love places, they'll show up here.</Text>
                    </View>
                ) : (
                    items.map(item => (
                        <FeedCard key={item.id} item={item} onReact={handleReact} onPlace={handlePlacePress} />
                    ))
                )}
            </ScrollView>
        );
    };

    return (
        <View style={s.container}>
            <View style={s.header}>
                <Text style={s.headerTitle}>Social</Text>
                <View style={s.pulseDot} />
            </View>

            <View style={s.tabRow}>
                {['Feed', 'Friends', 'Loved', 'Plans'].map((tab) => (
                    <TouchableOpacity
                        key={tab}
                        onPress={() => setActiveTab(tab)}
                        style={[s.tab, activeTab === tab && s.tabActive]}
                    >
                        <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>{tab}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={s.content}>
                {activeTab === 'Feed' ? renderFeed() : activeTab === 'Friends' ? (
                    <FriendsTab />
                ) : activeTab === 'Loved' ? (
                    <LovedTab />
                ) : (
                    <View style={s.emptyState}>
                        <View style={s.emptyIcon}>
                            <Ionicons name="calendar" size={40} color={Colors.brandBlue} />
                        </View>
                        <Text style={s.emptyTitle}>Your schedule is wide open</Text>
                        <Text style={s.emptySubtitle}>
                            When you find spots or book rides, they'll show up here.
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );
}

// ─── Styles ─────────────────────────────────────────────────

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingHorizontal: 20, paddingBottom: 16, gap: 12,
    },
    headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5 },
    pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success, marginTop: 4 },
    tabRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginBottom: 12 },
    tab: {
        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
        backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder,
    },
    tabActive: { backgroundColor: Colors.brandBlue, borderColor: Colors.brandBlue },
    tabText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '500' },
    tabTextActive: { color: '#FFFFFF', fontWeight: '600' },
    content: { flex: 1 },

    // Feed
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 100, gap: 12 },
    friendsScrollContent: { paddingTop: 12, paddingBottom: 100 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    errorText: { color: Colors.textSecondary, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
    retryBtn: { paddingHorizontal: 24, paddingVertical: 10, backgroundColor: Colors.brandBlue, borderRadius: 12 },
    retryText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },

    // Feed cards
    card: {
        backgroundColor: Colors.background, borderRadius: BorderRadius.md,
        borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', padding: 16, gap: 8,
        ...Shadows.sm,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    cardMeta: { flex: 1, justifyContent: 'center' },
    cardTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' },
    friendName: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    actionText: { fontSize: 13, color: Colors.textSecondary },
    placeName: { fontSize: 13, fontWeight: '700', color: Colors.brandBlue, marginTop: 2 },
    timeAgo: { fontSize: 11, color: Colors.textTertiary, marginTop: 2, flexShrink: 0 },
    reviewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 2 },
    reviewText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 19, fontStyle: 'italic' },

    // Avatar
    avatar: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    avatarInitial: { color: '#FFFFFF', fontWeight: '700' },

    // Reactions
    reactionBar: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', paddingTop: 4 },
    reactionBtn: {
        width: 28, height: 28, borderRadius: 14, backgroundColor: '#F9FAFB',
        alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
    },
    reactionBtnActive: { backgroundColor: Colors.brandViolet + '1A', borderColor: Colors.brandViolet },
    reactionEmoji: { fontSize: 14, lineHeight: 18 },

    // Empty states
    emptyFeed: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
    emptyState: {
        alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 40, paddingTop: 48, paddingBottom: 40, gap: 12,
    },
    emptyIcon: {
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: 'rgba(5, 88, 232, 0.08)',
        alignItems: 'center', justifyContent: 'center', marginBottom: 24,
    },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center', marginBottom: 8, marginTop: 16 },
    emptySubtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    primaryButton: { backgroundColor: Colors.brandBlue, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
    buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },

    // Friends tab action row
    friendsActionRow: {
        marginHorizontal: 16, marginBottom: 8,
        borderRadius: BorderRadius.md,
        borderWidth: 1, borderColor: Colors.surfaceBorder,
        overflow: 'hidden',
        ...Shadows.sm,
    },
    friendsActionBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 14, paddingHorizontal: 16,
        backgroundColor: Colors.background,
        borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
    },
    friendsActionIcon: {
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: Colors.surface,
        alignItems: 'center', justifyContent: 'center',
    },
    friendsActionLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: Colors.textPrimary },
    friendsActionRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    requestBadge: {
        minWidth: 20, height: 20, borderRadius: 10,
        backgroundColor: Colors.brandBlue,
        alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
    },
    requestBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },

    // Friends list
    friendsList: { paddingHorizontal: 16, paddingTop: 8 },
    friendsListHeader: {
        fontSize: 12, fontWeight: '600', color: Colors.textTertiary,
        textTransform: 'uppercase', letterSpacing: 0.5,
        paddingVertical: 10,
    },
    friendRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
    },
    friendAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    friendAvatarText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    friendInfo: { flex: 1 },
    friendDisplayName: { fontSize: 15, fontWeight: '500', color: Colors.textPrimary },
    friendUsername: { fontSize: 13, color: Colors.textTertiary, marginTop: 1 },
});
