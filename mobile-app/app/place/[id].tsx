/**
 * Mapai — Place Detail Screen
 * PRD §8.3.3: Full-screen modal with photo carousel, match score ring,
 * social signals, quick stats, and action CTAs.
 */

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Image,
    Dimensions,
    Platform,
    ActivityIndicator,
    FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { Place, SocialSignal } from '@/types';
import { getPlaceDetails, getPlacePhotoUrl } from '@/services/places';
import { fetchRedditSignals } from '@/services/reddit';
import { scorePlaces } from '@/services/scoring';
import { loadPreferences } from '@/services/preferences';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function PlaceDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const [place, setPlace] = useState<Place | null>(null);
    const [loading, setLoading] = useState(true);
    const [activePhotoIndex, setActivePhotoIndex] = useState(0);

    useEffect(() => {
        loadPlace();
    }, [id]);

    const loadPlace = async () => {
        if (!id) return;
        setLoading(true);
        try {
            const details = await getPlaceDetails(id);
            if (details) {
                // Score with real LLM personalization
                const userPrefs = await loadPreferences();
                const scored = await scorePlaces([details], userPrefs);
                const enriched = scored[0] || details;

                // Fetch real Reddit social signals
                const signals = await fetchRedditSignals(enriched.name, enriched.neighborhood);
                enriched.socialSignals = signals;

                setPlace(enriched);
            } else {
                setPlace(null);
            }
        } catch (err) {
            console.error('Failed to load place:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator size="large" color={Colors.brandBlue} />
            </View>
        );
    }

    if (!place) {
        return (
            <View style={[styles.container, styles.centered]}>
                <Ionicons name="alert-circle" size={40} color={Colors.textTertiary} />
                <Text style={styles.errorText}>Place not found</Text>
            </View>
        );
    }

    const sourceIcon: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
        reddit: 'logo-reddit',
        google: 'logo-google',
        instagram: 'logo-instagram',
        tiktok: 'musical-notes',
    };

    const sourceColor: Record<string, string> = {
        reddit: '#FF5722',
        google: '#4285F4',
        instagram: '#E1306C',
        tiktok: '#000000',
    };

    return (
        <View style={styles.container}>
            {/* Drag handle */}
            <View style={styles.handleBar}>
                <View style={styles.handle} />
            </View>

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero photo carousel */}
                <View style={styles.photoCarousel}>
                    {place.photos.length > 0 ? (
                        <FlatList
                            data={place.photos.slice(0, 5)}
                            horizontal
                            pagingEnabled
                            showsHorizontalScrollIndicator={false}
                            onMomentumScrollEnd={(e) => {
                                const index = Math.round(
                                    e.nativeEvent.contentOffset.x / SCREEN_WIDTH
                                );
                                setActivePhotoIndex(index);
                            }}
                            renderItem={({ item }) => (
                                <Image
                                    source={{ uri: getPlacePhotoUrl(item, 600) }}
                                    style={styles.heroPhoto}
                                />
                            )}
                            keyExtractor={(item, index) => index.toString()}
                        />
                    ) : (
                        <View style={[styles.heroPhoto, styles.photoPlaceholder]}>
                            <Ionicons name="image" size={40} color={Colors.textTertiary} />
                        </View>
                    )}

                    {/* Photo dots */}
                    {place.photos.length > 1 && (
                        <View style={styles.photoDots}>
                            {place.photos.slice(0, 5).map((_, i) => (
                                <View
                                    key={i}
                                    style={[
                                        styles.dot,
                                        i === activePhotoIndex && styles.dotActive,
                                    ]}
                                />
                            ))}
                        </View>
                    )}

                    {/* Close button */}
                    <TouchableOpacity
                        style={styles.closeButton}
                        onPress={() => router.back()}
                    >
                        <Ionicons name="close" size={22} color={Colors.textPrimary} />
                    </TouchableOpacity>
                </View>

                {/* Above the fold: name, match score ring, reasoning */}
                <View style={styles.headerSection}>
                    <View style={styles.headerRow}>
                        <View style={styles.headerInfo}>
                            <Text style={styles.placeName}>{place.name}</Text>
                            <View style={styles.categoryChips}>
                                {place.categoryChips.slice(0, 3).map((chip, i) => (
                                    <View key={i} style={styles.categoryChip}>
                                        <Text style={styles.categoryChipText}>{chip}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>

                        {/* Match score ring */}
                        <View style={styles.matchScoreRing}>
                            <View style={styles.matchScoreInner}>
                                <Text style={styles.matchScoreValue}>{place.matchScore}</Text>
                                <Text style={styles.matchScorePercent}>%</Text>
                            </View>
                        </View>
                    </View>

                    {/* Match reasoning */}
                    <View style={styles.reasoningBox}>
                        <Ionicons name="sparkles" size={14} color={Colors.brandViolet} />
                        <Text style={styles.reasoningText}>
                            {place.matchReasons.join(' · ')}
                        </Text>
                    </View>
                </View>

                {/* Quick stats row */}
                <View style={styles.quickStats}>
                    <StatItem
                        icon="cash-outline"
                        label={'$'.repeat(place.priceLevel || 1)}
                        subtitle="Avg price"
                    />
                    <View style={styles.statDivider} />
                    <StatItem
                        icon="time-outline"
                        label={place.typicalWait || 'N/A'}
                        subtitle="Typical wait"
                    />
                    <View style={styles.statDivider} />
                    <StatItem
                        icon={place.openNow ? 'checkmark-circle' : 'close-circle'}
                        label={place.openNow ? 'Open' : 'Closed'}
                        subtitle="Status"
                        labelColor={place.openNow ? Colors.success : Colors.error}
                    />
                    <View style={styles.statDivider} />
                    <StatItem
                        icon="people-outline"
                        label={place.crowdingLevel || 'N/A'}
                        subtitle="Crowding"
                    />
                </View>

                {/* CTA row */}
                <View style={styles.ctaRow}>
                    <TouchableOpacity style={[styles.ctaButton, styles.ctaPrimary]}>
                        <Ionicons name="navigate" size={18} color={Colors.textOnBrand} />
                        <Text style={[styles.ctaText, styles.ctaPrimaryText]}>
                            Navigate
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.ctaButton}>
                        <Ionicons name="git-compare" size={18} color={Colors.brandBlue} />
                        <Text style={styles.ctaText}>Compare</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.ctaButton}>
                        <Ionicons name="bookmark-outline" size={18} color={Colors.brandBlue} />
                        <Text style={styles.ctaText}>Save</Text>
                    </TouchableOpacity>
                </View>

                {/* Social Signals section (PRD §8.3.3) */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>What people are saying</Text>
                    {place.socialSignals.map((signal, i) => (
                        <View key={i} style={styles.socialCard}>
                            <View style={styles.socialHeader}>
                                <View style={[styles.sourceBadge, { backgroundColor: sourceColor[signal.source] + '22' }]}>
                                    <Ionicons
                                        name={sourceIcon[signal.source] || 'chatbubble'}
                                        size={14}
                                        color={sourceColor[signal.source] || Colors.textSecondary}
                                    />
                                    <Text style={[styles.sourceText, { color: sourceColor[signal.source] }]}>
                                        {signal.source}
                                    </Text>
                                </View>
                                <Text style={styles.socialDate}>{signal.date}</Text>
                            </View>
                            <Text style={styles.socialQuote}>"{signal.quote}"</Text>
                            {signal.author && (
                                <Text style={styles.socialAuthor}>— {signal.author}</Text>
                            )}
                        </View>
                    ))}
                </View>

                {/* Info section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Details</Text>
                    <View style={styles.infoCard}>
                        {place.address && (
                            <InfoRow icon="location" value={place.address} />
                        )}
                        {place.phoneNumber && (
                            <InfoRow icon="call" value={place.phoneNumber} />
                        )}
                        {place.website && (
                            <InfoRow icon="globe" value={place.website} maxLines={1} />
                        )}
                        {place.rating > 0 && (
                            <InfoRow
                                icon="star"
                                value={`${place.rating} / 5.0 on Google`}
                            />
                        )}
                    </View>
                </View>

                {/* Hours */}
                {place.hours && place.hours.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Hours</Text>
                        <View style={styles.infoCard}>
                            {place.hours.map((h, i) => (
                                <Text key={i} style={styles.hoursText}>
                                    {h}
                                </Text>
                            ))}
                        </View>
                    </View>
                )}

                {/* Bottom padding */}
                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

// ─── Sub-components ──────────────────────────────────────────

function StatItem({
    icon,
    label,
    subtitle,
    labelColor,
}: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    subtitle: string;
    labelColor?: string;
}) {
    return (
        <View style={styles.statItem}>
            <Ionicons name={icon} size={18} color={Colors.textSecondary} />
            <Text style={[styles.statLabel, labelColor ? { color: labelColor } : {}]}>
                {label}
            </Text>
            <Text style={styles.statSubtitle}>{subtitle}</Text>
        </View>
    );
}

function InfoRow({
    icon,
    value,
    maxLines,
}: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    value: string;
    maxLines?: number;
}) {
    return (
        <View style={styles.infoRow}>
            <Ionicons name={icon} size={16} color={Colors.textTertiary} />
            <Text
                style={styles.infoValue}
                numberOfLines={maxLines}
            >
                {value}
            </Text>
        </View>
    );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    centered: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    errorText: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.base,
        marginTop: Spacing.md,
    },

    // Drag handle
    handleBar: {
        alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 14 : 10,
        paddingBottom: 8,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#E5E7EB',
    },

    scrollView: {
        flex: 1,
    },

    // Photo carousel
    photoCarousel: {
        position: 'relative',
        height: 240,
        backgroundColor: Colors.surfaceElevated,
    },
    heroPhoto: {
        width: SCREEN_WIDTH,
        height: 240,
    },
    photoPlaceholder: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.surfaceElevated,
    },
    photoDots: {
        position: 'absolute',
        bottom: 12,
        alignSelf: 'center',
        flexDirection: 'row',
        gap: 6,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.4)',
    },
    dotActive: {
        backgroundColor: '#fff',
        width: 18,
    },
    closeButton: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Header section
    headerSection: {
        padding: Spacing.base,
        paddingTop: Spacing.lg,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    headerInfo: {
        flex: 1,
        marginRight: Spacing.md,
    },
    placeName: {
        fontSize: Typography.sizes.xl,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: Spacing.sm,
    },
    categoryChips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    categoryChip: {
        backgroundColor: Colors.surfaceElevated,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 3,
        borderRadius: BorderRadius.sm,
    },
    categoryChipText: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.xs,
        fontWeight: '500',
        textTransform: 'capitalize',
    },

    // Match score ring
    matchScoreRing: {
        width: 60,
        height: 60,
        borderRadius: 30,
        borderWidth: 3,
        borderColor: Colors.brandBlue,
        alignItems: 'center',
        justifyContent: 'center',
        ...Shadows.glow(Colors.brandBlue),
    },
    matchScoreInner: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    matchScoreValue: {
        fontSize: Typography.sizes.lg,
        fontWeight: '700',
        color: Colors.textPrimary,
    },
    matchScorePercent: {
        fontSize: Typography.sizes.xs,
        fontWeight: '600',
        color: Colors.textSecondary,
    },

    // Reasoning
    reasoningBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.sm,
        marginTop: Spacing.md,
        backgroundColor: Colors.surfaceElevated,
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        borderLeftWidth: 3,
        borderLeftColor: Colors.brandViolet,
    },
    reasoningText: {
        flex: 1,
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
        fontStyle: 'italic',
        lineHeight: 20,
    },

    // Quick stats
    quickStats: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.base,
        paddingVertical: Spacing.md,
        marginHorizontal: Spacing.base,
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        borderColor: Colors.surfaceBorder,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
        gap: 4,
    },
    statLabel: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.sm,
        fontWeight: '600',
        textTransform: 'capitalize',
    },
    statSubtitle: {
        color: Colors.textTertiary,
        fontSize: Typography.sizes.xs,
    },
    statDivider: {
        width: 1,
        height: 30,
        backgroundColor: Colors.surfaceBorder,
    },

    // CTAs
    ctaRow: {
        flexDirection: 'row',
        gap: Spacing.sm,
        padding: Spacing.base,
    },
    ctaButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: Colors.surfaceBorder,
        gap: 6,
    },
    ctaPrimary: {
        backgroundColor: Colors.brandBlue,
        borderColor: Colors.brandBlue,
    },
    ctaText: {
        color: Colors.brandBlue,
        fontSize: Typography.sizes.sm,
        fontWeight: '600',
    },
    ctaPrimaryText: {
        color: Colors.textOnBrand,
    },

    // Section
    section: {
        paddingHorizontal: Spacing.base,
        marginTop: Spacing.lg,
    },
    sectionTitle: {
        fontSize: Typography.sizes.md,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: Spacing.md,
    },

    // Social signals
    socialCard: {
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        marginBottom: Spacing.sm,
        borderWidth: 1,
        borderColor: Colors.surfaceBorder,
    },
    socialHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    sourceBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 3,
        borderRadius: BorderRadius.sm,
    },
    sourceText: {
        fontSize: Typography.sizes.xs,
        fontWeight: '600',
        textTransform: 'capitalize',
    },
    socialDate: {
        fontSize: Typography.sizes.xs,
        color: Colors.textTertiary,
    },
    socialQuote: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.sm,
        lineHeight: 20,
        fontStyle: 'italic',
    },
    socialAuthor: {
        color: Colors.textTertiary,
        fontSize: Typography.sizes.xs,
        marginTop: 6,
    },

    // Info
    infoCard: {
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.surfaceBorder,
        gap: Spacing.md,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    infoValue: {
        flex: 1,
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
    },

    // Hours
    hoursText: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
        lineHeight: 22,
    },
});
