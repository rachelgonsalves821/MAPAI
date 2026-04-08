/**
 * Mapai — Planning Session Screen
 * Collaborative trip planning with suggestions, votes, and group chat.
 * Route: /planning/[id]
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  BorderRadius,
  Colors,
  Shadows,
  Spacing,
  Typography,
} from '@/constants/theme';

import { BACKEND_URL } from '@/constants/api';

// ─── Constants ────────────────────────────────────────────────

const TOP_INSET = Platform.OS === 'ios' ? 54 : 34;
const POLL_INTERVAL_MS = 3000;

// Deterministic avatar color palette (same as social feed)
const AVATAR_COLORS = [
  '#0558E8',
  '#7C3AED',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#3B82F6',
  '#8B5CF6',
];

// ─── Types ────────────────────────────────────────────────────

interface Session {
  id: string;
  creator_id: string;
  title: string;
  status: 'active' | 'decided' | 'archived';
  decided_place_id: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Member {
  id: string;
  user_id: string;
  role: 'creator' | 'member';
  joined_at: string;
  display_name?: string;
  username?: string;
}

interface Suggestion {
  id: string;
  session_id: string;
  suggested_by: string;
  place_id: string;
  place_name: string;
  place_address?: string;
  note?: string;
  vote_count: number;
  created_at: string;
  is_voted_by_me: boolean;
}

interface Message {
  id: string;
  session_id: string;
  user_id: string;
  text: string;
  created_at: string;
  sender_name?: string;
}

// ─── Helpers ──────────────────────────────────────────────────

function avatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) & 0xffff;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function userInitial(userId: string, name?: string): string {
  if (name && name.length > 0) return name[0].toUpperCase();
  return userId[0]?.toUpperCase() ?? '?';
}

function formatTime(isoDate: string): string {
  const d = new Date(isoDate);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Sub-components ───────────────────────────────────────────

function MemberAvatar({
  userId,
  name,
  size = 36,
}: {
  userId: string;
  name?: string;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: avatarColor(userId),
        },
      ]}
    >
      <Text style={[styles.avatarInitial, { fontSize: size * 0.38 }]}>
        {userInitial(userId, name)}
      </Text>
    </View>
  );
}

function SuggestionCard({
  suggestion,
  onVote,
  isDecided,
  isWinner,
}: {
  suggestion: Suggestion;
  onVote: (id: string) => void;
  isDecided: boolean;
  isWinner: boolean;
}) {
  return (
    <View
      style={[
        styles.suggestionCard,
        suggestion.is_voted_by_me && styles.suggestionCardVoted,
        isWinner && styles.suggestionCardWinner,
      ]}
    >
      <View style={styles.suggestionContent}>
        <View style={styles.suggestionTextBlock}>
          <Text style={styles.suggestionName} numberOfLines={1}>
            {suggestion.place_name}
          </Text>
          {suggestion.place_address ? (
            <Text style={styles.suggestionAddress} numberOfLines={1}>
              {suggestion.place_address}
            </Text>
          ) : null}
          {suggestion.note ? (
            <Text style={styles.suggestionNote} numberOfLines={2}>
              {suggestion.note}
            </Text>
          ) : null}
        </View>

        <View style={styles.suggestionRight}>
          <View style={styles.voteCountBadge}>
            <Ionicons
              name="thumbs-up"
              size={12}
              color={
                suggestion.is_voted_by_me ? Colors.brandBlue : Colors.textTertiary
              }
            />
            <Text
              style={[
                styles.voteCountText,
                suggestion.is_voted_by_me && styles.voteCountTextActive,
              ]}
            >
              {suggestion.vote_count}
            </Text>
          </View>

          {!isDecided && (
            <TouchableOpacity
              style={[
                styles.voteBtn,
                suggestion.is_voted_by_me && styles.voteBtnActive,
              ]}
              onPress={() => onVote(suggestion.id)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`Vote for ${suggestion.place_name}`}
            >
              <Text
                style={[
                  styles.voteBtnText,
                  suggestion.is_voted_by_me && styles.voteBtnTextActive,
                ]}
              >
                {suggestion.is_voted_by_me ? 'Voted' : 'Vote'}
              </Text>
            </TouchableOpacity>
          )}

          {isWinner && (
            <View style={styles.winnerBadge}>
              <Ionicons name="trophy" size={14} color={Colors.success} />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function MessageRow({ message }: { message: Message }) {
  return (
    <View style={styles.messageRow}>
      <MemberAvatar userId={message.user_id} name={message.sender_name} size={28} />
      <View style={styles.messageBubble}>
        <View style={styles.messageHeader}>
          <Text style={styles.messageSender}>
            {message.sender_name || message.user_id.slice(0, 8)}
          </Text>
          <Text style={styles.messageTime}>{formatTime(message.created_at)}</Text>
        </View>
        <Text style={styles.messageText}>{message.text}</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────

export default function PlanningSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession]         = useState<Session | null>(null);
  const [members, setMembers]         = useState<Member[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [messages, setMessages]       = useState<Message[]>([]);

  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [msgText, setMsgText]   = useState('');
  const [sending, setSending]   = useState(false);

  const lastPollRef    = useRef<string>(new Date(0).toISOString());
  const pollTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const messageListRef = useRef<FlatList<Message>>(null);

  // ── Load initial session ─────────────────────────────────

  const loadSession = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/v1/planning/sessions/${id}`);
      if (!res.ok) throw new Error(`Session returned ${res.status}`);
      const json = await res.json();
      const data = json.data;

      setSession(data.session);
      setMembers(data.members || []);
      setSuggestions(data.suggestions || []);
      setMessages(data.messages || []);
      lastPollRef.current = new Date().toISOString();
    } catch {
      setError('Could not load this planning session.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // ── Poll for updates every 3 seconds ────────────────────

  const pollUpdates = useCallback(async () => {
    if (!id) return;
    try {
      const since = encodeURIComponent(lastPollRef.current);
      const res = await fetch(
        `${BACKEND_URL}/v1/planning/sessions/${id}/updates?since=${since}`
      );
      if (!res.ok) return;
      const json = await res.json();
      const updates = json.data;

      const now = new Date().toISOString();
      lastPollRef.current = now;

      if (updates.session) {
        setSession(updates.session);
      }

      if (updates.new_suggestions?.length) {
        setSuggestions((prev) => {
          const existingIds = new Set(prev.map((s) => s.id));
          const fresh = (updates.new_suggestions as Suggestion[]).filter(
            (s) => !existingIds.has(s.id)
          );
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
      }

      // Re-sync vote counts from full session on any new vote
      if (updates.new_votes?.length) {
        const res2 = await fetch(`${BACKEND_URL}/v1/planning/sessions/${id}`);
        if (res2.ok) {
          const j2 = await res2.json();
          if (j2.data?.suggestions) {
            setSuggestions(j2.data.suggestions);
          }
        }
      }

      if (updates.new_messages?.length) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const fresh = (updates.new_messages as Message[]).filter(
            (m) => !existingIds.has(m.id)
          );
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
      }
    } catch {
      // Silent fail on poll — do not surface errors
    }
  }, [id]);

  useEffect(() => {
    if (!loading && !error) {
      pollTimerRef.current = setInterval(pollUpdates, POLL_INTERVAL_MS);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [loading, error, pollUpdates]);

  // Auto-scroll messages to bottom when new ones arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        messageListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  // ── Vote handler ─────────────────────────────────────────

  const handleVote = useCallback(
    async (suggestionId: string) => {
      // Optimistic update
      setSuggestions((prev) =>
        prev.map((s) => {
          if (s.id !== suggestionId) {
            // Clear previous vote if switching
            if (s.is_voted_by_me) {
              return { ...s, is_voted_by_me: false, vote_count: Math.max(0, s.vote_count - 1) };
            }
            return s;
          }
          const alreadyVoted = s.is_voted_by_me;
          return {
            ...s,
            is_voted_by_me: !alreadyVoted,
            vote_count: alreadyVoted
              ? Math.max(0, s.vote_count - 1)
              : s.vote_count + 1,
          };
        })
      );

      try {
        await fetch(`${BACKEND_URL}/v1/planning/sessions/${id}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ suggestion_id: suggestionId }),
        });
      } catch {
        // Revert on failure by reloading
        loadSession();
      }
    },
    [id, loadSession]
  );

  // ── Send message handler ─────────────────────────────────

  const handleSendMessage = useCallback(async () => {
    const text = msgText.trim();
    if (!text || sending) return;

    setSending(true);
    setMsgText('');

    // Optimistic insert
    const optimisticMsg: Message = {
      id: `opt-${Date.now()}`,
      session_id: id!,
      user_id: 'me',
      text,
      created_at: new Date().toISOString(),
      sender_name: 'You',
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await fetch(`${BACKEND_URL}/v1/planning/sessions/${id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const json = await res.json();
        const savedMsg = json.data?.message;
        if (savedMsg) {
          // Replace optimistic message with real one
          setMessages((prev) =>
            prev.map((m) => (m.id === optimisticMsg.id ? { ...savedMsg, sender_name: 'You' } : m))
          );
        }
      }
    } catch {
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
    } finally {
      setSending(false);
    }
  }, [id, msgText, sending]);

  // ── Decide handler (creator only) ────────────────────────

  const handleDecide = useCallback(async () => {
    try {
      await fetch(`${BACKEND_URL}/v1/planning/sessions/${id}/decide`, {
        method: 'POST',
      });
      loadSession();
    } catch {
      // Silent fail
    }
  }, [id, loadSession]);

  // ── Navigate to winning place ────────────────────────────

  const handleNavigate = useCallback(() => {
    if (session?.decided_place_id) {
      router.push(`/place/${session.decided_place_id}` as any);
    }
  }, [router, session]);

  // ── Compute winner ───────────────────────────────────────

  const winnerSuggestion =
    session?.status === 'decided' && session.decided_place_id
      ? suggestions.find((s) => s.place_id === session.decided_place_id)
      : null;

  // ─── Loading / Error states ──────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.brandBlue} />
      </View>
    );
  }

  if (error || !session) {
    return (
      <View style={styles.centered}>
        <Ionicons name="cloud-offline-outline" size={40} color={Colors.textTertiary} />
        <Text style={styles.errorText}>{error || 'Session not found.'}</Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={loadSession}
          activeOpacity={0.8}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Render ──────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: TOP_INSET }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {session.title}
          </Text>
          <Text style={styles.headerSubtitle}>
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </Text>
        </View>

        <View style={styles.headerRight}>
          {session.status === 'active' && (
            <TouchableOpacity
              style={styles.decideBtn}
              onPress={handleDecide}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Finalize decision"
            >
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Decision Banner ── */}
      {session.status === 'decided' && winnerSuggestion && (
        <View style={styles.decisionBanner}>
          <Ionicons name="trophy" size={18} color={Colors.success} />
          <Text style={styles.decisionText} numberOfLines={1}>
            {winnerSuggestion.place_name}
          </Text>
          <TouchableOpacity
            style={styles.navigateBtn}
            onPress={handleNavigate}
            activeOpacity={0.8}
          >
            <Ionicons name="navigate" size={14} color={Colors.textOnBrand} />
            <Text style={styles.navigateBtnText}>Navigate</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Members Row ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Members</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.membersRow}
          >
            {members.map((m) => (
              <View key={m.id} style={styles.memberItem}>
                <MemberAvatar
                  userId={m.user_id}
                  name={m.display_name || m.username}
                  size={40}
                />
                {m.role === 'creator' && (
                  <View style={styles.creatorBadge}>
                    <Ionicons name="star" size={8} color={Colors.textOnBrand} />
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        </View>

        {/* ── Suggestions ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Places</Text>
            <Text style={styles.sectionCount}>{suggestions.length}</Text>
          </View>

          {suggestions.length === 0 ? (
            <View style={styles.emptySection}>
              <Ionicons name="map-outline" size={32} color={Colors.textTertiary} />
              <Text style={styles.emptySectionText}>No places suggested yet</Text>
            </View>
          ) : (
            suggestions
              .slice()
              .sort((a, b) => b.vote_count - a.vote_count)
              .map((s) => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  onVote={handleVote}
                  isDecided={session.status === 'decided'}
                  isWinner={s.place_id === session.decided_place_id}
                />
              ))
          )}

          {session.status === 'active' && (
            <TouchableOpacity
              style={styles.addPlaceBtn}
              onPress={() => router.push('/' as any)}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Ionicons name="add-circle-outline" size={18} color={Colors.brandBlue} />
              <Text style={styles.addPlaceBtnText}>Add a place</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Chat ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Chat</Text>

          {messages.length === 0 ? (
            <View style={styles.emptySection}>
              <Ionicons name="chatbubbles-outline" size={32} color={Colors.textTertiary} />
              <Text style={styles.emptySectionText}>No messages yet</Text>
            </View>
          ) : (
            <FlatList
              ref={messageListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <MessageRow message={item} />}
              scrollEnabled={false}
              contentContainerStyle={styles.messageList}
            />
          )}

          {/* Message input */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.messageInput}
              placeholder="Say something..."
              placeholderTextColor={Colors.textTertiary}
              value={msgText}
              onChangeText={setMsgText}
              returnKeyType="send"
              onSubmitEditing={handleSendMessage}
              maxLength={500}
              editable={!sending}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!msgText.trim() || sending) && styles.sendBtnDisabled,
              ]}
              onPress={handleSendMessage}
              disabled={!msgText.trim() || sending}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              <Ionicons
                name="send"
                size={18}
                color={
                  msgText.trim() && !sending
                    ? Colors.textOnBrand
                    : Colors.textTertiary
                }
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom padding for keyboard */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.background,
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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    zIndex: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  headerTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: Typography.sizes.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  headerRight: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decideBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Decision banner
  decisionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${Colors.success}18`,
    borderBottomWidth: 1,
    borderBottomColor: `${Colors.success}30`,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  decisionText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
    color: Colors.success,
  },
  navigateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.success,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  navigateBtnText: {
    fontSize: Typography.sizes.xs,
    fontWeight: '700',
    color: Colors.textOnBrand,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
  },

  // Sections
  section: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  sectionTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: Typography.sizes.xs,
    fontWeight: '700',
    color: Colors.textOnBrand,
    backgroundColor: Colors.brandBlue,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },

  // Members
  membersRow: {
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
  },
  memberItem: {
    alignItems: 'center',
    position: 'relative',
  },
  creatorBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.sun ?? Colors.brandViolet,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.background,
  },

  // Avatar
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Empty state
  emptySection: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptySectionText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textTertiary,
  },

  // Suggestion cards
  suggestionCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  suggestionCardVoted: {
    borderColor: Colors.brandBlue,
    backgroundColor: Colors.brandVioletLight,
  },
  suggestionCardWinner: {
    borderColor: Colors.success,
    backgroundColor: `${Colors.success}0D`,
  },
  suggestionContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  suggestionTextBlock: {
    flex: 1,
    gap: 2,
  },
  suggestionName: {
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  suggestionAddress: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
  },
  suggestionNote: {
    fontSize: Typography.sizes.xs,
    color: Colors.textTertiary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  suggestionRight: {
    alignItems: 'center',
    gap: Spacing.xs,
    minWidth: 56,
  },
  voteCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  voteCountText: {
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
    color: Colors.textTertiary,
  },
  voteCountTextActive: {
    color: Colors.brandBlue,
  },
  voteBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.brandBlue,
  },
  voteBtnActive: {
    backgroundColor: Colors.brandBlue,
  },
  voteBtnText: {
    fontSize: Typography.sizes.xs,
    fontWeight: '700',
    color: Colors.brandBlue,
  },
  voteBtnTextActive: {
    color: Colors.textOnBrand,
  },
  winnerBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: `${Colors.success}18`,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Add place button
  addPlaceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.brandBlue,
    borderStyle: 'dashed',
    marginTop: Spacing.xs,
  },
  addPlaceBtnText: {
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
    color: Colors.brandBlue,
  },

  // Messages
  messageList: {
    gap: Spacing.sm,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  messageBubble: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
    marginBottom: 2,
  },
  messageSender: {
    fontSize: Typography.sizes.xs,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  messageTime: {
    fontSize: 10,
    color: Colors.textTertiary,
  },
  messageText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textPrimary,
    lineHeight: 19,
  },

  // Input row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  messageInput: {
    flex: 1,
    height: 40,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    fontSize: Typography.sizes.sm,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: Colors.surfaceElevated,
  },
});
