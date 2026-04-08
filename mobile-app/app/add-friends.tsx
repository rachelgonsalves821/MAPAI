/**
 * Mapai — Add Friends Screen
 * Search for users by name / username and send friend requests.
 * Route: /add-friends  (registered in _layout.tsx)
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
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
  useSearchUsers,
  useSendFriendRequest,
  useFriendshipStatus,
  type SocialUser,
  type FriendshipStatus,
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

// ─── UserAvatar ──────────────────────────────────────────────────────────────

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

// ─── UserRow ─────────────────────────────────────────────────────────────────

/**
 * Each search result row. Reads friendship status and action button state.
 * Uses its own hook call for status so each row is independently reactive.
 */
function UserRow({ user }: { user: SocialUser }) {
  const { data: status, isLoading: statusLoading } = useFriendshipStatus(user.id);
  const sendRequest = useSendFriendRequest();

  const handleAdd = useCallback(async () => {
    try {
      await sendRequest.mutateAsync(user.id);
    } catch (err: any) {
      // 409 = request already exists, the optimistic cache update handles the UI
      const statusCode = err?.response?.status;
      if (statusCode !== 409) {
        Alert.alert('Could not send request', 'Please try again.');
      }
    }
  }, [sendRequest, user.id]);

  const isPending = sendRequest.isPending;
  const effectiveStatus: FriendshipStatus | 'loading' = statusLoading
    ? 'loading'
    : (status ?? 'none');

  function renderAction() {
    if (effectiveStatus === 'loading') {
      return (
        <View style={[s.actionBtn, s.actionBtnGray]}>
          <ActivityIndicator size="small" color={Colors.textTertiary} />
        </View>
      );
    }

    if (effectiveStatus === 'friends') {
      return (
        <View style={[s.actionBtn, s.actionBtnGray]}>
          <Ionicons name="checkmark" size={14} color={Colors.success} />
          <Text style={s.actionBtnGrayText}>Friends</Text>
        </View>
      );
    }

    if (effectiveStatus === 'pending_outgoing') {
      return (
        <View style={[s.actionBtn, s.actionBtnGray]}>
          <Text style={s.actionBtnGrayText}>Pending</Text>
        </View>
      );
    }

    if (effectiveStatus === 'pending_incoming') {
      return (
        <View style={[s.actionBtn, s.actionBtnGray]}>
          <Text style={s.actionBtnGrayText}>Respond</Text>
        </View>
      );
    }

    // 'none' — show Add button
    return (
      <TouchableOpacity
        style={[s.actionBtn, s.actionBtnBlue, isPending && s.actionBtnDisabled]}
        onPress={handleAdd}
        disabled={isPending}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Add ${user.display_name} as friend`}
      >
        {isPending ? (
          <ActivityIndicator size="small" color={Colors.textOnBrand} />
        ) : (
          <Text style={s.actionBtnBlueText}>Add</Text>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.userRow}>
      <UserAvatar user={user} />
      <View style={s.userInfo}>
        <Text style={s.displayName} numberOfLines={1}>
          {user.display_name}
        </Text>
        <Text style={s.username} numberOfLines={1}>
          @{user.username}
        </Text>
      </View>
      {renderAction()}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function AddFriendsScreen() {
  const router = useRouter();
  const [rawQuery, setRawQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: results, isLoading, isFetching } = useSearchUsers(debouncedQuery);

  // Debounce: wait 300ms after the user stops typing before firing the query
  const handleQueryChange = useCallback((text: string) => {
    setRawQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length < 2) {
      setDebouncedQuery('');
      return;
    }

    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(text.trim());
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ─── Empty / loading states ─────────────────────────────────────────────

  const showSpinner = (isLoading || isFetching) && debouncedQuery.length >= 2;
  const showResults = debouncedQuery.length >= 2 && !showSpinner;
  const hasResults = (results?.length ?? 0) > 0;

  function renderEmptyState() {
    if (rawQuery.trim().length < 2) {
      return (
        <View style={s.emptyState}>
          <Ionicons name="search-outline" size={44} color={Colors.textTertiary} />
          <Text style={s.emptyTitle}>Find your people</Text>
          <Text style={s.emptySubtitle}>
            Search by name or @username to find friends on Mapai.
          </Text>
        </View>
      );
    }

    if (showSpinner) {
      return (
        <View style={s.emptyState}>
          <ActivityIndicator size="large" color={Colors.brandBlue} />
        </View>
      );
    }

    if (showResults && !hasResults) {
      return (
        <View style={s.emptyState}>
          <Ionicons name="person-outline" size={44} color={Colors.textTertiary} />
          <Text style={s.emptyTitle}>No users found</Text>
          <Text style={s.emptySubtitle}>
            No results for "{debouncedQuery}". Try a different name or username.
          </Text>
        </View>
      );
    }

    return null;
  }

  // ─── Render ─────────────────────────────────────────────────────────────

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
        <Text style={s.headerTitle}>Add Friends</Text>
        {/* Spacer to balance the back button */}
        <View style={s.backBtn} />
      </View>

      {/* Search bar */}
      <View style={s.searchBar}>
        <Ionicons name="search" size={17} color={Colors.textTertiary} />
        <TextInput
          style={s.searchInput}
          placeholder="Search by name or @username"
          placeholderTextColor={Colors.textTertiary}
          value={rawQuery}
          onChangeText={handleQueryChange}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Search for users"
        />
        {showSpinner && (
          <ActivityIndicator size="small" color={Colors.textTertiary} />
        )}
      </View>

      {/* Results / Empty state */}
      {showResults && hasResults ? (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <UserRow user={item} />}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={s.separator} />}
        />
      ) : (
        renderEmptyState()
      )}
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

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.base,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.sizes.base,
    color: Colors.textPrimary,
    padding: 0,
  },

  // List
  listContent: {
    paddingHorizontal: Spacing.base,
    paddingBottom: 40,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginLeft: 44 + Spacing.md, // align with text, past avatar
  },

  // User row
  userRow: {
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
    minWidth: 0, // allow text truncation
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

  // Action buttons
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.base,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    minWidth: 72,
    justifyContent: 'center',
  },
  actionBtnBlue: {
    backgroundColor: Colors.brandBlue,
  },
  actionBtnBlueText: {
    color: Colors.textOnBrand,
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
  },
  actionBtnGray: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  actionBtnGrayText: {
    color: Colors.textSecondary,
    fontSize: Typography.sizes.sm,
    fontWeight: '500',
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },

  // Empty states
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['2xl'],
    paddingBottom: 80,
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
