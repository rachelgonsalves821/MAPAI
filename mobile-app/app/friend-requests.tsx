/**
 * Mapai — Friend Requests Screen
 * View incoming and outgoing friend requests.
 * Incoming: Accept / Decline buttons.
 * Outgoing: "Pending" badge.
 * Route: /friend-requests  (registered in _layout.tsx)
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
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
import {
  useFriendRequests,
  useRespondToFriendRequest,
  type FriendRequest,
  type SocialUser,
} from '@/services/api/social';

// ─── Avatar helpers ──────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#0558E8', '#7C3AED', '#10B981', '#F59E0B',
  '#EF4444', '#3B82F6', '#8B5CF6',
];

function avatarColorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(displayName: string, username: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (displayName[0] ?? username[0] ?? '?').toUpperCase();
}

function UserAvatar({ user, size = 44 }: { user: SocialUser; size?: number }) {
  return (
    <View
      style={[
        s.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: avatarColorFor(user.id),
        },
      ]}
    >
      <Text style={[s.avatarText, { fontSize: size * 0.36 }]}>
        {initials(user.display_name, user.username)}
      </Text>
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

// ─── Incoming Request Row ────────────────────────────────────────────────────

function IncomingRow({ request }: { request: FriendRequest }) {
  const respond = useRespondToFriendRequest();
  const user = request.from_user;
  if (!user) return null;

  const isActing = respond.isPending;

  async function handleRespond(status: 'accepted' | 'rejected') {
    try {
      await respond.mutateAsync({ requestId: request.id, status });
    } catch {
      Alert.alert(
        'Something went wrong',
        status === 'accepted'
          ? 'Could not accept the request. Please try again.'
          : 'Could not decline the request. Please try again.'
      );
    }
  }

  return (
    <View style={s.requestRow}>
      <UserAvatar user={user} />
      <View style={s.userInfo}>
        <Text style={s.displayName} numberOfLines={1}>
          {user.display_name}
        </Text>
        <Text style={s.username}>@{user.username}</Text>
        <Text style={s.dateText}>{formatDate(request.created_at)}</Text>
      </View>
      <View style={s.actionGroup}>
        <TouchableOpacity
          style={[s.actionBtn, s.declineBtn, isActing && s.btnDisabled]}
          onPress={() => handleRespond('rejected')}
          disabled={isActing}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Decline request from ${user.display_name}`}
        >
          <Text style={s.declineBtnText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.actionBtn, s.acceptBtn, isActing && s.btnDisabled]}
          onPress={() => handleRespond('accepted')}
          disabled={isActing}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Accept request from ${user.display_name}`}
        >
          {isActing ? (
            <ActivityIndicator size="small" color={Colors.textOnBrand} />
          ) : (
            <Text style={s.acceptBtnText}>Accept</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Outgoing Request Row ────────────────────────────────────────────────────

function OutgoingRow({ request }: { request: FriendRequest }) {
  const user = request.to_user;
  if (!user) return null;

  return (
    <View style={s.requestRow}>
      <UserAvatar user={user} />
      <View style={s.userInfo}>
        <Text style={s.displayName} numberOfLines={1}>
          {user.display_name}
        </Text>
        <Text style={s.username}>@{user.username}</Text>
        <Text style={s.dateText}>{formatDate(request.created_at)}</Text>
      </View>
      <View style={[s.pendingBadge]}>
        <Text style={s.pendingBadgeText}>Pending</Text>
      </View>
    </View>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      {count > 0 && (
        <View style={s.sectionBadge}>
          <Text style={s.sectionBadgeText}>{count}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptySection({ message }: { message: string }) {
  return (
    <View style={s.emptySection}>
      <Text style={s.emptySectionText}>{message}</Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

type Tab = 'incoming' | 'outgoing';

export default function FriendRequestsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('incoming');

  const { data, isLoading, isError, refetch, isRefetching } = useFriendRequests();

  const incoming = data?.incoming ?? [];
  const outgoing = data?.outgoing ?? [];

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // ─── Render ─────────────────────────────────────────────────────────────

  function renderContent() {
    if (isLoading) {
      return (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={Colors.brandBlue} />
        </View>
      );
    }

    if (isError) {
      return (
        <View style={s.centered}>
          <Ionicons name="cloud-offline-outline" size={40} color={Colors.textTertiary} />
          <Text style={s.errorText}>Could not load friend requests.</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => refetch()} activeOpacity={0.8}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const items = activeTab === 'incoming' ? incoming : outgoing;
    const isEmpty = items.length === 0;

    return (
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) =>
          activeTab === 'incoming'
            ? <IncomingRow request={item} />
            : <OutgoingRow request={item} />
        }
        contentContainerStyle={[s.listContent, isEmpty && s.listEmpty]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={s.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={Colors.brandBlue}
            colors={[Colors.brandBlue]}
          />
        }
        ListEmptyComponent={
          <EmptySection
            message={
              activeTab === 'incoming'
                ? 'No pending requests'
                : 'No outgoing requests'
            }
          />
        }
      />
    );
  }

  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Friend Requests</Text>
        <View style={s.backBtn} />
      </View>

      {/* Segmented control */}
      <View style={s.segmentRow}>
        <TouchableOpacity
          style={[s.segment, activeTab === 'incoming' && s.segmentActive]}
          onPress={() => setActiveTab('incoming')}
          activeOpacity={0.8}
        >
          <Text style={[s.segmentText, activeTab === 'incoming' && s.segmentTextActive]}>
            Incoming
          </Text>
          {incoming.length > 0 && (
            <View style={[s.tabBadge, activeTab === 'incoming' && s.tabBadgeActive]}>
              <Text style={[s.tabBadgeText, activeTab === 'incoming' && s.tabBadgeTextActive]}>
                {incoming.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.segment, activeTab === 'outgoing' && s.segmentActive]}
          onPress={() => setActiveTab('outgoing')}
          activeOpacity={0.8}
        >
          <Text style={[s.segmentText, activeTab === 'outgoing' && s.segmentTextActive]}>
            Sent
          </Text>
          {outgoing.length > 0 && (
            <View style={[s.tabBadge, activeTab === 'outgoing' && s.tabBadgeActive]}>
              <Text style={[s.tabBadgeText, activeTab === 'outgoing' && s.tabBadgeTextActive]}>
                {outgoing.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {renderContent()}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingTop: Platform.OS === 'android' ? Spacing.lg : Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },

  // Segmented control
  segmentRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.base,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 3,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: BorderRadius.md,
    gap: 6,
  },
  segmentActive: {
    backgroundColor: Colors.background,
    ...Shadows.sm,
  },
  segmentText: {
    fontSize: Typography.sizes.sm,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  segmentTextActive: {
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabBadgeActive: {
    backgroundColor: Colors.brandBlue,
  },
  tabBadgeText: {
    fontSize: Typography.sizes.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  tabBadgeTextActive: {
    color: Colors.textOnBrand,
  },

  // List
  listContent: {
    paddingHorizontal: Spacing.base,
    paddingBottom: 40,
  },
  listEmpty: {
    flex: 1,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginLeft: 44 + Spacing.md,
  },

  // Request row
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  displayName: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  username: {
    fontSize: Typography.sizes.sm,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  dateText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },

  // Action buttons
  actionGroup: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexShrink: 0,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  acceptBtn: {
    backgroundColor: Colors.brandBlue,
  },
  acceptBtnText: {
    color: Colors.textOnBrand,
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
  },
  declineBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  declineBtnText: {
    color: Colors.textSecondary,
    fontSize: Typography.sizes.sm,
    fontWeight: '500',
  },
  btnDisabled: {
    opacity: 0.5,
  },

  // Pending badge (outgoing)
  pendingBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  pendingBadgeText: {
    fontSize: Typography.sizes.sm,
    fontWeight: '500',
    color: Colors.textTertiary,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  sectionBadgeText: {
    fontSize: Typography.sizes.xs,
    fontWeight: '700',
    color: Colors.textOnBrand,
  },

  // Empty section
  emptySection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptySectionText: {
    fontSize: Typography.sizes.base,
    color: Colors.textTertiary,
    textAlign: 'center',
  },

  // Loading / Error
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
});
