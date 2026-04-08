import React, { useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Platform,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useUserMemory, useLovedPlaces } from '@/services/api/hooks';
import { MemoryFact, UserMemoryContext } from '@/services/api/memory';

// ─── Loved Places preview card ─────────────────────────────────────────────

interface LovedPlacePreviewItem {
    id: string;
    place_id: string;
    place_name?: string;
    rating?: number;
}

function LovedPlaceChip({
    item,
    onPress,
}: {
    item: LovedPlacePreviewItem;
    onPress: (placeId: string) => void;
}) {
    const name = item.place_name || 'Place';
    const initial = name[0]?.toUpperCase() ?? '?';

    return (
        <TouchableOpacity
            style={lovedStyles.chip}
            onPress={() => onPress(item.place_id)}
            activeOpacity={0.75}
        >
            <View style={lovedStyles.chipThumb}>
                <Text style={lovedStyles.chipInitial}>{initial}</Text>
            </View>
            <Text style={lovedStyles.chipName} numberOfLines={2}>{name}</Text>
            {typeof item.rating === 'number' && item.rating > 0 && (
                <View style={lovedStyles.chipRating}>
                    <Ionicons name="star" size={10} color="#F59E0B" />
                    <Text style={lovedStyles.chipRatingText}>{item.rating}</Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

const lovedStyles = StyleSheet.create({
    chip: {
        width: 90,
        alignItems: 'center',
        gap: 6,
    },
    chipThumb: {
        width: 64,
        height: 64,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.brandVioletLight,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: Colors.surfaceBorder,
    },
    chipInitial: {
        fontSize: Typography.sizes.lg,
        fontWeight: '700',
        color: Colors.brandBlue,
    },
    chipName: {
        fontSize: Typography.sizes.xs,
        fontWeight: '600',
        color: Colors.textPrimary,
        textAlign: 'center',
        lineHeight: 15,
    },
    chipRating: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    chipRatingText: {
        fontSize: Typography.sizes.xs,
        color: Colors.textSecondary,
        fontWeight: '500',
    },
});

// ─── Types ─────────────────────────────────────────────────────────────────────

interface PreferenceItem {
    label: string;
    value: string;
    confidence: number;
    // Navigation payload — corresponds to the underlying dimension + facts
    dimension: string;
    source: string;
    lastUpdated: string;
}

interface PreferenceCard {
    category: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    items: PreferenceItem[];
}

// ─── Dimension config ──────────────────────────────────────────────────────────

const DIMENSION_CONFIG: Record<string, { category: string; icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
    cuisine_like:        { category: 'Food',     icon: 'restaurant',    color: Colors.brandViolet, label: 'Loves' },
    cuisine_dislike:     { category: 'Food',     icon: 'restaurant',    color: Colors.brandViolet, label: 'Avoids' },
    speed_sensitivity:   { category: 'Service',  icon: 'flash',         color: '#F59E0B',          label: 'Speed preference' },
    price_preference:    { category: 'Price',    icon: 'cash',          color: '#10B981',          label: 'Comfort range' },
    ambiance_preference: { category: 'Ambiance', icon: 'musical-notes', color: Colors.brandBlue,   label: 'Prefers' },
    dietary_restriction: { category: 'Dietary',  icon: 'leaf',          color: '#EF4444',          label: 'Restrictions' },
};

// ─── Source label mapping ──────────────────────────────────────────────────────

function getSourceLabel(source: string): string {
    switch (source) {
        case 'explicit':   return 'You told us';
        case 'inferred':   return 'Learned from conversations';
        case 'behavioral': return 'Observed from your activity';
        default:           return 'Learned from conversations';
    }
}

// ─── Card builder ──────────────────────────────────────────────────────────────

function mapFactsToCards(facts: MemoryFact[], preferences: UserMemoryContext): PreferenceCard[] {
    // Group facts by dimension
    const grouped = new Map<string, MemoryFact[]>();
    for (const fact of facts) {
        const existing = grouped.get(fact.dimension) || [];
        existing.push(fact);
        grouped.set(fact.dimension, existing);
    }

    // Synthesize facts from structured preferences when no raw facts exist
    if (!grouped.has('cuisine_like') && preferences.cuisineLikes.length > 0) {
        grouped.set('cuisine_like', preferences.cuisineLikes.map(v => ({
            dimension: 'cuisine_like', value: v, confidence: 0.7,
            source: 'inferred', createdAt: '', lastUpdated: '', decayWeight: 1,
        })));
    }
    if (!grouped.has('cuisine_dislike') && preferences.cuisineDislikes.length > 0) {
        grouped.set('cuisine_dislike', preferences.cuisineDislikes.map(v => ({
            dimension: 'cuisine_dislike', value: v, confidence: 0.7,
            source: 'inferred', createdAt: '', lastUpdated: '', decayWeight: 1,
        })));
    }
    if (!grouped.has('ambiance_preference') && preferences.ambiancePreferences.length > 0) {
        grouped.set('ambiance_preference', preferences.ambiancePreferences.map(v => ({
            dimension: 'ambiance_preference', value: v, confidence: 0.7,
            source: 'inferred', createdAt: '', lastUpdated: '', decayWeight: 1,
        })));
    }
    if (!grouped.has('dietary_restriction') && preferences.dietaryRestrictions.length > 0) {
        grouped.set('dietary_restriction', preferences.dietaryRestrictions.map(v => ({
            dimension: 'dietary_restriction', value: v, confidence: 0.7,
            source: 'inferred', createdAt: '', lastUpdated: '', decayWeight: 1,
        })));
    }
    if (!grouped.has('speed_sensitivity') && preferences.speedSensitivity !== 'moderate') {
        grouped.set('speed_sensitivity', [{
            dimension: 'speed_sensitivity', value: preferences.speedSensitivity,
            confidence: 0.7, source: 'inferred', createdAt: '', lastUpdated: '', decayWeight: 1,
        }]);
    }
    if (!grouped.has('price_preference')) {
        const { min, max } = preferences.priceRange;
        if (min !== 1 || max !== 3) {
            const priceStr = '$'.repeat(min) + ' \u2013 ' + '$'.repeat(max);
            grouped.set('price_preference', [{
                dimension: 'price_preference', value: priceStr,
                confidence: 0.7, source: 'inferred', createdAt: '', lastUpdated: '', decayWeight: 1,
            }]);
        }
    }

    // Build cards grouped by category
    const categoryMap = new Map<string, PreferenceCard>();

    for (const [dimension, dimensionFacts] of grouped) {
        const config = DIMENSION_CONFIG[dimension];
        if (!config) continue;

        const values = dimensionFacts.map(f => f.value).join(', ');
        const avgConfidence = dimensionFacts.reduce((sum, f) => sum + f.confidence, 0) / dimensionFacts.length;
        // Use the most recently updated fact's metadata for the detail screen
        const representativeFact = dimensionFacts.reduce<MemoryFact>((latest, f) => {
            if (!latest.lastUpdated) return f;
            if (!f.lastUpdated) return latest;
            return new Date(f.lastUpdated) > new Date(latest.lastUpdated) ? f : latest;
        }, dimensionFacts[0]);

        let card = categoryMap.get(config.category);
        if (!card) {
            card = { category: config.category, icon: config.icon, color: config.color, items: [] };
            categoryMap.set(config.category, card);
        }

        card.items.push({
            label: config.label,
            value: values,
            confidence: avgConfidence,
            dimension,
            source: representativeFact?.source ?? 'inferred',
            lastUpdated: representativeFact?.lastUpdated ?? '',
        });
    }

    // Return in a stable category order
    const order = ['Food', 'Service', 'Price', 'Ambiance', 'Dietary'];
    return order
        .filter(cat => categoryMap.has(cat))
        .map(cat => categoryMap.get(cat)!);
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const { data, isLoading } = useUserMemory();

    // Loved places — only fetch for authenticated (non-guest) users
    const isAuthenticated = !!user && !user.isGuest;
    const { data: lovedData, isLoading: lovedLoading } = useLovedPlaces(
        isAuthenticated ? user?.id : undefined
    );
    const lovedPlaces: LovedPlacePreviewItem[] = lovedData?.places ?? lovedData ?? [];
    const lovedCount: number = lovedData?.count ?? lovedPlaces.length;

    const cards = useMemo(() => {
        if (!data) return [];
        return mapFactsToCards(data.facts, data.preferences);
    }, [data]);

    const recentInsightsCount = useMemo(() => {
        if (!data?.facts) return 0;
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        return data.facts.filter(f => new Date(f.lastUpdated).getTime() > weekAgo).length;
    }, [data]);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Profile</Text>
                <TouchableOpacity
                    style={styles.settingsButton}
                    onPress={() => router.push('/settings')}
                >
                    <Ionicons name="settings-outline" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* User card */}
                <View style={styles.userCard}>
                    <View style={styles.avatarCircle}>
                        <Ionicons name="person" size={32} color={Colors.brandViolet} />
                    </View>
                    <View style={styles.userInfo}>
                        <Text style={styles.userName}>{user?.displayName || 'User'}</Text>
                        <Text style={styles.userEmail}>Mapai Alpha · Boston</Text>
                    </View>
                </View>

                {/* Memory section */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Learned Vibe</Text>
                    {recentInsightsCount > 0 && (
                        <View style={styles.insightsPill}>
                            <Text style={styles.insightsText}>{recentInsightsCount} New Insight{recentInsightsCount !== 1 ? 's' : ''}</Text>
                        </View>
                    )}
                </View>

                {isLoading && (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color={Colors.brandViolet} />
                    </View>
                )}

                {!isLoading && cards.length === 0 && (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="sparkles-outline" size={32} color={Colors.textSecondary} />
                        <Text style={styles.emptyTitle}>Your taste profile is building</Text>
                        <Text style={styles.emptySubtitle}>
                            Chat with mapai to teach it your vibe. The more you explore, the smarter it gets.
                        </Text>
                    </View>
                )}

                {cards.map((card) => (
                    <View key={card.category} style={styles.prefCard}>
                        <View style={styles.prefCardHeader}>
                            <View style={[styles.iconBg, { backgroundColor: card.color + '20' }]}>
                                <Ionicons
                                    name={card.icon}
                                    size={16}
                                    color={card.color}
                                />
                            </View>
                            <Text style={[styles.prefCardTitle, { color: card.color }]}>{card.category}</Text>
                        </View>

                        {card.items.map((item, i) => (
                            <TouchableOpacity
                                key={i}
                                style={styles.prefItem}
                                activeOpacity={0.7}
                                onPress={() =>
                                    router.push({
                                        pathname: '/preference-detail',
                                        params: {
                                            dimension: item.dimension,
                                            value: item.value,
                                            confidence: String(item.confidence),
                                            source: item.source,
                                            lastUpdated: item.lastUpdated,
                                        },
                                    })
                                }
                            >
                                <View style={styles.prefItemContent}>
                                    <Text style={styles.prefLabel}>{item.label}</Text>
                                    <View style={styles.prefItemRight}>
                                        <Text style={styles.prefValue}>{item.value}</Text>
                                        <Ionicons
                                            name="chevron-forward"
                                            size={14}
                                            color={Colors.textTertiary}
                                        />
                                    </View>
                                </View>
                                {/* Confidence bar */}
                                <View style={styles.confidenceBar}>
                                    <View
                                        style={[
                                            styles.confidenceFill,
                                            { width: `${item.confidence * 100}%`, backgroundColor: card.color },
                                        ]}
                                    />
                                </View>
                                {/* Source indicator */}
                                <Text style={styles.sourceLabel}>{getSourceLabel(item.source)}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                ))}

                {/* ── Loved Places section ──────────────────────────────────── */}
                {isAuthenticated && (
                    <View style={styles.lovedSection}>
                        {/* Section header */}
                        <View style={styles.sectionHeader}>
                            <View style={styles.lovedSectionTitleRow}>
                                <Ionicons name="heart" size={16} color={Colors.error} />
                                <Text style={styles.sectionTitle}>Loved Places</Text>
                                {lovedCount > 0 && (
                                    <View style={styles.lovedCountPill}>
                                        <Text style={styles.lovedCountText}>{lovedCount}</Text>
                                    </View>
                                )}
                            </View>
                            {lovedCount > 0 && (
                                <TouchableOpacity
                                    onPress={() => router.push('/loved-places' as any)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.seeAllText}>See All</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Loading state */}
                        {lovedLoading && (
                            <View style={styles.lovedLoadingRow}>
                                <ActivityIndicator size="small" color={Colors.brandBlue} />
                            </View>
                        )}

                        {/* Horizontal preview */}
                        {!lovedLoading && lovedPlaces.length > 0 && (
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.lovedScrollContent}
                            >
                                {lovedPlaces.slice(0, 6).map((item) => (
                                    <LovedPlaceChip
                                        key={item.id ?? item.place_id}
                                        item={item}
                                        onPress={(placeId) =>
                                            router.push(`/place/${placeId}` as any)
                                        }
                                    />
                                ))}
                                {lovedCount > 6 && (
                                    <TouchableOpacity
                                        style={styles.lovedMoreChip}
                                        onPress={() => router.push('/loved-places' as any)}
                                        activeOpacity={0.75}
                                    >
                                        <Text style={styles.lovedMoreText}>+{lovedCount - 6}{'\n'}more</Text>
                                    </TouchableOpacity>
                                )}
                            </ScrollView>
                        )}

                        {/* Empty state */}
                        {!lovedLoading && lovedPlaces.length === 0 && (
                            <View style={styles.lovedEmpty}>
                                <Ionicons name="heart-outline" size={20} color={Colors.textTertiary} />
                                <Text style={styles.lovedEmptyText}>No loved places yet</Text>
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
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
    settingsButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: Colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: Colors.surfaceBorder,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 100,
    },
    userCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 20,
        marginBottom: 32,
        borderWidth: 1,
        borderColor: Colors.surfaceBorder,
        ...Shadows.md,
    },
    avatarCircle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: Colors.surfaceElevated,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    userInfo: {
        flex: 1,
    },
    userName: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.textPrimary,
    },
    userEmail: {
        fontSize: 13,
        color: Colors.textSecondary,
        marginTop: 4,
        fontWeight: '500',
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: Colors.textPrimary,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    insightsPill: {
        backgroundColor: 'rgba(139, 92, 246, 0.15)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    insightsText: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.brandViolet,
    },
    loadingContainer: {
        paddingVertical: 40,
        alignItems: 'center',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 40,
        paddingHorizontal: 24,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginTop: 12,
    },
    emptySubtitle: {
        fontSize: 13,
        color: Colors.textSecondary,
        textAlign: 'center',
        marginTop: 8,
        lineHeight: 20,
    },
    prefCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: Colors.surfaceBorder,
    },
    prefCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
    },
    iconBg: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    prefCardTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    prefItem: {
        marginBottom: 16,
    },
    prefItemContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    prefItemRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        flexShrink: 1,
        marginLeft: 8,
    },
    prefLabel: {
        fontSize: 13,
        color: Colors.textSecondary,
        fontWeight: '500',
    },
    prefValue: {
        fontSize: 13,
        color: Colors.textPrimary,
        fontWeight: '600',
        textAlign: 'right',
        flexShrink: 1,
    },
    confidenceBar: {
        height: 3,
        backgroundColor: Colors.surfaceElevated,
        borderRadius: 2,
        overflow: 'hidden',
    },
    confidenceFill: {
        height: '100%',
        borderRadius: 2,
    },
    sourceLabel: {
        fontSize: Typography.sizes.xs,
        color: Colors.textTertiary,
        marginTop: 5,
        fontWeight: '400',
    },

    // ── Loved Places section ──────────────────────────────────────────────────
    lovedSection: {
        marginTop: Spacing['2xl'],
    },
    lovedSectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    lovedCountPill: {
        backgroundColor: '#FEF2F2',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: BorderRadius.full,
    },
    lovedCountText: {
        fontSize: Typography.sizes.xs,
        fontWeight: '700',
        color: Colors.error,
    },
    seeAllText: {
        fontSize: Typography.sizes.sm,
        fontWeight: '600',
        color: Colors.brandBlue,
    },
    lovedLoadingRow: {
        paddingVertical: Spacing.lg,
        alignItems: 'center',
    },
    lovedScrollContent: {
        paddingVertical: Spacing.md,
        gap: Spacing.md,
    },
    lovedMoreChip: {
        width: 64,
        height: 64,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.surfaceElevated,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: Colors.surfaceBorder,
        alignSelf: 'flex-start',
        marginTop: 0,
    },
    lovedMoreText: {
        fontSize: Typography.sizes.xs,
        fontWeight: '700',
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 15,
    },
    lovedEmpty: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.base,
        paddingHorizontal: 4,
    },
    lovedEmptyText: {
        fontSize: Typography.sizes.sm,
        color: Colors.textTertiary,
        fontWeight: '500',
    },
});
