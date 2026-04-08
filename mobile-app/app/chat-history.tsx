/**
 * Mapai — Chat History Screen
 * Browse past conversations from the last 30 days.
 * Tap a session to resume it in the chat overlay.
 * Long-press a session to delete it.
 * Use the search bar to find conversations by keyword.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Platform, RefreshControl, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useChatStore, ChatMessage } from '@/store/chatStore';
import { useUIStore } from '@/store/uiStore';
import { useChatActions } from '@/hooks/useChatActions';
import apiClient from '@/services/api/client';

const NAVY = '#0558E8';

interface SessionItem {
  id: string;
  title?: string;
  summary?: string;
  message_count?: number;
  created_at: string;
  updated_at: string;
}

function formatSessionTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 1) return 'Just now';
  if (diffH < 24) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (diffH < 48) return 'Yesterday';
  if (diffH < 168) {
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function groupByDate(sessions: SessionItem[]): { label: string; items: SessionItem[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const lastWeek = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; items: SessionItem[] }[] = [];
  const todayItems = sessions.filter(s => new Date(s.updated_at) >= today);
  const yesterdayItems = sessions.filter(s => {
    const d = new Date(s.updated_at);
    return d >= yesterday && d < today;
  });
  const weekItems = sessions.filter(s => {
    const d = new Date(s.updated_at);
    return d >= lastWeek && d < yesterday;
  });
  const olderItems = sessions.filter(s => new Date(s.updated_at) < lastWeek);

  if (todayItems.length) groups.push({ label: 'TODAY', items: todayItems });
  if (yesterdayItems.length) groups.push({ label: 'YESTERDAY', items: yesterdayItems });
  if (weekItems.length) groups.push({ label: 'LAST WEEK', items: weekItems });
  if (olderItems.length) groups.push({ label: 'EARLIER THIS MONTH', items: olderItems });

  return groups;
}

export default function ChatHistoryScreen() {
  const router = useRouter();
  const { loadSession, deleteSession } = useChatActions();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchSessions = useCallback(async (query?: string) => {
    try {
      const params: any = { limit: 50 };
      if (query?.trim()) params.q = query.trim();
      const res = await apiClient.get('/v1/chat/history/sessions', { params });
      const data = res.data?.data ?? res.data;
      const items = data.sessions ?? data ?? [];
      setSessions(Array.isArray(items) ? items : []);
    } catch (err) {
      console.warn('Failed to load chat history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Clean up pending debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSessions(text.trim() || undefined);
    }, 400);
  };

  const handleClearSearch = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchQuery('');
    setLoading(true);
    fetchSessions(undefined);
  };

  const handleOpenSession = async (session: SessionItem) => {
    await loadSession(session.id);
    useUIStore.getState().openChat();
    router.back();
  };

  const handleNewChat = () => {
    useChatStore.getState().clearChat();
    useUIStore.getState().openChat();
    router.back();
  };

  const handleDeleteSession = async (sessionId: string) => {
    await deleteSession(sessionId);
    setSessions(prev => prev.filter(s => s.id !== sessionId));
  };

  const isSearching = searchQuery.trim().length > 0;
  const grouped = groupByDate(sessions);

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Chat History</Text>
        <TouchableOpacity onPress={handleNewChat} style={s.newBtn}>
          <Ionicons name="add" size={22} color={NAVY} />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={s.searchRow}>
        <View style={s.searchBar}>
          <Ionicons name="search" size={16} color={Colors.textTertiary} style={s.searchIcon} />
          <TextInput
            style={s.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor={Colors.textTertiary}
            value={searchQuery}
            onChangeText={handleSearchChange}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="never"
          />
          {isSearching && (
            <TouchableOpacity onPress={handleClearSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={Colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={NAVY} />
        </View>
      ) : sessions.length === 0 ? (
        <View style={s.emptyState}>
          <Ionicons
            name={isSearching ? 'search-outline' : 'chatbubbles-outline'}
            size={44}
            color="#D1D5DB"
          />
          <Text style={s.emptyTitle}>
            {isSearching ? 'No results found' : 'No conversations yet'}
          </Text>
          <Text style={s.emptySub}>
            {isSearching
              ? `Nothing matched "${searchQuery.trim()}"`
              : 'Start chatting to discover places'}
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchSessions(isSearching ? searchQuery : undefined); }}
            />
          }
        >
          {/* Flat list for search results, grouped layout otherwise */}
          {isSearching ? (
            <View>
              <Text style={s.dateLabel}>
                {sessions.length} {sessions.length === 1 ? 'RESULT' : 'RESULTS'}
              </Text>
              {sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  onPress={() => handleOpenSession(session)}
                  onLongPress={() => handleDeleteSession(session.id)}
                />
              ))}
            </View>
          ) : (
            grouped.map((group) => (
              <View key={group.label}>
                <Text style={s.dateLabel}>{group.label}</Text>
                {group.items.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    onPress={() => handleOpenSession(session)}
                    onLongPress={() => handleDeleteSession(session.id)}
                  />
                ))}
              </View>
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Session row (extracted to avoid duplication between flat/grouped views) ──

interface SessionRowProps {
  session: SessionItem;
  onPress: () => void;
  onLongPress: () => void;
}

function SessionRow({ session, onPress, onLongPress }: SessionRowProps) {
  return (
    <TouchableOpacity
      style={s.sessionRow}
      activeOpacity={0.7}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <Ionicons name="chatbubble" size={18} color={NAVY} style={s.sessionIcon} />
      <View style={s.sessionInfo}>
        <Text style={s.sessionTitle} numberOfLines={1}>
          {session.summary ?? session.title ?? 'New conversation'}
        </Text>
        <Text style={s.sessionMeta}>
          {session.message_count ?? '?'} messages · {formatSessionTime(session.updated_at)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 36, paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  newBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  // Search bar
  searchRow: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBorder,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    height: 38,
  },
  searchIcon: { marginRight: Spacing.xs },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#9CA3AF', marginTop: 12 },
  emptySub: { fontSize: 14, color: '#D1D5DB', marginTop: 4 },
  dateLabel: {
    fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 1,
    textTransform: 'uppercase', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
  },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6',
  },
  sessionIcon: { marginRight: 14 },
  sessionInfo: { flex: 1 },
  sessionTitle: { fontSize: 15, fontWeight: '500', color: '#111827' },
  sessionMeta: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
});
