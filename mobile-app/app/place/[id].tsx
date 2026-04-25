/**
 * Mapai — Place Detail Screen
 * PRD §8.3.3: Full-screen modal with photo carousel, match score ring,
 * social signals, quick stats, and action CTAs.
 */

import React, { useState, useEffect, useCallback } from 'react';
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
    Linking,
    Alert,
    LayoutAnimation,
    UIManager,
} from 'react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { Place, SocialSignal } from '@/types';
import { getPlacePhotoUrl } from '@/services/places';
import SurveyModal, { SurveyData } from '@/components/SurveyModal';
import QRScannerModal from '@/components/QRScannerModal';
import { useCheckIn } from '@/services/api/survey';
import CommunityInsights from '@/components/CommunityInsights';
import { useMapStore } from '@/store/mapStore';
import { useWhyThis, useIsPlaceLoved, useLovePlaceToggle, useTrackPlaceView } from '@/services/api/hooks';
import apiClient from '@/services/api/client';
import { useAuth } from '@/context/AuthContext';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Social types (local to this screen) ─────────────────────

interface FriendLovedPlace {
    friend_id: string;
    friend_name?: string;
    one_line_review?: string;
    rating?: number;
}

// Deterministic avatar color (same palette as social feed)
const AVATAR_COLORS_PLACE = [
    '#0558E8', '#7C3AED', '#10B981', '#F59E0B',
    '#EF4444', '#3B82F6', '#8B5CF6',
];

function friendAvatarColor(friendId: string): string {
    let hash = 0;
    for (let i = 0; i < friendId.length; i++) {
        hash = (hash * 31 + friendId.charCodeAt(i)) & 0xffff;
    }
    return AVATAR_COLORS_PLACE[hash % AVATAR_COLORS_PLACE.length];
}

function friendInitial(friendId: string, friendName?: string): string {
    if (friendName && friendName.length > 0) return friendName[0].toUpperCase();
    return friendId[0]?.toUpperCase() ?? '?';
}

export default function PlaceDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { user } = useAuth();
    const [place, setPlace] = useState<Place | null>(null);
    const [loading, setLoading] = useState(true);
    const [activePhotoIndex, setActivePhotoIndex] = useState(0);

    // "Why this?" expandable section
    const [whyExpanded, setWhyExpanded] = useState(false);
    const whyResult = useWhyThis(id, whyExpanded);

    // Phase 2 — Social layer state
    const [friendsWhoLove, setFriendsWhoLove] = useState<FriendLovedPlace[]>([]);
    // Efficient single-place loved check via dedicated endpoint (avoids full list fetch)
    const { data: isLoved = false } = useIsPlaceLoved(id);
    const loveMutation = useLovePlaceToggle();
    const loveLoading = loveMutation.isPending;
    // Fire-and-forget view tracking
    const trackView = useTrackPlaceView();

    // Check-in flow: QR scanner → check-in API → survey
    const checkIn = useCheckIn();
    const [qrScannerVisible, setQrScannerVisible] = useState(false);
    const [surveyModalVisible, setSurveyModalVisible] = useState(false);
    const [currentSurvey, setCurrentSurvey] = useState<SurveyData | null>(null);

    useEffect(() => {
        loadPlace();
        if (id) {
            loadFriendsWhoLove(id);
        }
    }, [id]);

    // Track the view once place data is available (fire-and-forget)
    useEffect(() => {
        if (place && id) {
            trackView.mutate({
                place_id: id,
                place_name: place.name,
                latitude: place.location?.latitude,
                longitude: place.location?.longitude,
                category: place.category,
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [place?.id]);

    const loadPlace = async () => {
        if (!id) return;
        setLoading(true);
        try {
            // Fetch directly from backend — already returns scored + enriched data
            const { data: json } = await apiClient.get(`/v1/places/${id}`);
            const data = json.data?.place;
            if (data) {
                // Map backend response to Place type with safe defaults
                const mapped: Place = {
                    id: data.id || id,
                    googlePlaceId: data.id || id,
                    name: data.name || 'Unknown',
                    category: data.category || 'restaurant',
                    categoryChips: [data.category || 'restaurant'].filter(Boolean),
                    address: data.address || '',
                    neighborhood: 'Boston' as any,
                    location: data.location || { latitude: 0, longitude: 0 },
                    rating: data.rating || 0,
                    priceLevel: data.priceLevel ?? 2,
                    photos: data.photos || [],
                    openNow: data.openNow,
                    hours: data.hours || [],
                    phoneNumber: data.phoneNumber || '',
                    website: data.website || '',
                    matchScore: data.matchScore ?? 50,
                    matchReasons: data.matchReasons || [],
                    socialSignals: data.socialSignals || [],
                    isLoyalty: false,
                    visitCount: 0,
                };
                setPlace(mapped);
            } else {
                setPlace(null);
            }
        } catch (err) {
            console.error('Failed to load place:', err);
            setPlace(null);
        } finally {
            setLoading(false);
        }
    };

    // Fetch friends who love this place
    const loadFriendsWhoLove = async (placeId: string) => {
        try {
            const { data: json } = await apiClient.get(
                `/v1/social/loved-places/place/${placeId}/friends`,
            );
            const friends: FriendLovedPlace[] = json.data?.friends ?? [];
            setFriendsWhoLove(friends);
        } catch {
            // Non-blocking — section simply won't show
        }
    };

    // Toggle Love — delegates to shared hook which handles optimistic updates
    // and query cache invalidation for both the check and the loved list.
    const handleLoveToggle = useCallback(() => {
        if (!place || loveLoading) return;
        loveMutation.mutate({
            place_id: place.id,
            place_name: place.name,
            currently_loved: isLoved,
            latitude: place.location?.latitude,
            longitude: place.location?.longitude,
        });
    }, [place, isLoved, loveLoading, loveMutation]);

    const handleNavigate = () => {
        if (!place) return;
        // Open Google Maps with walking directions
        const url = `https://www.google.com/maps/dir/?api=1&destination=${place.location.latitude},${place.location.longitude}&destination_place_id=${place.id}&travelmode=walking`;
        Linking.openURL(url);
    };

    // Step 1: User taps "Check In" → open QR scanner
    const handleCheckIn = useCallback(() => {
        if (!place) return;
        setQrScannerVisible(true);
    }, [place]);

    // Step 2: QR scanned successfully → call backend check-in → open survey
    // qrData is the raw QR string; backend validates the HMAC signature
    const handleQRSuccess = useCallback(async (qrData: string) => {
        setQrScannerVisible(false);
        if (!place) return;

        try {
            const result = await checkIn.mutateAsync({ placeId: place.id, qrData });
            if (result?.survey) {
                setCurrentSurvey({
                    id: result.survey.id,
                    placeName: place.name,
                    pointsAwarded: result.pointsAwarded ?? result.survey.pointsAwarded ?? 3,
                    questions: result.survey.questions ?? [],
                });
                setSurveyModalVisible(true);
            } else {
                Alert.alert('Checked In!', `You earned points at ${place.name}!`);
            }
        } catch (err: any) {
            const status = err?.response?.status;
            if (status === 403) {
                Alert.alert('Invalid QR Code', 'This QR code could not be verified. Please scan the official Mapai QR code at the venue.');
            } else if (status === 409) {
                Alert.alert('Already Checked In', "You've already checked in here today. Come back tomorrow!");
            } else {
                Alert.alert('Check-in Failed', 'Please try again in a moment.');
            }
        }
    }, [place, checkIn]);

    const handleSurveyComplete = useCallback(() => {
        setSurveyModalVisible(false);
        setCurrentSurvey(null);
    }, []);

    const handleSurveySkip = useCallback(() => {
        setSurveyModalVisible(false);
        setCurrentSurvey(null);
    }, []);

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

                    {/* Match reasoning + expandable "Why this?" */}
                    <View style={styles.reasoningBox}>
                        <Ionicons name="sparkles" size={14} color={Colors.brandViolet} />
                        <Text style={styles.reasoningText}>
                            {place.matchReasons.join(' · ')}
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={styles.whyLink}
                        onPress={() => {
                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                            setWhyExpanded((prev) => !prev);
                        }}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={whyExpanded ? 'Hide explanation' : 'Why is this recommended for me?'}
                    >
                        <Ionicons
                            name={whyExpanded ? 'chevron-up' : 'chevron-down'}
                            size={13}
                            color={Colors.brandViolet}
                        />
                        <Text style={styles.whyLinkText}>
                            {whyExpanded ? 'Hide explanation' : 'Why this?'}
                        </Text>
                    </TouchableOpacity>

                    {/* Expanded "Why this?" panel */}
                    {whyExpanded && (
                        <View style={styles.whyPanel}>
                            {whyResult.isLoading ? (
                                <View style={styles.whyLoading}>
                                    <ActivityIndicator size="small" color={Colors.brandViolet} />
                                    <Text style={styles.whyLoadingText}>Personalizing explanation...</Text>
                                </View>
                            ) : whyResult.data ? (
                                <>
                                    {/* Narrative */}
                                    <Text style={styles.whyNarrative}>
                                        {whyResult.data.explanation}
                                    </Text>

                                    {/* Factor cards */}
                                    {(whyResult.data.factors || []).map((factor: any, i: number) => (
                                        <View key={i} style={styles.whyFactorRow}>
                                            <View style={[
                                                styles.whyImpactDot,
                                                factor.impact === 'positive'
                                                    ? styles.whyImpactPositive
                                                    : factor.impact === 'negative'
                                                        ? styles.whyImpactNegative
                                                        : styles.whyImpactNeutral,
                                            ]} />
                                            <View style={styles.whyFactorText}>
                                                <Text style={styles.whyFactorDimension}>{factor.dimension}</Text>
                                                <Text style={styles.whyFactorSignal}>{factor.signal}</Text>
                                            </View>
                                        </View>
                                    ))}

                                    {/* Based on footer */}
                                    {whyResult.data.basedOn && (
                                        <Text style={styles.whyBasedOn}>
                                            Based on {whyResult.data.basedOn}
                                        </Text>
                                    )}
                                </>
                            ) : (
                                <Text style={styles.whyErrorText}>
                                    Could not load explanation right now.
                                </Text>
                            )}
                        </View>
                    )}
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
                    {/* Check In */}
                    <TouchableOpacity
                        style={[styles.ctaButton, styles.ctaCheckIn]}
                        onPress={handleCheckIn}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel="Scan QR code to check in"
                    >
                        <Ionicons name="qr-code-outline" size={18} color={Colors.textOnBrand} />
                        <Text style={[styles.ctaText, styles.ctaPrimaryText]}>Check In</Text>
                    </TouchableOpacity>

                    {/* Navigate */}
                    <TouchableOpacity
                        style={styles.ctaButton}
                        onPress={handleNavigate}
                        accessibilityRole="button"
                        accessibilityLabel="Get walking directions"
                    >
                        <Ionicons name="walk" size={18} color={Colors.brandBlue} />
                        <Text style={styles.ctaText}>Walk</Text>
                    </TouchableOpacity>

                    {/* Compare button */}
                    <TouchableOpacity
                        style={styles.ctaButton}
                        onPress={() => {
                            if (!place) return;
                            const { comparisonPlaces, addToComparison } = useMapStore.getState();
                            const alreadyAdded = comparisonPlaces.some((p) => p.id === place.id);
                            if (!alreadyAdded) {
                                addToComparison(place);
                            }
                            // After adding, check total count
                            const updatedCount = useMapStore.getState().comparisonPlaces.length;
                            if (updatedCount >= 2) {
                                router.push('/compare');
                            } else {
                                Alert.alert(
                                    'Added to comparison',
                                    'Select another place to compare with.',
                                );
                            }
                        }}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel="Compare this place with another"
                    >
                        <Ionicons name="git-compare-outline" size={18} color={Colors.brandBlue} />
                        <Text style={styles.ctaText}>Compare</Text>
                    </TouchableOpacity>

                    {/* Love button — Phase 2 */}
                    <TouchableOpacity
                        style={[
                            styles.ctaButton,
                            isLoved && styles.ctaLoveActive,
                        ]}
                        onPress={handleLoveToggle}
                        disabled={loveLoading}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel={isLoved ? 'Remove love' : 'Love this place'}
                    >
                        <Ionicons
                            name={isLoved ? 'heart' : 'heart-outline'}
                            size={18}
                            color={isLoved ? '#EF4444' : Colors.brandBlue}
                        />
                        <Text
                            style={[
                                styles.ctaText,
                                isLoved && styles.ctaTextLove,
                            ]}
                        >
                            {isLoved ? 'Loved' : 'Love'}
                        </Text>
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

                {/* Community Insights (aggregated survey stats) */}
                <CommunityInsights placeId={place.googlePlaceId || id} />

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

                {/* Phase 2 — Friends who love this place */}
                {friendsWhoLove.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Friends who love this</Text>
                        <View style={styles.friendsCard}>
                            {friendsWhoLove.map((friend, i) => (
                                <View key={friend.friend_id} style={[
                                    styles.friendRow,
                                    i < friendsWhoLove.length - 1 && styles.friendRowBorder,
                                ]}>
                                    {/* Avatar */}
                                    <View style={[
                                        styles.friendAvatar,
                                        { backgroundColor: friendAvatarColor(friend.friend_id) },
                                    ]}>
                                        <Text style={styles.friendAvatarInitial}>
                                            {friendInitial(friend.friend_id, friend.friend_name)}
                                        </Text>
                                    </View>

                                    {/* Info */}
                                    <View style={styles.friendInfo}>
                                        <View style={styles.friendNameRow}>
                                            <Text style={styles.friendDisplayName}>
                                                {friend.friend_name ?? friend.friend_id}
                                            </Text>
                                            {typeof friend.rating === 'number' && (
                                                <View style={styles.friendRating}>
                                                    <Ionicons
                                                        name="heart"
                                                        size={10}
                                                        color="#EF4444"
                                                    />
                                                    <Text style={styles.friendRatingText}>
                                                        {friend.rating}/5
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                        {friend.one_line_review ? (
                                            <Text
                                                style={styles.friendReview}
                                                numberOfLines={2}
                                            >
                                                {friend.one_line_review}
                                            </Text>
                                        ) : null}
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* Bottom padding */}
                <View style={{ height: 40 }} />
            </ScrollView>

            {/* QR Scanner — step 1 of check-in flow */}
            {place && (
                <QRScannerModal
                    visible={qrScannerVisible}
                    placeName={place.name}
                    placeId={place.id}
                    onScanSuccess={handleQRSuccess}
                    onClose={() => setQrScannerVisible(false)}
                />
            )}

            {/* Arrival survey — step 2, shown after successful check-in */}
            {currentSurvey && (
                <SurveyModal
                    visible={surveyModalVisible}
                    survey={currentSurvey}
                    onComplete={handleSurveyComplete}
                    onSkip={handleSurveySkip}
                />
            )}
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

    // "Why this?" link + panel
    whyLink: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: Spacing.sm,
        alignSelf: 'flex-start',
        paddingVertical: 2,
    },
    whyLinkText: {
        color: Colors.brandViolet,
        fontSize: Typography.sizes.sm,
        fontWeight: '600',
    },
    whyPanel: {
        marginTop: Spacing.sm,
        backgroundColor: Colors.brandVioletLight,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: Colors.brandViolet + '22',
        padding: Spacing.md,
        gap: Spacing.md,
    },
    whyLoading: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.sm,
    },
    whyLoadingText: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
        fontStyle: 'italic',
    },
    whyNarrative: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.sm,
        lineHeight: 21,
        fontWeight: '400',
    },
    whyFactorRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.sm,
        backgroundColor: Colors.background,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        borderColor: Colors.surfaceBorder,
        padding: Spacing.sm,
    },
    whyImpactDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginTop: 4,
        flexShrink: 0,
    },
    whyImpactPositive: {
        backgroundColor: Colors.success,
    },
    whyImpactNegative: {
        backgroundColor: '#F59E0B',  // amber — "worth knowing", not alarming
    },
    whyImpactNeutral: {
        backgroundColor: Colors.textTertiary,
    },
    whyFactorText: {
        flex: 1,
        gap: 2,
    },
    whyFactorDimension: {
        fontSize: Typography.sizes.xs,
        fontWeight: '700',
        color: Colors.textPrimary,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    whyFactorSignal: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        lineHeight: 18,
    },
    whyBasedOn: {
        fontSize: Typography.sizes.xs,
        color: Colors.textTertiary,
        textAlign: 'right',
        fontStyle: 'italic',
        marginTop: Spacing.xs,
    },
    whyErrorText: {
        color: Colors.textTertiary,
        fontSize: Typography.sizes.sm,
        fontStyle: 'italic',
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
    ctaCheckIn: {
        backgroundColor: Colors.brandBlue,
        borderColor: Colors.brandBlue,
        flex: 1.4, // slightly wider to accommodate "Check In" label
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

    // Love CTA button states
    ctaLoveActive: {
        borderColor: '#EF4444',
        backgroundColor: '#FEF2F2',
    },
    ctaTextLove: {
        color: '#EF4444',
    },

    // Friends who love this — Phase 2
    friendsCard: {
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: Colors.surfaceBorder,
        overflow: 'hidden',
    },
    friendRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: Spacing.md,
        gap: Spacing.md,
    },
    friendRowBorder: {
        borderBottomWidth: 1,
        borderBottomColor: Colors.surfaceBorder,
    },
    friendAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    friendAvatarInitial: {
        fontSize: 14,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    friendInfo: {
        flex: 1,
        gap: 3,
    },
    friendNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    friendDisplayName: {
        fontSize: Typography.sizes.sm,
        fontWeight: '700',
        color: '#111827',
    },
    friendRating: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: '#FEF2F2',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: BorderRadius.sm,
    },
    friendRatingText: {
        fontSize: Typography.sizes.xs,
        color: '#EF4444',
        fontWeight: '600',
    },
    friendReview: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        lineHeight: 18,
        fontStyle: 'italic',
    },
});
