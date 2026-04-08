/**
 * Mapai — Transport Options Screen
 * PRD §8.3.4: Multi-modal transport comparison after selecting a place.
 * Shows walk, drive, transit, Uber, Lyft options with ETA, distance, and cost.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Platform,
    Linking,
    Dimensions,
    SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { LatLng, TransportMode } from '@/types';
import { decodePolyline } from '@/utils/polyline';
import { useLocationStore } from '@/store/locationStore';

// ─── Constants ────────────────────────────────────────────────

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';

const ROUTE_COLORS: Record<TransportMode, string> = {
    walk: '#059669',
    drive: '#0558E8',
    transit: '#7C3AED',
    uber: '#000000',
    lyft: '#FF00BF',
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────

interface RouteData {
    durationText: string;
    durationSeconds: number;
    distanceText: string;
    distanceMeters: number;
    polylinePoints: LatLng[];
}

interface ModeCardData {
    mode: TransportMode;
    label: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    routeData: RouteData | null;
    costLabel: string;
    badge?: 'Best Value' | 'Fastest';
    loadingFailed: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────

async function fetchDirections(
    origin: LatLng,
    destination: LatLng,
    mode: 'walking' | 'driving' | 'transit',
): Promise<RouteData | null> {
    const originStr = `${origin.latitude},${origin.longitude}`;
    const destStr = `${destination.latitude},${destination.longitude}`;
    const url =
        `https://maps.googleapis.com/maps/api/directions/json` +
        `?origin=${originStr}&destination=${destStr}&mode=${mode}&key=${GOOGLE_API_KEY}`;

    try {
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const json = await resp.json();
        if (json.status !== 'OK' || !json.routes?.length) return null;

        const leg = json.routes[0].legs[0];
        return {
            durationText: leg.duration.text,
            durationSeconds: leg.duration.value,
            distanceText: leg.distance.text,
            distanceMeters: leg.distance.value,
            polylinePoints: decodePolyline(json.routes[0].overview_polyline.points),
        };
    } catch {
        return null;
    }
}

function buildGoogleMapsUrl(
    dest: LatLng,
    mode: 'walking' | 'driving' | 'transit',
    placeId?: string,
): string {
    const modeParam =
        mode === 'walking' ? 'walking' : mode === 'transit' ? 'transit' : 'driving';
    let url =
        `https://www.google.com/maps/dir/?api=1` +
        `&destination=${dest.latitude},${dest.longitude}` +
        `&travelmode=${modeParam}`;
    if (placeId) url += `&destination_place_id=${placeId}`;
    return url;
}

function buildUberUrl(dest: LatLng): string {
    return (
        `uber://?action=setPickup&pickup=my_location` +
        `&dropoff[latitude]=${dest.latitude}&dropoff[longitude]=${dest.longitude}`
    );
}

function buildUberFallbackUrl(dest: LatLng): string {
    return `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${dest.latitude}&dropoff[longitude]=${dest.longitude}`;
}

function buildLyftUrl(dest: LatLng): string {
    return `lyft://ridetype?id=lyft&destination[latitude]=${dest.latitude}&destination[longitude]=${dest.longitude}`;
}

function buildLyftFallbackUrl(dest: LatLng): string {
    return `https://ride.lyft.com/ridetype?id=lyft&destination[latitude]=${dest.latitude}&destination[longitude]=${dest.longitude}`;
}

async function openDeepLink(deepLink: string, webFallback: string): Promise<void> {
    const supported = await Linking.canOpenURL(deepLink).catch(() => false);
    if (supported) {
        await Linking.openURL(deepLink);
    } else {
        await Linking.openURL(webFallback);
    }
}

/**
 * Estimate rideshare price from driving route distance.
 * Uses Boston-area average rates (2024):
 *   Uber: $2.55 base + $1.75/mile + $0.35/min + $2.20 booking fee
 *   Lyft: $2.40 base + $1.65/mile + $0.30/min + $2.00 service fee
 * Returns a "$X–Y" range (low = off-peak estimate, high = +35% surge buffer).
 */
function estimateRidesharePrice(
    distanceMeters: number,
    durationSeconds: number,
    provider: 'uber' | 'lyft',
): { low: number; high: number; label: string } {
    const miles = distanceMeters / 1609.34;
    const minutes = durationSeconds / 60;

    let base: number;
    let perMile: number;
    let perMin: number;
    let fee: number;

    if (provider === 'uber') {
        base = 2.55;
        perMile = 1.75;
        perMin = 0.35;
        fee = 2.20;
    } else {
        base = 2.40;
        perMile = 1.65;
        perMin = 0.30;
        fee = 2.00;
    }

    const estimate = base + perMile * miles + perMin * minutes + fee;
    const low = Math.max(5, Math.round(estimate));
    const high = Math.round(estimate * 1.35);

    return { low, high, label: `$${low}–${high}` };
}

// ─── Component ────────────────────────────────────────────────

export default function TransportScreen() {
    const router = useRouter();
    const { coords } = useLocationStore();
    const userOrigin: LatLng = { latitude: coords.latitude, longitude: coords.longitude };
    const { placeId, placeName, placeAddress, destLat, destLng } =
        useLocalSearchParams<{
            placeId: string;
            placeName: string;
            placeAddress: string;
            destLat: string;
            destLng: string;
        }>();

    const destination: LatLng = {
        latitude: parseFloat(destLat ?? '0'),
        longitude: parseFloat(destLng ?? '0'),
    };

    const [selectedMode, setSelectedMode] = useState<TransportMode>('walk');
    const [loading, setLoading] = useState(true);
    const [cards, setCards] = useState<ModeCardData[]>([]);

    // ─── Data fetch ───────────────────────────────────────────

    const buildCards = useCallback(
        (
            walkData: RouteData | null,
            driveData: RouteData | null,
            transitData: RouteData | null,
        ): ModeCardData[] => {
            // Estimate rideshare prices and routes from driving data
            const uberEstimate = driveData
                ? estimateRidesharePrice(driveData.distanceMeters, driveData.durationSeconds, 'uber')
                : null;
            const lyftEstimate = driveData
                ? estimateRidesharePrice(driveData.distanceMeters, driveData.durationSeconds, 'lyft')
                : null;

            // Rideshare ETA ≈ driving time + ~4 min pickup wait
            const uberRoute: RouteData | null = driveData
                ? {
                      ...driveData,
                      durationText: `${Math.round(driveData.durationSeconds / 60) + 4} min`,
                      durationSeconds: driveData.durationSeconds + 240,
                  }
                : null;
            const lyftRoute: RouteData | null = driveData
                ? {
                      ...driveData,
                      durationText: `${Math.round(driveData.durationSeconds / 60) + 4} min`,
                      durationSeconds: driveData.durationSeconds + 240,
                  }
                : null;

            // Determine fastest mode across all options
            const routed: Array<{ mode: TransportMode; seconds: number }> = [];
            if (walkData) routed.push({ mode: 'walk', seconds: walkData.durationSeconds });
            if (driveData) routed.push({ mode: 'drive', seconds: driveData.durationSeconds });
            if (transitData) routed.push({ mode: 'transit', seconds: transitData.durationSeconds });
            if (uberRoute) routed.push({ mode: 'uber', seconds: uberRoute.durationSeconds });
            if (lyftRoute) routed.push({ mode: 'lyft', seconds: lyftRoute.durationSeconds });

            const fastestMode =
                routed.length > 0
                    ? routed.reduce((a, b) => (a.seconds < b.seconds ? a : b)).mode
                    : null;

            // Best value: walking free > transit cheap > cheapest rideshare > driving
            const bestValueMode: TransportMode | null = walkData
                ? 'walk'
                : transitData
                ? 'transit'
                : lyftEstimate && uberEstimate && lyftEstimate.low <= uberEstimate.low
                ? 'lyft'
                : uberEstimate
                ? 'uber'
                : driveData
                ? 'drive'
                : null;

            const makeBadge = (mode: TransportMode): 'Best Value' | 'Fastest' | undefined => {
                if (mode === bestValueMode && mode === fastestMode) return 'Fastest';
                if (mode === bestValueMode) return 'Best Value';
                if (mode === fastestMode) return 'Fastest';
                return undefined;
            };

            return [
                {
                    mode: 'walk',
                    label: 'Walk',
                    icon: 'walk',
                    routeData: walkData,
                    costLabel: 'Free',
                    badge: makeBadge('walk'),
                    loadingFailed: walkData === null,
                },
                {
                    mode: 'drive',
                    label: 'Drive',
                    icon: 'car',
                    routeData: driveData,
                    costLabel: 'Free',
                    badge: makeBadge('drive'),
                    loadingFailed: driveData === null,
                },
                {
                    mode: 'uber',
                    label: 'Uber',
                    icon: 'car-sport',
                    routeData: uberRoute,
                    costLabel: uberEstimate?.label ?? 'Open app for price',
                    badge: makeBadge('uber'),
                    loadingFailed: driveData === null,
                },
                {
                    mode: 'lyft',
                    label: 'Lyft',
                    icon: 'car-sport',
                    routeData: lyftRoute,
                    costLabel: lyftEstimate?.label ?? 'Open app for price',
                    badge: makeBadge('lyft'),
                    loadingFailed: driveData === null,
                },
                {
                    mode: 'transit',
                    label: 'Transit',
                    icon: 'bus',
                    routeData: transitData,
                    costLabel: 'Varies',
                    badge: makeBadge('transit'),
                    loadingFailed: transitData === null,
                },
            ];
        },
        [],
    );

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            const [walkData, driveData, transitData] = await Promise.all([
                fetchDirections(userOrigin, destination, 'walking'),
                fetchDirections(userOrigin, destination, 'driving'),
                fetchDirections(userOrigin, destination, 'transit'),
            ]);

            if (!cancelled) {
                setCards(buildCards(walkData, driveData, transitData));
                setLoading(false);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [placeId]);

    // ─── Navigation handler ───────────────────────────────────

    const handleStartNavigation = async () => {
        switch (selectedMode) {
            case 'walk':
                await Linking.openURL(buildGoogleMapsUrl(destination, 'walking', placeId));
                break;
            case 'drive':
                await Linking.openURL(buildGoogleMapsUrl(destination, 'driving', placeId));
                break;
            case 'transit':
                await Linking.openURL(buildGoogleMapsUrl(destination, 'transit', placeId));
                break;
            case 'uber':
                await openDeepLink(buildUberUrl(destination), buildUberFallbackUrl(destination));
                break;
            case 'lyft':
                await openDeepLink(buildLyftUrl(destination), buildLyftFallbackUrl(destination));
                break;
        }
    };

    // ─── Map region ───────────────────────────────────────────

    const midLat = (userOrigin.latitude + destination.latitude) / 2;
    const midLng = (userOrigin.longitude + destination.longitude) / 2;
    const latDelta = Math.abs(userOrigin.latitude - destination.latitude) * 2.2 + 0.01;
    const lngDelta = Math.abs(userOrigin.longitude - destination.longitude) * 2.2 + 0.01;

    const selectedCard = cards.find((c) => c.mode === selectedMode);
    const polylineCoords = selectedCard?.routeData?.polylinePoints ?? [];

    // ─── Render ───────────────────────────────────────────────

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
                    <View style={styles.headerTitleBlock}>
                        <Text style={styles.headerTitle}>Get there</Text>
                        <Text style={styles.headerSubtitle} numberOfLines={1}>
                            {placeName}
                        </Text>
                        {!!placeAddress && (
                            <Text style={styles.headerAddress} numberOfLines={1}>
                                {placeAddress}
                            </Text>
                        )}
                    </View>
                </View>
            </SafeAreaView>

            {/* Map preview */}
            <View style={styles.mapContainer}>
                <MapView
                    style={styles.map}
                    provider={PROVIDER_GOOGLE}
                    region={{
                        latitude: midLat,
                        longitude: midLng,
                        latitudeDelta: latDelta,
                        longitudeDelta: lngDelta,
                    }}
                    scrollEnabled={false}
                    zoomEnabled={false}
                    rotateEnabled={false}
                    pitchEnabled={false}
                >
                    {/* Origin marker — 12px blue circle */}
                    <Marker coordinate={userOrigin} anchor={{ x: 0.5, y: 0.5 }}>
                        <View style={styles.originDot} />
                    </Marker>

                    {/* Destination marker — 12px red circle */}
                    <Marker coordinate={destination} anchor={{ x: 0.5, y: 0.5 }}>
                        <View style={styles.destDot} />
                    </Marker>

                    {/* Route polyline */}
                    {polylineCoords.length > 0 && (
                        <Polyline
                            coordinates={polylineCoords}
                            strokeColor={ROUTE_COLORS[selectedMode]}
                            strokeWidth={3}
                        />
                    )}
                </MapView>
            </View>

            {/* Transport cards */}
            <ScrollView
                style={styles.cardsScroll}
                contentContainerStyle={styles.cardsContent}
                showsVerticalScrollIndicator={false}
            >
                {loading ? (
                    <View style={styles.loadingBox}>
                        <ActivityIndicator size="large" color={Colors.brandBlue} />
                        <Text style={styles.loadingText}>Fetching routes…</Text>
                    </View>
                ) : (
                    cards.map((card) => (
                        <ModeCard
                            key={card.mode}
                            card={card}
                            selected={selectedMode === card.mode}
                            onSelect={() => setSelectedMode(card.mode)}
                        />
                    ))
                )}
                {/* Bottom padding so sticky button doesn't overlap last card */}
                <View style={{ height: 16 }} />
            </ScrollView>

            {/* Sticky Start Navigation button */}
            <SafeAreaView style={styles.navButtonSafe}>
                <TouchableOpacity
                    style={styles.navButton}
                    onPress={handleStartNavigation}
                    activeOpacity={0.85}
                >
                    <Ionicons name="navigate" size={20} color={Colors.textOnBrand} />
                    <Text style={styles.navButtonText}>Start Navigation</Text>
                </TouchableOpacity>
            </SafeAreaView>
        </View>
    );
}

// ─── ModeCard ─────────────────────────────────────────────────

interface ModeCardProps {
    card: ModeCardData;
    selected: boolean;
    onSelect: () => void;
}

function ModeCard({ card, selected, onSelect }: ModeCardProps) {
    const isRideshare = card.mode === 'uber' || card.mode === 'lyft';

    return (
        <TouchableOpacity
            style={[styles.card, selected && styles.cardSelected]}
            onPress={onSelect}
            activeOpacity={0.75}
        >
            {/* Icon + label */}
            <View style={[styles.cardIconWrap, selected && styles.cardIconWrapSelected]}>
                <Ionicons
                    name={card.icon}
                    size={22}
                    color={selected ? Colors.brandBlue : Colors.textSecondary}
                />
            </View>

            <View style={styles.cardBody}>
                <View style={styles.cardLabelRow}>
                    <Text style={[styles.cardLabel, selected && styles.cardLabelSelected]}>
                        {card.label}
                    </Text>
                    {card.badge && (
                        <View
                            style={[
                                styles.badge,
                                card.badge === 'Best Value'
                                    ? styles.badgeBestValue
                                    : styles.badgeFastest,
                            ]}
                        >
                            <Text
                                style={[
                                    styles.badgeText,
                                    card.badge === 'Best Value'
                                        ? styles.badgeTextBestValue
                                        : styles.badgeTextFastest,
                                ]}
                            >
                                {card.badge}
                            </Text>
                        </View>
                    )}
                </View>

                {isRideshare && card.routeData ? (
                    <View style={styles.cardMeta}>
                        <Text style={styles.cardEta}>{card.routeData.durationText}</Text>
                        <Text style={styles.cardMetaSep}>·</Text>
                        <Text style={styles.cardDistance}>{card.routeData.distanceText}</Text>
                        <Text style={styles.cardMetaSep}>·</Text>
                        <Text style={[styles.cardCost, { fontWeight: '600', color: Colors.textPrimary }]}>
                            {card.costLabel}
                        </Text>
                    </View>
                ) : isRideshare ? (
                    <Text style={styles.cardCost}>{card.costLabel}</Text>
                ) : card.loadingFailed ? (
                    <Text style={styles.cardUnavailable}>Not available</Text>
                ) : card.routeData ? (
                    <View style={styles.cardMeta}>
                        <Text style={styles.cardEta}>{card.routeData.durationText}</Text>
                        <Text style={styles.cardMetaSep}>·</Text>
                        <Text style={styles.cardDistance}>{card.routeData.distanceText}</Text>
                        <Text style={styles.cardMetaSep}>·</Text>
                        <Text style={styles.cardCost}>{card.costLabel}</Text>
                    </View>
                ) : (
                    <Text style={styles.cardUnavailable}>Not available</Text>
                )}
            </View>

            {/* Selection indicator */}
            {selected && (
                <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={Colors.brandBlue}
                    style={styles.cardCheck}
                />
            )}
        </TouchableOpacity>
    );
}

// ─── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
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
        alignItems: 'flex-start',
        paddingHorizontal: Spacing.base,
        paddingTop: Platform.OS === 'android' ? Spacing.lg : Spacing.sm,
        paddingBottom: Spacing.md,
        gap: Spacing.md,
    },
    backButton: {
        marginTop: 2,
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitleBlock: {
        flex: 1,
    },
    headerTitle: {
        fontSize: Typography.sizes.md,
        fontWeight: '700',
        color: Colors.textPrimary,
    },
    headerSubtitle: {
        fontSize: Typography.sizes.base,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginTop: 2,
    },
    headerAddress: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        marginTop: 1,
    },

    // Map
    mapContainer: {
        height: 240,
        backgroundColor: Colors.surfaceElevated,
    },
    map: {
        flex: 1,
    },
    originDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#0558E8',
        borderWidth: 2,
        borderColor: '#FFFFFF',
    },
    destDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#EF4444',
        borderWidth: 2,
        borderColor: '#FFFFFF',
    },

    // Cards scroll
    cardsScroll: {
        flex: 1,
    },
    cardsContent: {
        padding: Spacing.base,
        gap: Spacing.sm,
    },
    loadingBox: {
        paddingVertical: Spacing['2xl'],
        alignItems: 'center',
        gap: Spacing.md,
    },
    loadingText: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
    },

    // Card
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        borderWidth: 1.5,
        borderColor: Colors.surfaceBorder,
        gap: Spacing.md,
        ...Shadows.sm,
    },
    cardSelected: {
        borderColor: '#0558E8',
        backgroundColor: '#EFF6FF',
    },
    cardIconWrap: {
        width: 44,
        height: 44,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.surfaceElevated,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardIconWrapSelected: {
        backgroundColor: '#DBEAFE',
    },
    cardBody: {
        flex: 1,
        gap: 4,
    },
    cardLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        flexWrap: 'wrap',
    },
    cardLabel: {
        fontSize: Typography.sizes.base,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    cardLabelSelected: {
        color: Colors.brandBlue,
    },
    cardMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        flexWrap: 'wrap',
    },
    cardEta: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        fontWeight: '500',
    },
    cardMetaSep: {
        fontSize: Typography.sizes.sm,
        color: Colors.textTertiary,
    },
    cardDistance: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
    },
    cardCost: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
    },
    cardUnavailable: {
        fontSize: Typography.sizes.sm,
        color: Colors.textTertiary,
        fontStyle: 'italic',
    },
    cardCheck: {
        marginLeft: Spacing.xs,
    },

    // Badges
    badge: {
        borderRadius: BorderRadius.full,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
    },
    badgeBestValue: {
        backgroundColor: '#D1FAE5',
    },
    badgeFastest: {
        backgroundColor: '#DBEAFE',
    },
    badgeText: {
        fontSize: Typography.sizes.xs,
        fontWeight: '600',
    },
    badgeTextBestValue: {
        color: '#059669',
    },
    badgeTextFastest: {
        color: '#0558E8',
    },

    // Bottom nav button
    navButtonSafe: {
        backgroundColor: Colors.background,
        borderTopWidth: 1,
        borderTopColor: Colors.surfaceBorder,
        paddingHorizontal: Spacing.base,
        paddingTop: Spacing.md,
        paddingBottom: Platform.OS === 'android' ? Spacing.base : Spacing.sm,
    },
    navButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0558E8',
        borderRadius: BorderRadius.full,
        paddingVertical: Spacing.base,
        gap: Spacing.sm,
        ...Shadows.md,
    },
    navButtonText: {
        fontSize: Typography.sizes.base,
        fontWeight: '700',
        color: Colors.textOnBrand,
    },
});
