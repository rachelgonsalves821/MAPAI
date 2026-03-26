/**
 * Mapai — Profile Screen (Bottom-sheet style, 3-tab layout)
 *
 * Layout: standalone full-screen route opened from home.
 * Tabs: Insights | Lists | Account
 * Modal: QR Check-In overlay
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useAuthStore } from '@/store/authStore';
import { useOnboardingStore } from '@/store/onboardingStore';
import apiClient from '@/services/api/client';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3001';

/** Cross-platform confirm — window.confirm on web, Alert.alert on native. */
function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void,
  destructiveText = 'OK',
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: destructiveText, style: 'destructive', onPress: onConfirm },
    ]);
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NAVY = '#1D3E91';
const INACTIVE_TAB = '#6B7280';
const HEART_RED = '#EF4444';
const SECTION_LABEL_COLOR = '#6B7280';
const STATS_VALUE_COLOR = '#111827';

type Tab = 'insights' | 'social' | 'points' | 'account';

const TAB_LABELS: Record<Tab, string> = {
  insights: 'Your Insights',
  social: 'Social',
  points: 'Points',
  account: 'Account Settings',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface LovedPlace {
  id: string;
  name: string;
  neighborhood?: string;
  priceRange?: string;
  category?: string;
}

interface WantToTryPlace {
  id: string;
  name: string;
  category?: string;
}

interface Regular {
  id: string;
  name: string;
  rating?: number;
  neighborhood?: string;
}

interface TasteProfile {
  type: string;
  description: string;
  visits: number;
  avgSpend: string;
  streak: number;
  peakTime: string;
  topCategory: string;
  topCategoryVisits: number;
  topArea: string;
}

// ─── Mock data (will be replaced by real endpoints) ───────────────────────────

const MOCK_TASTE_PROFILE: TasteProfile = {
  type: 'The Loyalist',
  description: 'You find your spots and stick with them — quality over novelty.',
  visits: 35,
  avgSpend: '$12.40',
  streak: 8,
  peakTime: 'Sat mornings',
  topCategory: 'Specialty Coffee',
  topCategoryVisits: 15,
  topArea: 'Back Bay',
};

const MOCK_REGULARS: Regular[] = [
  { id: 'r1', name: 'Tandem Coffee', rating: 4.8, neighborhood: 'Back Bay' },
  { id: 'r2', name: 'Pavement Coffeehouse', rating: 4.6, neighborhood: 'Fenway' },
  { id: 'r3', name: 'George Howell Coffee', rating: 4.7, neighborhood: 'Downtown' },
];

const MOCK_WANT_TO_TRY: WantToTryPlace[] = [
  { id: 'w1', name: 'Pammy\'s', category: 'Italian · South End' },
  { id: 'w2', name: 'O Ya', category: 'Japanese · Downtown' },
  { id: 'w3', name: 'Giulia', category: 'Italian · Cambridge' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  return parts[0].charAt(0).toUpperCase();
}

function avatarColorForName(name?: string | null): string {
  const palette = [
    NAVY,
    '#7C3AED',
    '#10B981',
    '#F59E0B',
    '#EF4444',
    '#3B82F6',
  ];
  if (!name) return palette[0];
  return palette[name.charCodeAt(0) % palette.length];
}

// ─── QR Code visual (grid of squares, no external library) ───────────────────

function QRCodeVisual() {
  // 9×9 binary grid — static pattern that looks like a real QR finder region
  const GRID = 9;
  const pattern: number[][] = [
    [1,1,1,1,1,1,1,0,0],
    [1,0,0,0,0,0,1,0,1],
    [1,0,1,1,1,0,1,0,0],
    [1,0,1,1,1,0,1,0,1],
    [1,0,1,1,1,0,1,0,1],
    [1,0,0,0,0,0,1,0,0],
    [1,1,1,1,1,1,1,0,1],
    [0,0,0,0,0,0,0,0,0],
    [1,0,1,0,0,1,0,1,0],
  ];

  return (
    <View style={qrStyles.grid}>
      {pattern.map((row, ri) => (
        <View key={ri} style={qrStyles.row}>
          {row.map((cell, ci) => (
            <View
              key={ci}
              style={[
                qrStyles.cell,
                { backgroundColor: cell ? '#111827' : '#FFFFFF' },
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const qrStyles = StyleSheet.create({
  grid: {
    width: 200,
    height: 200,
    padding: 8,
    backgroundColor: '#FFFFFF',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    margin: 0.5,
    borderRadius: 1,
  },
});

// ─── QR Check-In Modal ────────────────────────────────────────────────────────

interface QRModalProps {
  visible: boolean;
  onClose: () => void;
}

function QRModal({ visible, onClose }: QRModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          {/* Handle */}
          <View style={modalStyles.dragHandle} />

          {/* Header */}
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Check In</Text>
            <TouchableOpacity style={modalStyles.closeBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* QR frame */}
          <View style={modalStyles.qrFrame}>
            <QRCodeVisual />
          </View>

          {/* Instructions */}
          <Text style={modalStyles.instructionPrimary}>Point at the QR code</Text>
          <Text style={modalStyles.instructionSecondary}>
            Let the cashier scan to check you in
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 48 : 32,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    ...Shadows.lg,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceBorder,
    marginTop: 12,
    marginBottom: 20,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: Typography.sizes.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrFrame: {
    borderWidth: 2,
    borderColor: Colors.textTertiary,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 12,
    marginBottom: Spacing.xl,
    backgroundColor: '#FFFFFF',
  },
  instructionPrimary: {
    fontSize: Typography.sizes.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  instructionSecondary: {
    fontSize: Typography.sizes.sm,
    color: SECTION_LABEL_COLOR,
    textAlign: 'center',
    lineHeight: Typography.sizes.sm * 1.5,
  },
});

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <View style={subStyles.sectionHeader}>
      <Text style={subStyles.sectionLabel}>{label}</Text>
      {count !== undefined && (
        <View style={subStyles.countBadge}>
          <Text style={subStyles.countText}>{count}</Text>
        </View>
      )}
    </View>
  );
}

function LovedPlaceRow({ place }: { place: LovedPlace }) {
  const subtitle = [place.neighborhood, place.priceRange].filter(Boolean).join(' · ');
  return (
    <View style={subStyles.placeRow}>
      {/* Thumbnail placeholder */}
      <View style={subStyles.thumbnail}>
        <Ionicons name="storefront-outline" size={18} color={Colors.textTertiary} />
      </View>
      <View style={subStyles.placeInfo}>
        <Text style={subStyles.placeName} numberOfLines={1}>{place.name}</Text>
        {!!subtitle && (
          <Text style={subStyles.placeSubtitle} numberOfLines={1}>{subtitle}</Text>
        )}
      </View>
      <Ionicons name="heart" size={18} color={HEART_RED} />
    </View>
  );
}

function WantToTryRow({ place }: { place: WantToTryPlace }) {
  return (
    <View style={subStyles.placeRow}>
      <View style={subStyles.bookmarkIcon}>
        <Ionicons name="bookmark-outline" size={18} color={Colors.textSecondary} />
      </View>
      <View style={subStyles.placeInfo}>
        <Text style={subStyles.placeName} numberOfLines={1}>{place.name}</Text>
        {!!place.category && (
          <Text style={subStyles.placeSubtitle} numberOfLines={1}>{place.category}</Text>
        )}
      </View>
    </View>
  );
}

function RegularRow({ place }: { place: Regular }) {
  return (
    <View style={subStyles.placeRow}>
      <View style={subStyles.thumbnail}>
        <Ionicons name="storefront-outline" size={18} color={Colors.textTertiary} />
      </View>
      <View style={subStyles.placeInfo}>
        <Text style={subStyles.placeName} numberOfLines={1}>{place.name}</Text>
        {!!place.neighborhood && (
          <Text style={subStyles.placeSubtitle} numberOfLines={1}>{place.neighborhood}</Text>
        )}
      </View>
      {place.rating !== undefined && (
        <View style={subStyles.ratingBadge}>
          <Ionicons name="star" size={11} color={Colors.sun} />
          <Text style={subStyles.ratingText}>{place.rating.toFixed(1)}</Text>
        </View>
      )}
    </View>
  );
}

const subStyles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    marginTop: Spacing.base,
  },
  sectionLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: '700',
    color: SECTION_LABEL_COLOR,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBorder,
    gap: Spacing.md,
  },
  thumbnail: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookmarkIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeInfo: {
    flex: 1,
  },
  placeName: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  placeSubtitle: {
    fontSize: Typography.sizes.sm,
    color: SECTION_LABEL_COLOR,
    marginTop: 2,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});

// ─── Tab content: Insights ────────────────────────────────────────────────────

function InsightsTab({ regulars }: { regulars: Regular[] }) {
  const profile = MOCK_TASTE_PROFILE;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={tabStyles.scrollContent}
    >
      {/* Taste Profile Card */}
      <View style={tabStyles.tasteCard}>
        <View style={tabStyles.tasteCardHeader}>
          <Ionicons name="sparkles" size={14} color={NAVY} />
          <Text style={tabStyles.tasteCardLabel}>YOUR TASTE PROFILE</Text>
        </View>
        <Text style={tabStyles.tasteType}>{profile.type}</Text>
        <Text style={tabStyles.tasteDescription}>{profile.description}</Text>

        {/* Stats row */}
        <View style={tabStyles.statsRow}>
          <View style={tabStyles.statItem}>
            <Text style={tabStyles.statValue}>{profile.visits}</Text>
            <Text style={tabStyles.statLabel}>visits</Text>
          </View>
          <View style={tabStyles.statDivider} />
          <View style={tabStyles.statItem}>
            <Text style={tabStyles.statValue}>{profile.avgSpend}</Text>
            <Text style={tabStyles.statLabel}>avg</Text>
          </View>
          <View style={tabStyles.statDivider} />
          <View style={tabStyles.statItem}>
            <Text style={tabStyles.statValue}>{profile.streak}d</Text>
            <Text style={tabStyles.statLabel}>streak</Text>
          </View>
          <View style={tabStyles.statDivider} />
          <View style={tabStyles.statItem}>
            <Text style={tabStyles.statValue} numberOfLines={1} adjustsFontSizeToFit>
              {profile.peakTime}
            </Text>
            <Text style={tabStyles.statLabel}>peak</Text>
          </View>
        </View>

        {/* Category chips */}
        <View style={tabStyles.chipRow}>
          <View style={tabStyles.chip}>
            <Ionicons name="cafe-outline" size={13} color={NAVY} />
            <Text style={tabStyles.chipText}>
              {profile.topCategory} · {profile.topCategoryVisits} visits
            </Text>
          </View>
          <View style={tabStyles.chip}>
            <Ionicons name="location-outline" size={13} color={NAVY} />
            <Text style={tabStyles.chipText}>{profile.topArea} · Top area</Text>
          </View>
        </View>
      </View>

      {/* Regulars section */}
      <SectionHeader label="YOUR REGULARS" count={regulars.length} />
      <View style={tabStyles.listCard}>
        {regulars.length === 0 ? (
          <Text style={tabStyles.emptyText}>No regulars yet — keep exploring!</Text>
        ) : (
          regulars.map((r) => <RegularRow key={r.id} place={r} />)
        )}
      </View>
    </ScrollView>
  );
}

// ─── Tab content: Social (redesigned) ─────────────────────────────────────────

// Deterministic color for friend avatars
const FRIEND_COLORS = ['#1D3E91', '#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6'];
function friendColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return FRIEND_COLORS[h % FRIEND_COLORS.length];
}

interface FeedItem {
  id: string;
  actor_id: string;
  actor_name?: string;
  activity_type: string;
  place_id: string;
  place_name?: string;
  metadata?: any;
  created_at: string;
}

interface FriendProfile {
  id: string;
  display_name?: string;
  username?: string;
}

interface FriendRequest {
  id: string;
  from_user_id: string;
  from_name?: string;
  from_username?: string;
  mutual_count: number;
  created_at: string;
}

type SocialSubTab = 'activity' | 'lists';

function SocialTab({
  lovedPlaces,
  wantToTry,
  loading,
}: {
  lovedPlaces: LovedPlace[];
  wantToTry: WantToTryPlace[];
  loading: boolean;
}) {
  const router = useRouter();
  const [subTab, setSubTab] = useState<SocialSubTab>('activity');
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiClient.get('/v1/social/feed?limit=15').then(r => setFeed(r.data?.data?.items || [])).catch(() => {});
    apiClient.get('/v1/social/friends').then(r => {
      const raw = r.data?.data?.friends || [];
      setFriends(raw.map((f: any) => ({
        id: f.friend_id || f.id,
        display_name: f.friend?.display_name || f.display_name || f.username,
        username: f.friend?.username || f.username,
      })));
    }).catch(() => {});
    // Fetch pending friend requests
    apiClient.get('/v1/social/requests/incoming').then(r => {
      setRequests(r.data?.data?.requests || []);
    }).catch(() => {});
  }, []);

  // Search friends by username
  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (text.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    apiClient.get(`/v1/social/search?q=${encodeURIComponent(text)}`)
      .then(r => setSearchResults(r.data?.data?.users || []))
      .catch(() => setSearchResults([]))
      .finally(() => setSearching(false));
  };

  const handleAcceptRequest = (reqId: string) => {
    apiClient.post('/v1/social/friends/accept', { request_id: reqId }).catch(() => {});
    setRequests(prev => prev.filter(r => r.id !== reqId));
  };

  const handleRejectRequest = (reqId: string) => {
    apiClient.post('/v1/social/friends/reject', { request_id: reqId }).catch(() => {});
    setRequests(prev => prev.filter(r => r.id !== reqId));
  };

  const handleSendRequest = (targetId: string) => {
    apiClient.post('/v1/social/friends/request', { target_user_id: targetId }).catch(() => {});
    setSentRequests(prev => new Set(prev).add(targetId));
  };

  const formatTime = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    const h = Math.floor(ms / 3600000);
    if (h < 1) return 'Just now';
    if (h < 24) return `${h}h ago`;
    if (h < 48) return 'Yesterday';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const actionLabel = (type: string) => {
    if (type === 'place_loved') return 'loved';
    if (type === 'place_visited') return 'visited';
    if (type === 'review_posted') return 'reviewed';
    return 'checked out';
  };

  if (loading) return <View style={tabStyles.loadingContainer}><ActivityIndicator size="large" color={NAVY} /></View>;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* ── Search Bar ──────────────────────── */}
      <View style={ss.searchRow}>
        <View style={ss.searchPill}>
          <Ionicons name="search" size={16} color="#9CA3AF" />
          <TextInput
            style={ss.searchInput}
            placeholder="Search by username or phone..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
              <Ionicons name="close-circle" size={18} color="#D1D5DB" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Search Results ──────────────────── */}
      {searchResults.length > 0 && (
        <View style={ss.searchResultsCard}>
          {searchResults.map((u, i) => (
            <View key={u.id} style={[ss.searchResultRow, i < searchResults.length - 1 && ss.borderBottom]}>
              <View style={[ss.avatar32, { backgroundColor: friendColor(u.id) }]}>
                <Text style={ss.avatarText12}>{(u.display_name || u.username || '?')[0]?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={ss.nameText}>{u.display_name || u.username}</Text>
                {u.username && <Text style={ss.usernameText}>@{u.username}</Text>}
              </View>
              {sentRequests.has(u.id) ? (
                <Text style={ss.sentLabel}>Sent</Text>
              ) : (
                <TouchableOpacity style={ss.addBtn} onPress={() => handleSendRequest(u.id)}>
                  <Ionicons name="person-add" size={14} color="#FFF" />
                  <Text style={ss.addBtnText}>Add</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}

      {/* ── Sub Tab Bar (Activity | Your Lists) ── */}
      <View style={ss.subTabBar}>
        {(['activity', 'lists'] as SocialSubTab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={ss.subTabItem}
            onPress={() => setSubTab(tab)}
            activeOpacity={0.7}
          >
            <Text style={[ss.subTabLabel, subTab === tab && ss.subTabLabelActive]}>
              {tab === 'activity' ? 'Activity' : 'Your Lists'}
            </Text>
            {subTab === tab && <View style={ss.subTabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      {subTab === 'activity' ? (
        <>
          {/* ── Friend Requests ────────────────── */}
          {requests.length > 0 && (
            <>
              <View style={ss.sectionRow}>
                <Text style={ss.sectionLabel}>FOLLOW REQUESTS</Text>
                <View style={ss.redBadge}><Text style={ss.redBadgeText}>{requests.length}</Text></View>
              </View>
              <View style={ss.card}>
                {requests.map((req, i) => (
                  <View key={req.id} style={[ss.requestRow, i < requests.length - 1 && ss.borderBottom]}>
                    <View style={[ss.avatar48, { backgroundColor: friendColor(req.from_user_id) }]}>
                      <Text style={ss.avatarText18}>{(req.from_name || req.from_user_id)[0]?.toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={ss.nameText}>{req.from_name || req.from_username || 'User'}</Text>
                      <Text style={ss.mutualText}>
                        {req.mutual_count > 0 ? `${req.mutual_count} mutual friend${req.mutual_count > 1 ? 's' : ''}` : 'New connection'}
                        {' · '}{formatTime(req.created_at)}
                      </Text>
                    </View>
                    <TouchableOpacity style={ss.confirmBtn} onPress={() => handleAcceptRequest(req.id)}>
                      <Text style={ss.confirmBtnText}>Confirm</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleRejectRequest(req.id)} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
                      <Text style={ss.deleteText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ── Friends (horizontal) ──────────── */}
          {friends.length > 0 && (
            <>
              <View style={ss.sectionRow}>
                <Text style={ss.sectionLabel}>FRIENDS</Text>
                <Text style={ss.countLabel}>{friends.length}</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 14, paddingHorizontal: 16, paddingBottom: 8 }}
              >
                {friends.map(f => (
                  <TouchableOpacity
                    key={f.id}
                    style={ss.friendChip}
                    activeOpacity={0.75}
                    onPress={() => router.push(`/u/${f.username || f.id}` as any)}
                  >
                    <View style={[ss.avatar48, { backgroundColor: friendColor(f.id) }]}>
                      <Text style={ss.avatarText18}>{(f.display_name || f.id)[0]?.toUpperCase()}</Text>
                    </View>
                    <Text style={ss.friendChipName} numberOfLines={1}>
                      {f.display_name || f.username || 'Friend'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* ── Recent Activity ─────────────────── */}
          <View style={ss.sectionRow}>
            <Text style={ss.sectionLabel}>RECENT</Text>
          </View>
          <View style={ss.card}>
            {feed.length === 0 ? (
              <View style={ss.emptyState}>
                <Ionicons name="people" size={36} color="#D1D5DB" />
                <Text style={ss.emptyTitle}>No activity yet</Text>
                <Text style={ss.emptySubtitle}>When friends visit and save places, you'll see it here</Text>
              </View>
            ) : (
              feed.map((item, i) => (
                <TouchableOpacity
                  key={item.id}
                  style={[ss.activityRow, i < feed.length - 1 && ss.borderBottom]}
                  activeOpacity={0.75}
                  onPress={() => item.place_id && router.push(`/place/${item.place_id}` as any)}
                >
                  <View style={[ss.avatar36, { backgroundColor: friendColor(item.actor_id) }]}>
                    <Text style={ss.avatarText14}>{(item.actor_name || item.actor_id)[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={ss.activityText}>
                      <Text style={{ fontWeight: '700', color: '#111827' }}>{item.actor_name || 'A friend'}</Text>
                      {' '}<Text style={{ color: '#6B7280' }}>{actionLabel(item.activity_type)}</Text>{' '}
                      <Text style={{ fontWeight: '700', color: NAVY }}>{item.place_name || 'a place'}</Text>
                    </Text>
                    <Text style={ss.timeText}>{formatTime(item.created_at)}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </>
      ) : (
        /* ── Your Lists sub-tab ──────────────── */
        <>
          <SectionHeader label="Your Faves" count={lovedPlaces.length} />
          <View style={tabStyles.listCard}>
            {lovedPlaces.length === 0 ? (
              <Text style={tabStyles.emptyText}>Heart places to build your faves list!</Text>
            ) : (
              lovedPlaces.map(p => <LovedPlaceRow key={p.id} place={p} />)
            )}
          </View>

          <SectionHeader label="Want to Go" count={wantToTry.length} />
          <View style={tabStyles.listCard}>
            {wantToTry.length === 0 ? (
              <Text style={tabStyles.emptyText}>Save places you want to visit.</Text>
            ) : (
              wantToTry.map(p => <WantToTryRow key={p.id} place={p} />)
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const ss = StyleSheet.create({
  // Search
  searchRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  searchPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F3F4F6', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', padding: 0 },
  searchResultsCard: {
    marginHorizontal: 16, marginTop: 8, backgroundColor: '#FFF',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
  },
  searchResultRow: {
    flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10,
  },
  sentLabel: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: NAVY, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  // Sub tabs
  subTabBar: { flexDirection: 'row', marginTop: 12, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB' },
  subTabItem: { flex: 1, alignItems: 'center', paddingBottom: 12, position: 'relative' },
  subTabLabel: { fontSize: 14, fontWeight: '500', color: '#9CA3AF' },
  subTabLabelActive: { color: '#111827' },
  subTabUnderline: { position: 'absolute', bottom: 0, width: '60%', height: 2, backgroundColor: NAVY, borderRadius: 1 },
  // Sections
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginTop: 20, marginBottom: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 1, textTransform: 'uppercase' },
  countLabel: { fontSize: 11, fontWeight: '700', color: NAVY },
  redBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' },
  redBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFF' },
  // Cards
  card: { marginHorizontal: 16, backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', overflow: 'hidden' },
  borderBottom: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6' },
  // Requests
  requestRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  confirmBtn: { backgroundColor: NAVY, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  confirmBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  deleteText: { fontSize: 13, fontWeight: '500', color: '#6B7280' },
  mutualText: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  // Friends
  friendChip: { alignItems: 'center', width: 64, gap: 4 },
  friendChipName: { fontSize: 11, fontWeight: '500', color: '#111827', textAlign: 'center' },
  // Activity
  activityRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 10 },
  activityText: { fontSize: 14, lineHeight: 20 },
  timeText: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#9CA3AF', marginTop: 10 },
  emptySubtitle: { fontSize: 13, color: '#D1D5DB', textAlign: 'center', marginTop: 4, paddingHorizontal: 40 },
  // Avatars
  avatar32: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatar36: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatar48: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText12: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  avatarText14: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  avatarText18: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  // Common text
  nameText: { fontSize: 15, fontWeight: '600', color: '#111827' },
  usernameText: { fontSize: 12, color: '#9CA3AF' },
});

// ─── Tab content: Account ─────────────────────────────────────────────────────

interface AccountTabProps {
  onSignOut: () => void;
  onDeleteAccount: () => void;
}

function AccountTab({ onSignOut, onDeleteAccount }: AccountTabProps) {
  const settingsRows = [
    {
      icon: 'notifications-outline' as const,
      label: 'Notifications',
      onPress: () => {},
    },
    {
      icon: 'lock-closed-outline' as const,
      label: 'Privacy & Security',
      onPress: () => {},
    },
    {
      icon: 'globe-outline' as const,
      label: 'Language & Region',
      onPress: () => {},
    },
    {
      icon: 'help-circle-outline' as const,
      label: 'Help & Support',
      onPress: () => {},
    },
    {
      icon: 'document-text-outline' as const,
      label: 'Terms & Privacy Policy',
      onPress: () => {},
    },
  ];

  const handleDeleteAccount = onDeleteAccount;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={tabStyles.scrollContent}
    >
      <SectionHeader label="SETTINGS" />
      <View style={tabStyles.listCard}>
        {settingsRows.map((row, index) => (
          <React.Fragment key={row.label}>
            <TouchableOpacity style={acctStyles.row} onPress={row.onPress} activeOpacity={0.7}>
              <View style={acctStyles.rowIcon}>
                <Ionicons name={row.icon} size={18} color={Colors.textSecondary} />
              </View>
              <Text style={acctStyles.rowLabel}>{row.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
            </TouchableOpacity>
            {index < settingsRows.length - 1 && <View style={acctStyles.divider} />}
          </React.Fragment>
        ))}
      </View>

      <SectionHeader label="ACCOUNT ACTIONS" />
      <View style={tabStyles.listCard}>
        <TouchableOpacity style={acctStyles.row} onPress={onSignOut} activeOpacity={0.7}>
          <View style={[acctStyles.rowIcon, { backgroundColor: Colors.error + '15' }]}>
            <Ionicons name="log-out-outline" size={18} color={Colors.error} />
          </View>
          <Text style={[acctStyles.rowLabel, { color: Colors.error }]}>Sign Out</Text>
        </TouchableOpacity>
        <View style={acctStyles.divider} />
        <TouchableOpacity style={acctStyles.row} onPress={handleDeleteAccount} activeOpacity={0.7}>
          <View style={[acctStyles.rowIcon, { backgroundColor: Colors.error + '15' }]}>
            <Ionicons name="trash-outline" size={18} color={Colors.error} />
          </View>
          <Text style={[acctStyles.rowLabel, { color: Colors.error }]}>Delete Account</Text>
        </TouchableOpacity>
      </View>

      <Text style={acctStyles.versionText}>Mapai v1.0.0 · © 2026</Text>
    </ScrollView>
  );
}

const acctStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: 14,
    gap: Spacing.md,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: Typography.sizes.base,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.surfaceBorder,
    marginLeft: Spacing.base + 34 + Spacing.md,
  },
  versionText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
});

const tabStyles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing['4xl'],
    paddingTop: Spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textTertiary,
    paddingVertical: Spacing.base,
    textAlign: 'center',
  },
  listCard: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
    paddingHorizontal: Spacing.base,
    ...Shadows.sm,
  },
  // Taste profile card
  tasteCard: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    ...Shadows.md,
  },
  tasteCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: Spacing.sm,
  },
  tasteCardLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: '700',
    color: NAVY,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  tasteType: {
    fontSize: Typography.sizes.xl,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  tasteDescription: {
    fontSize: Typography.sizes.sm,
    color: SECTION_LABEL_COLOR,
    lineHeight: Typography.sizes.sm * 1.55,
    marginBottom: Spacing.base,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.surfaceBorder,
    paddingTop: Spacing.base,
    marginBottom: Spacing.base,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: Typography.sizes.md,
    fontWeight: '800',
    color: STATS_VALUE_COLOR,
  },
  statLabel: {
    fontSize: Typography.sizes.xs,
    color: SECTION_LABEL_COLOR,
    marginTop: 2,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.surfaceBorder,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.brandVioletLight,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: NAVY,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const authStoreUser = useAuthStore((s) => s.user);

  const [activeTab, setActiveTab] = useState<Tab>('social');
  const [qrVisible, setQrVisible] = useState(false);

  const [pointsBalance, setPointsBalance] = useState<number>(0);
  const [lovedPlaces, setLovedPlaces] = useState<LovedPlace[]>([]);
  const [wantToTry] = useState<WantToTryPlace[]>(MOCK_WANT_TO_TRY);
  const [regulars] = useState<Regular[]>(MOCK_REGULARS);
  const [loading, setLoading] = useState(true);

  const userId = user?.id ?? 'dev-user-001';
  const displayName = user?.displayName ?? authStoreUser?.displayName ?? 'Explorer';
  const username = authStoreUser?.username ?? user?.username;
  const location = 'Boston';
  const avatarColor = avatarColorForName(displayName);
  const initials = getInitials(displayName);

  // ─── Fetch data ────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pointsRes, lovedRes] = await Promise.allSettled([
        apiClient.get('/v1/loyalty/balance'),
        apiClient.get(`/v1/social/loved-places/${userId}`),
      ]);

      if (pointsRes.status === 'fulfilled') {
        setPointsBalance(pointsRes.value.data?.data?.balance ?? 0);
      }

      if (lovedRes.status === 'fulfilled') {
        const raw = lovedRes.value.data?.data?.places ?? [];
        setLovedPlaces(
          raw.map((p: any) => ({
            id: p.id ?? p.place_id ?? String(Math.random()),
            name: p.name ?? 'Unknown Place',
            neighborhood: p.neighborhood ?? p.area ?? undefined,
            priceRange: p.price_range ?? p.priceRange ?? undefined,
            category: p.category ?? undefined,
          }))
        );
      }
    } catch {
      // Silently degrade — mock data already in state
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Auth actions ──────────────────────────────────────────────────────────

  const handleSignOut = () => {
    confirmAction('Sign Out', 'Are you sure you want to sign out?', async () => {
      try {
        useAuthStore.getState().logout();
        useOnboardingStore.getState().reset();
        await signOut();
        // Route guard in AuthContext will redirect to landing
      } catch (err) {
        console.error('Sign out error:', err);
      }
    }, 'Sign Out');
  };

  const handleDeleteAccount = () => {
    confirmAction(
      'Delete Account',
      'This will permanently delete your profile, chat history, points, loved places, and all associated data. You have 30 days to cancel by logging back in.',
      () => {
        confirmAction(
          'Are you absolutely sure?',
          'This cannot be undone after 30 days.',
          async () => {
            try {
              await fetch(`${BACKEND_URL}/v1/user/delete-request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
              });
            } catch { /* continue even if backend fails */ }
            useAuthStore.getState().logout();
            useOnboardingStore.getState().reset();
            await signOut();
            // Route guard in AuthContext will redirect to landing
          },
          'Confirm Delete',
        );
      },
      'Delete My Account',
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>

        {/* ── Sheet surface ─────────────────────────────────────────────────── */}
        <View style={styles.sheet}>

          {/* Drag handle */}
          <View style={styles.dragHandle} />

          {/* ── Profile header ────────────────────────────────────────────── */}
          <View style={styles.profileHeader}>
            <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>

            <View style={styles.identityBlock}>
              <Text style={styles.displayName}>{displayName}</Text>
              <Text style={styles.usernameLocation}>
                {username ? `@${username}` : '@user'} · {location}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => router.back()}
              hitSlop={8}
            >
              <Ionicons name="close" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* ── Check In + Points row ─────────────────────────────────────── */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.checkInBtn}
              onPress={() => setQrVisible(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="qr-code-outline" size={16} color="#FFFFFF" />
              <Text style={styles.checkInText}>Check In</Text>
            </TouchableOpacity>

            <View style={styles.pointsBadge}>
              <Text style={styles.pointsText}>{pointsBalance} pts</Text>
            </View>
          </View>

          {/* ── Tab bar ───────────────────────────────────────────────────── */}
          <View style={styles.tabBar}>
            {(['insights', 'social', 'points', 'account'] as Tab[]).map((tab) => {
              const isActive = activeTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  style={styles.tabItem}
                  onPress={() => {
                    if (tab === 'points') {
                      router.push('/rewards' as any);
                    } else {
                      setActiveTab(tab);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                    {TAB_LABELS[tab]}
                  </Text>
                  {isActive && <View style={styles.tabUnderline} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Tab content ───────────────────────────────────────────────── */}
          <View style={styles.tabContent}>
            {activeTab === 'insights' && (
              <InsightsTab regulars={regulars} />
            )}
            {activeTab === 'social' && (
              <SocialTab
                lovedPlaces={lovedPlaces}
                wantToTry={wantToTry}
                loading={loading}
              />
            )}
            {activeTab === 'account' && (
              <AccountTab onSignOut={handleSignOut} onDeleteAccount={handleDeleteAccount} />
            )}
          </View>
        </View>
      </View>

      {/* ── QR Modal ──────────────────────────────────────────────────────── */}
      <QRModal visible={qrVisible} onClose={() => setQrVisible(false)} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Sheet surface (sits on top, mimics bottom-sheet)
  sheet: {
    flex: 1,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    // On a real bottom-sheet the card shadow faces down; here it's decorative
    ...Shadows.md,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceBorder,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },

  // Profile header
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.base,
    gap: Spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  identityBlock: {
    flex: 1,
  },
  displayName: {
    fontSize: Typography.sizes.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  usernameLocation: {
    fontSize: Typography.sizes.sm,
    color: SECTION_LABEL_COLOR,
    marginTop: 2,
    fontWeight: '500',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Check In + Points row
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.base,
    gap: Spacing.md,
  },
  checkInBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: NAVY,
    borderRadius: BorderRadius.lg,
    paddingVertical: 13,
  },
  checkInText: {
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pointsBadge: {
    borderWidth: 1.5,
    borderColor: NAVY,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
  },
  pointsText: {
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    color: NAVY,
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBorder,
    marginHorizontal: Spacing.base,
    marginBottom: 0,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 10,
    paddingTop: 2,
    position: 'relative',
  },
  tabLabel: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: INACTIVE_TAB,
  },
  tabLabelActive: {
    color: NAVY,
    fontWeight: '700',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '15%',
    right: '15%',
    height: 2.5,
    borderRadius: 2,
    backgroundColor: NAVY,
  },

  // Tab content area
  tabContent: {
    flex: 1,
  },
});
