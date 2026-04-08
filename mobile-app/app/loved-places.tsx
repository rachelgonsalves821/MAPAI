/**
 * Mapai — Loved Places Screen
 * PRD §FR-8.5: Full list of places the current user (or any viewed user) has loved.
 * Supports pull-to-refresh, swipe-to-unlove (long-press menu), and navigation to place detail.
 */

import React, { useCallback, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Platform,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
    Alert,
    ActionSheetIOS,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useLovedPlaces, useUnlovePlace } from '@/services/api/hooks';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LovedPlace {
    id: string;
    place_id: string;
    user_id: string;
    place_name?: string;
    rating?: number;
    one_line_review?: string;
    personal_note?: string;
    visit_count?: number;
    first_visited_at?: string;
    last_visited_at?: string;
    created_at?: string;
    visibility?: 'public' | 'friends' | 'private';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeDate(iso?: string): string {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return mins <= 1 ? 'just now' : `${mins} minutes ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return months === 1 ? '1 month ago' : `${months} months ago`;
    const years = Math.floor(months / 12);
    return years === 1 ? '1 year ago' : `${years} years ago`;
}

function StarRating({ value }: { value: number }) {
    const full = Math.round(value);
    return (
        <View style={starStyles.row}>
            {[1, 2, 3, 4, 5].map((i) => (
                <Ionicons
                    key={i}
                    name={i <= full ? 'star' : 'star-outline'}
                    size={12}
                    color={i <= full ? '#F59E0B' : Colors.textTertiary}
                />
            ))}
            <Text style={starStyles.label}>{value}/5</Text>
        </View>
    );
}

const starStyles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    label: { fontSize: Typography.sizes.xs, color: Colors.textSecondary, fontWeight: '600', marginLeft: 4 },
});

// ─── Place Card ───────────────────────────────────────────────────────────────

interface PlaceCardProps {
    item: LovedPlace;
    onPress: (placeId: string) => void;
    onUnlove: (placeId: string, placeName: string) => void;
    isOwner: boolean;
}

function PlaceCard({ item, onPress, onUnlove, isOwner }: PlaceCardProps) {
    const name = item.place_name || 'Unknown Place';
    const relDate = formatRelativeDate(item.last_visited_at || item.created_at);

    const handleLongPress = useCallback(() => {
        if (!isOwner) return;

        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options: ['Cancel', 'Remove from Loved Places'],
                    cancelButtonIndex: 0,
                    destructiveButtonIndex: 1,
                    title: name,
                },
                (buttonIndex) => {
                    if (buttonIndex === 1) {
                        confirmUnlove(item.place_id, name);
                    }
                }
            );
        } else {
            Alert.alert(
                name,
                'What would you like to do?',
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Remove from Loved Places',
                        style: 'destructive',
                        onPress: () => confirmUnlove(item.place_id, name),
                    },
                ]
            );
        }
    }, [item.place_id, name, isOwner]);

    function confirmUnlove(placeId: string, placeName: string) {
        Alert.alert(
            'Remove from Loved Places?',
            `"${placeName}" will be removed from your loved places.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => onUnlove(placeId, placeName),
                },
            ]
        );
    }

    return (
        <TouchableOpacity
            style={styles.card}
            onPress={() => onPress(item.place_id)}
            onLongPress={handleLongPress}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`${name}. Tap to view details.${isOwner ? ' Long press to remove.' : ''}`}
        >
            {/* Thumbnail placeholder */}
            <View style={styles.cardThumb}>
                <Ionicons name="location" size={22} color={Colors.brandBlue} />
            </View>

            <View style={styles.cardBody}>
                {/* Name row */}
                <View style={styles.cardNameRow}>
                    <Text style={styles.cardName} numberOfLines={1}>{name}</Text>
                    {item.visit_count != null && item.visit_count > 1 && (
                        <View style={styles.visitBadge}>
                            <Text style={styles.visitBadgeText}>
                                Visited {item.visit_count}x
                            </Text>
                        </View>
                    )}
                </View>

                {/* Rating */}
                {typeof item.rating === 'number' && item.rating > 0 && (
                    <View style={styles.cardMeta}>
                        <StarRating value={item.rating} />
                    </View>
                )}

                {/* One-line review or personal note */}
                {(item.one_line_review || item.personal_note) ? (
                    <Text style={styles.cardReview} numberOfLines={2}>
                        "{item.one_line_review || item.personal_note}"
                    </Text>
                ) : null}

                {/* Last visited */}
                {relDate ? (
                    <Text style={styles.cardDate}>{relDate}</Text>
                ) : null}
            </View>

            <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} style={styles.cardChevron} />
        </TouchableOpacity>
    );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ isOwner }: { isOwner: boolean }) {
    return (
        <View style={styles.emptyContainer}>
            <View style={styles.emptyIconBg}>
                <Ionicons name="heart-outline" size={36} color={Colors.error} />
            </View>
            <Text style={styles.emptyTitle}>
                {isOwner ? 'No loved places yet' : 'Nothing to show yet'}
            </Text>
            <Text style={styles.emptySubtitle}>
                {isOwner
                    ? 'Explore and tap the heart on places you love!'
                    : "This person hasn't shared any loved places."}
            </Text>
        </View>
    );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LovedPlacesScreen() {
    const router = useRouter();
    const { user } = useAuth();

    // Support optional `userId` param so friends' lists are viewable too
    const params = useLocalSearchParams<{ userId?: string }>();
    const targetUserId = params.userId || user?.id;
    const isOwner = !params.userId || params.userId === user?.id;

    const { data, isLoading, refetch, isRefetching } = useLovedPlaces(targetUserId);
    const unlovePlace = useUnlovePlace();

    const places: LovedPlace[] = data?.places ?? data ?? [];
    const count: number = data?.count ?? places.length;

    const handlePressPlace = useCallback(
        (placeId: string) => {
            router.push(`/place/${placeId}` as any);
        },
        [router]
    );

    const handleUnlove = useCallback(
        (placeId: string, placeName: string) => {
            unlovePlace.mutate(placeId, {
                onError: () => {
                    Alert.alert('Error', `Could not remove "${placeName}". Please try again.`);
                },
            });
        },
        [unlovePlace]
    );

    const renderItem = useCallback(
        ({ item }: { item: LovedPlace }) => (
            <PlaceCard
                item={item}
                onPress={handlePressPlace}
                onUnlove={handleUnlove}
                isOwner={isOwner}
            />
        ),
        [handlePressPlace, handleUnlove, isOwner]
    );

    const keyExtractor = useCallback(
        (item: LovedPlace) => item.id ?? item.place_id,
        []
    );

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                >
                    <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>

                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>
                        {isOwner ? 'My Loved Places' : 'Loved Places'}
                    </Text>
                    {!isLoading && count > 0 && (
                        <View style={styles.countBadge}>
                            <Text style={styles.countBadgeText}>{count}</Text>
                        </View>
                    )}
                </View>

                {/* Right spacer to balance back button */}
                <View style={styles.backButton} />
            </View>

            {/* Body */}
            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={Colors.brandBlue} />
                </View>
            ) : (
                <FlatList
                    data={places}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    contentContainerStyle={[
                        styles.listContent,
                        places.length === 0 && styles.listContentEmpty,
                    ]}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefetching}
                            onRefresh={refetch}
                            tintColor={Colors.brandBlue}
                            colors={[Colors.brandBlue]}
                        />
                    }
                    ListEmptyComponent={<EmptyState isOwner={isOwner} />}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                />
            )}
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingHorizontal: Spacing.base,
        paddingBottom: Spacing.base,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: Colors.surfaceBorder,
        backgroundColor: Colors.background,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: BorderRadius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.surfaceBorder,
    },
    headerCenter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    headerTitle: {
        fontSize: Typography.sizes.md,
        fontWeight: '800',
        color: Colors.textPrimary,
        letterSpacing: -0.3,
    },
    countBadge: {
        backgroundColor: Colors.error,
        borderRadius: BorderRadius.full,
        minWidth: 22,
        height: 22,
        paddingHorizontal: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    countBadgeText: {
        fontSize: Typography.sizes.xs,
        fontWeight: '700',
        color: Colors.textOnBrand,
    },

    // Loading
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // List
    listContent: {
        padding: Spacing.base,
        paddingBottom: 100,
    },
    listContentEmpty: {
        flex: 1,
    },
    separator: {
        height: Spacing.sm,
    },

    // Place card
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.surfaceBorder,
        ...Shadows.sm,
    },
    cardThumb: {
        width: 52,
        height: 52,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.brandVioletLight,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: Spacing.md,
        flexShrink: 0,
    },
    cardBody: {
        flex: 1,
        gap: 4,
    },
    cardNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        flexWrap: 'wrap',
    },
    cardName: {
        fontSize: Typography.sizes.base,
        fontWeight: '700',
        color: Colors.textPrimary,
        flexShrink: 1,
    },
    visitBadge: {
        backgroundColor: Colors.brandBlue + '18',
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: BorderRadius.full,
    },
    visitBadgeText: {
        fontSize: Typography.sizes.xs,
        fontWeight: '600',
        color: Colors.brandBlue,
    },
    cardMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    cardReview: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        lineHeight: 18,
        fontStyle: 'italic',
    },
    cardDate: {
        fontSize: Typography.sizes.xs,
        color: Colors.textTertiary,
        fontWeight: '400',
    },
    cardChevron: {
        marginLeft: Spacing.sm,
        flexShrink: 0,
    },

    // Empty state
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing['2xl'],
        paddingBottom: 80,
    },
    emptyIconBg: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#FEF2F2',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.lg,
    },
    emptyTitle: {
        fontSize: Typography.sizes.lg,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: Spacing.sm,
        textAlign: 'center',
    },
    emptySubtitle: {
        fontSize: Typography.sizes.base,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
    },
});
