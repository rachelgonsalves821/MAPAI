/**
 * Mapai — Place Comparison Screen
 * PRD §8.3.5: Side-by-side comparison of 2–4 places across key dimensions.
 * Launched from the Place Detail "Compare" CTA or the comparison tray.
 */

import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Image,
    ActivityIndicator,
    Animated,
    Platform,
    SafeAreaView,
    Share,
    Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { Place } from '@/types';
import { useMapStore } from '@/store/mapStore';
import { useLocationStore } from '@/store/locationStore';
import { useComparePlaces } from '@/services/api/hooks';
import { getPlacePhotoUrl } from '@/services/places';

// ─── Helpers ──────────────────────────────────────────────────

function haversineKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function walkingMinutes(distKm: number): number {
    return Math.max(1, Math.round(distKm / 0.08));
}

function priceString(level?: number): string {
    if (!level || level < 1) return '—';
    return '$'.repeat(Math.min(level, 4));
}

/** Parse "10-15 min" → average minutes (12.5), or "~10 min" → 10 */
function parseWaitMinutes(wait?: string): number | null {
    if (!wait) return null;
    const range = wait.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (range) return (parseInt(range[1], 10) + parseInt(range[2], 10)) / 2;
    const single = wait.match(/(\d+)/);
    if (single) return parseInt(single[1], 10);
    return null;
}

// ─── Sub-components ───────────────────────────────────────────

interface WinnerBadgeProps {
    label?: string;
}
function WinnerBadge({ label = 'Best' }: WinnerBadgeProps) {
    return (
        <View style={styles.winnerBadge}>
            <Ionicons name="checkmark" size={10} color="#059669" />
            <Text style={styles.winnerBadgeText}>{label}</Text>
        </View>
    );
}

interface ExpandableReasonsProps {
    reasons: string[];
}
function ExpandableReasons({ reasons }: ExpandableReasonsProps) {
    const [open, setOpen] = useState(false);
    const heightAnim = useRef(new Animated.Value(0)).current;

    const toggle = () => {
        const toValue = open ? 0 : reasons.length * 26 + Spacing.sm * 2;
        Animated.timing(heightAnim, {
            toValue,
            duration: 220,
            useNativeDriver: false,
        }).start();
        setOpen(!open);
    };

    if (reasons.length === 0) return null;

    return (
        <View>
            <TouchableOpacity onPress={toggle} activeOpacity={0.7} style={styles.whyButton}>
                <Ionicons
                    name="sparkles"
                    size={12}
                    color={Colors.brandViolet}
                />
                <Text style={styles.whyButtonText}>Why this?</Text>
                <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={12}
                    color={Colors.brandViolet}
                />
            </TouchableOpacity>
            <Animated.View style={[styles.reasonsContainer, { height: heightAnim, overflow: 'hidden' }]}>
                {reasons.map((reason, i) => (
                    <View key={i} style={styles.reasonRow}>
                        <Ionicons name="sparkles" size={11} color={Colors.brandViolet} />
                        <Text style={styles.reasonText}>{reason}</Text>
                    </View>
                ))}
            </Animated.View>
        </View>
    );
}

// ─── Main Component ───────────────────────────────────────────

export default function CompareScreen() {
    const router = useRouter();
    const { comparisonPlaces, clearComparison } = useMapStore();
    const { coords: userCoords } = useLocationStore();

    const placeIds = comparisonPlaces.map((p) => p.id);
    const { data: fetchedPlaces, isLoading, isError } = useComparePlaces(placeIds);

    // Prefer server-enriched data; fall back to store data (which may have matchScore etc.)
    const places: Place[] = (fetchedPlaces && fetchedPlaces.length >= 2)
        ? fetchedPlaces
        : comparisonPlaces;

    // ─── Winner calculations ───────────────────────────────────

    function winnerIndex(values: (number | null)[], higherIsBetter: boolean): number | null {
        let best: number | null = null;
        let bestIdx: number | null = null;
        values.forEach((v, i) => {
            if (v === null) return;
            if (best === null) {
                best = v;
                bestIdx = i;
            } else if (higherIsBetter ? v > best : v < best) {
                best = v;
                bestIdx = i;
            }
        });
        return bestIdx;
    }

    const matchScores = places.map((p) => p.matchScore ?? null);
    const priceLevels = places.map((p) => (typeof p.priceLevel === 'number' ? p.priceLevel : null));
    const ratings = places.map((p) => (p.rating > 0 ? p.rating : null));
    const waitMinutes = places.map((p) => parseWaitMinutes(p.typicalWait));
    const openStatuses = places.map((p) => (p.openNow === true ? 1 : p.openNow === false ? 0 : null));

    const distancesKm = places.map((p) => {
        if (!p.location?.latitude || !p.location?.longitude) return null;
        return haversineKm(
            userCoords.latitude,
            userCoords.longitude,
            p.location.latitude,
            p.location.longitude,
        );
    });

    const matchWinner = winnerIndex(matchScores, true);
    const priceWinner = winnerIndex(priceLevels, false); // lower price wins
    const ratingWinner = winnerIndex(ratings, true);
    const waitWinner = winnerIndex(waitMinutes, false);
    const distanceWinner = winnerIndex(distancesKm, false);
    const openWinner = winnerIndex(openStatuses, true);

    // Overall winner = highest matchScore
    const overallWinnerIdx = winnerIndex(matchScores, true);
    const overallWinner = overallWinnerIdx !== null ? places[overallWinnerIdx] : places[0];

    // ─── Share ─────────────────────────────────────────────────

    const handleShare = async () => {
        const lines = places.map((p, i) => {
            const price = priceString(p.priceLevel);
            const rating = p.rating > 0 ? `${p.rating}★` : '';
            const score = p.matchScore ?? '?';
            return `${i + 1}. ${p.name} (Match: ${score}, ${price}${rating ? `, ${rating}` : ''})`;
        });
        const message = `Mapai Comparison:\n${lines.join('\n')}\nCompare at mapai.app`;
        try {
            await Share.share({ message });
        } catch {
            // user cancelled — no-op
        }
    };

    // ─── Render ────────────────────────────────────────────────

    if (comparisonPlaces.length < 2) {
        return (
            <View style={[styles.container, styles.centered]}>
                <Ionicons name="git-compare-outline" size={48} color={Colors.textTertiary} />
                <Text style={styles.emptyTitle}>Nothing to compare</Text>
                <Text style={styles.emptySubtitle}>
                    Add at least 2 places from the map to compare them.
                </Text>
                <TouchableOpacity style={styles.backButtonStandalone} onPress={() => router.back()}>
                    <Text style={styles.backButtonText}>Go back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <SafeAreaView style={styles.headerSafe}>
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => router.back()}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
                    </TouchableOpacity>

                    <Text style={styles.headerTitle}>Compare</Text>

                    <TouchableOpacity
                        style={styles.shareButton}
                        onPress={handleShare}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <Ionicons name="share-outline" size={22} color={Colors.brandBlue} />
                    </TouchableOpacity>
                </View>
            </SafeAreaView>

            {/* Loading state */}
            {isLoading && (
                <View style={styles.loadingBox}>
                    <ActivityIndicator size="large" color={Colors.brandBlue} />
                    <Text style={styles.loadingText}>Fetching comparison…</Text>
                </View>
            )}

            {!isLoading && (
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* ── Place column headers ── */}
                    <View style={styles.columnsRow}>
                        {/* empty label column */}
                        <View style={styles.labelColSpacer} />

                        {places.map((place, idx) => {
                            const photoUri =
                                place.photos?.length > 0
                                    ? getPlacePhotoUrl(place.photos[0], 300)
                                    : null;
                            const isWinner = idx === overallWinnerIdx;

                            return (
                                <View key={place.id} style={[styles.placeCol, isWinner && styles.placeColWinner]}>
                                    {/* Thumbnail */}
                                    <View style={styles.thumbWrap}>
                                        {photoUri ? (
                                            <Image
                                                source={{ uri: photoUri }}
                                                style={styles.thumb}
                                                resizeMode="cover"
                                            />
                                        ) : (
                                            <View style={[styles.thumb, styles.thumbPlaceholder]}>
                                                <Ionicons name="image" size={20} color={Colors.textTertiary} />
                                            </View>
                                        )}
                                        {isWinner && (
                                            <View style={styles.topPickBadge}>
                                                <Text style={styles.topPickText}>Top Pick</Text>
                                            </View>
                                        )}
                                    </View>

                                    {/* Name + category */}
                                    <Text style={styles.placeColName} numberOfLines={2}>
                                        {place.name}
                                    </Text>
                                    <Text style={styles.placeColCategory} numberOfLines={1}>
                                        {place.categoryChips?.[0] ?? place.category}
                                    </Text>

                                    {/* Expandable "Why this?" */}
                                    <ExpandableReasons reasons={place.matchReasons ?? []} />
                                </View>
                            );
                        })}
                    </View>

                    {/* ── Divider ── */}
                    <View style={styles.sectionDivider} />

                    {/* ── Comparison rows ── */}

                    {/* Match Score */}
                    <CompareRow
                        label="Match"
                        cells={places.map((p, i) => ({
                            content: (
                                <View style={styles.matchCell}>
                                    <View style={[styles.miniRing, i === matchWinner && styles.miniRingWinner]}>
                                        <Text style={[styles.miniRingText, i === matchWinner && styles.miniRingTextWinner]}>
                                            {p.matchScore ?? '—'}
                                        </Text>
                                    </View>
                                </View>
                            ),
                            isWinner: i === matchWinner,
                        }))}
                    />

                    {/* Price */}
                    <CompareRow
                        label="Price"
                        cells={places.map((p, i) => ({
                            content: (
                                <Text style={[styles.cellText, i === priceWinner && styles.cellTextWinner]}>
                                    {priceString(p.priceLevel)}
                                </Text>
                            ),
                            isWinner: i === priceWinner,
                        }))}
                    />

                    {/* Rating */}
                    <CompareRow
                        label="Rating"
                        cells={places.map((p, i) => ({
                            content: (
                                <View style={styles.ratingCell}>
                                    <Ionicons
                                        name="star"
                                        size={12}
                                        color={i === ratingWinner ? Colors.success : Colors.textTertiary}
                                    />
                                    <Text style={[styles.cellText, i === ratingWinner && styles.cellTextWinner]}>
                                        {p.rating > 0 ? p.rating.toFixed(1) : '—'}
                                    </Text>
                                </View>
                            ),
                            isWinner: i === ratingWinner,
                        }))}
                    />

                    {/* Wait Time */}
                    <CompareRow
                        label="Wait"
                        cells={places.map((p, i) => ({
                            content: (
                                <Text style={[styles.cellText, i === waitWinner && styles.cellTextWinner]}>
                                    {p.typicalWait ?? '—'}
                                </Text>
                            ),
                            isWinner: i === waitWinner,
                        }))}
                    />

                    {/* Distance */}
                    <CompareRow
                        label="Distance"
                        cells={places.map((p, i) => {
                            const km = distancesKm[i];
                            const mins = km !== null ? walkingMinutes(km) : null;
                            return {
                                content: (
                                    <Text style={[styles.cellText, i === distanceWinner && styles.cellTextWinner]}>
                                        {mins !== null ? `${mins} min` : '—'}
                                    </Text>
                                ),
                                isWinner: i === distanceWinner,
                            };
                        })}
                    />

                    {/* Status */}
                    <CompareRow
                        label="Status"
                        cells={places.map((p, i) => ({
                            content: (
                                <View style={[
                                    styles.statusBadge,
                                    p.openNow === true
                                        ? styles.statusOpen
                                        : p.openNow === false
                                        ? styles.statusClosed
                                        : styles.statusUnknown,
                                ]}>
                                    <Text style={[
                                        styles.statusText,
                                        p.openNow === true
                                            ? styles.statusTextOpen
                                            : p.openNow === false
                                            ? styles.statusTextClosed
                                            : styles.statusTextUnknown,
                                    ]}>
                                        {p.openNow === true
                                            ? 'Open'
                                            : p.openNow === false
                                            ? 'Closed'
                                            : '—'}
                                    </Text>
                                </View>
                            ),
                            isWinner: i === openWinner,
                        }))}
                    />

                    {/* Social Quote (no winner) */}
                    <CompareRow
                        label="People say"
                        cells={places.map((p) => ({
                            content: (
                                <Text style={styles.quoteText} numberOfLines={3}>
                                    {p.socialSignals?.[0]?.quote
                                        ? `"${p.socialSignals[0].quote}"`
                                        : '—'}
                                </Text>
                            ),
                            isWinner: false,
                        }))}
                    />

                    {/* ── Bottom spacer for CTA ── */}
                    <View style={{ height: 16 }} />
                </ScrollView>
            )}

            {/* Bottom CTA */}
            {!isLoading && overallWinner && (
                <SafeAreaView style={styles.ctaSafe}>
                    <TouchableOpacity
                        style={styles.ctaButton}
                        activeOpacity={0.85}
                        onPress={() => {
                            clearComparison();
                            router.replace(`/place/${overallWinner.id}`);
                        }}
                    >
                        <Ionicons name="checkmark-circle" size={20} color={Colors.textOnBrand} />
                        <Text style={styles.ctaText}>Pick {overallWinner.name}</Text>
                    </TouchableOpacity>
                </SafeAreaView>
            )}
        </View>
    );
}

// ─── CompareRow ───────────────────────────────────────────────

interface CellSpec {
    content: React.ReactNode;
    isWinner: boolean;
}

interface CompareRowProps {
    label: string;
    cells: CellSpec[];
}

function CompareRow({ label, cells }: CompareRowProps) {
    return (
        <View style={styles.compareRow}>
            <View style={styles.labelCol}>
                <Text style={styles.rowLabel}>{label}</Text>
            </View>
            {cells.map((cell, i) => (
                <View key={i} style={[styles.dataCol, cell.isWinner && styles.dataColWinner]}>
                    {cell.content}
                    {cell.isWinner && <WinnerBadge />}
                </View>
            ))}
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────

const LABEL_COL_WIDTH = 72;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    centered: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing['2xl'],
    },

    // Empty state
    emptyTitle: {
        fontSize: Typography.sizes.lg,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginTop: Spacing.lg,
        textAlign: 'center',
    },
    emptySubtitle: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        textAlign: 'center',
        marginTop: Spacing.sm,
        lineHeight: 20,
    },
    backButtonStandalone: {
        marginTop: Spacing.xl,
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.full,
        backgroundColor: Colors.brandBlue,
    },
    backButtonText: {
        color: Colors.textOnBrand,
        fontSize: Typography.sizes.base,
        fontWeight: '600',
    },

    // Header
    headerSafe: {
        backgroundColor: Colors.background,
        borderBottomWidth: 1,
        borderBottomColor: Colors.surfaceBorder,
        ...Shadows.sm,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.base,
        paddingTop: Platform.OS === 'android' ? Spacing.lg : Spacing.sm,
        paddingBottom: Spacing.md,
    },
    backButton: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        fontSize: Typography.sizes.md,
        fontWeight: '700',
        color: Colors.textPrimary,
    },
    shareButton: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Loading
    loadingBox: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.md,
    },
    loadingText: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
    },

    // Scroll
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: Spacing.base,
    },

    // Section divider
    sectionDivider: {
        height: 1,
        backgroundColor: Colors.surfaceBorder,
        marginHorizontal: Spacing.base,
        marginVertical: Spacing.sm,
    },

    // Column headers row
    columnsRow: {
        flexDirection: 'row',
        paddingHorizontal: Spacing.base,
        paddingTop: Spacing.base,
        gap: Spacing.sm,
    },
    labelColSpacer: {
        width: LABEL_COL_WIDTH,
        flexShrink: 0,
    },
    placeCol: {
        flex: 1,
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
        padding: Spacing.sm,
        borderWidth: 1.5,
        borderColor: Colors.surfaceBorder,
        gap: 4,
        ...Shadows.sm,
    },
    placeColWinner: {
        borderColor: Colors.brandBlue,
        backgroundColor: '#EFF6FF',
    },

    // Place thumbnail
    thumbWrap: {
        position: 'relative',
        width: '100%',
        aspectRatio: 1.4,
        borderRadius: BorderRadius.sm,
        overflow: 'hidden',
        backgroundColor: Colors.surfaceElevated,
    },
    thumb: {
        width: '100%',
        height: '100%',
    },
    thumbPlaceholder: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    topPickBadge: {
        position: 'absolute',
        top: 4,
        left: 4,
        backgroundColor: Colors.brandBlue,
        borderRadius: BorderRadius.full,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    topPickText: {
        fontSize: Typography.sizes.xs,
        color: Colors.textOnBrand,
        fontWeight: '700',
    },
    placeColName: {
        fontSize: Typography.sizes.xs,
        fontWeight: '700',
        color: Colors.textPrimary,
        textAlign: 'center',
        lineHeight: 16,
    },
    placeColCategory: {
        fontSize: Typography.sizes.xs,
        color: Colors.textTertiary,
        textAlign: 'center',
        textTransform: 'capitalize',
    },

    // Why this? expansion
    whyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingVertical: 3,
        justifyContent: 'center',
    },
    whyButtonText: {
        fontSize: Typography.sizes.xs,
        color: Colors.brandViolet,
        fontWeight: '600',
    },
    reasonsContainer: {
        width: '100%',
        paddingHorizontal: 2,
        paddingVertical: Spacing.xs,
        gap: 4,
    },
    reasonRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 4,
    },
    reasonText: {
        flex: 1,
        fontSize: Typography.sizes.xs,
        color: Colors.textSecondary,
        lineHeight: 16,
    },

    // Compare rows
    compareRow: {
        flexDirection: 'row',
        paddingHorizontal: Spacing.base,
        paddingVertical: Spacing.sm,
        gap: Spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: Colors.surfaceBorder,
        alignItems: 'flex-start',
        minHeight: 52,
    },
    labelCol: {
        width: LABEL_COL_WIDTH,
        flexShrink: 0,
        justifyContent: 'center',
        paddingTop: 4,
    },
    rowLabel: {
        fontSize: Typography.sizes.xs,
        fontWeight: '600',
        color: Colors.textTertiary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    dataCol: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 4,
        borderRadius: BorderRadius.sm,
    },
    dataColWinner: {
        backgroundColor: '#F0FDF4',
    },

    // Cell content
    cellText: {
        fontSize: Typography.sizes.sm,
        fontWeight: '600',
        color: Colors.textPrimary,
        textAlign: 'center',
    },
    cellTextWinner: {
        color: Colors.success,
    },

    // Match score mini ring
    matchCell: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    miniRing: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 2,
        borderColor: Colors.textTertiary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    miniRingWinner: {
        borderColor: Colors.brandBlue,
        ...Shadows.glow(Colors.brandBlue),
    },
    miniRingText: {
        fontSize: Typography.sizes.xs,
        fontWeight: '700',
        color: Colors.textSecondary,
    },
    miniRingTextWinner: {
        color: Colors.brandBlue,
    },

    // Rating cell
    ratingCell: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
    },

    // Status badge
    statusBadge: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: 3,
        borderRadius: BorderRadius.full,
    },
    statusOpen: {
        backgroundColor: '#D1FAE5',
    },
    statusClosed: {
        backgroundColor: '#FEE2E2',
    },
    statusUnknown: {
        backgroundColor: Colors.surfaceElevated,
    },
    statusText: {
        fontSize: Typography.sizes.xs,
        fontWeight: '600',
    },
    statusTextOpen: {
        color: '#059669',
    },
    statusTextClosed: {
        color: '#EF4444',
    },
    statusTextUnknown: {
        color: Colors.textTertiary,
    },

    // Social quote cell
    quoteText: {
        fontSize: Typography.sizes.xs,
        color: Colors.textSecondary,
        fontStyle: 'italic',
        textAlign: 'center',
        lineHeight: 16,
    },

    // Winner badge pill
    winnerBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: '#D1FAE5',
        borderRadius: BorderRadius.full,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
    },
    winnerBadgeText: {
        fontSize: Typography.sizes.xs,
        fontWeight: '700',
        color: '#059669',
    },

    // Bottom CTA
    ctaSafe: {
        backgroundColor: Colors.background,
        borderTopWidth: 1,
        borderTopColor: Colors.surfaceBorder,
        paddingHorizontal: Spacing.base,
        paddingTop: Spacing.md,
        paddingBottom: Platform.OS === 'android' ? Spacing.base : Spacing.sm,
    },
    ctaButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.brandBlue,
        borderRadius: BorderRadius.full,
        paddingVertical: Spacing.base,
        gap: Spacing.sm,
        ...Shadows.md,
    },
    ctaText: {
        fontSize: Typography.sizes.base,
        fontWeight: '700',
        color: Colors.textOnBrand,
    },
});
