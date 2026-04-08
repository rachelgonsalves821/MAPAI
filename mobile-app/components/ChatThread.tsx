/**
 * Mapai — ChatThread
 *
 * The expanded chat experience rendered inside the bottom sheet.
 * Mirrors the chat logic from app/chat.tsx but designed for in-sheet use.
 *
 * - AI bubbles: left-aligned, #F9FAFB bg, violet left border
 * - User bubbles: right-aligned, #0558E8 fill, white text
 * - Place results rendered as horizontal-scroll cards
 * - Calls onClose to collapse the sheet
 * - Updates mapStore.setDiscoveryPlaces when places are returned
 */

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, Spacing, Shadows } from '@/constants/theme';
import { useMapStore } from '@/store/mapStore';
import { useChatStore } from '@/store/chatStore';
import { useChatActions } from '@/hooks/useChatActions';
import { Place } from '@/types';

// ─── Constants ───────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Local types ─────────────────────────────────────────────

type PlaceResult = {
  id?: string;
  name: string;
  category?: string;
  priceLevel?: number;
  matchScore?: number;
  matchReasons?: string[];
  address?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  photos?: string[];
  socialSignals?: any[];
  distanceKm?: number;
  walkingMinutes?: number;
  distanceLabel?: string;
};


// ─── Public handle for ChatOverlay to trigger an auto-send ───

export interface ChatThreadHandle {
  sendMessage: (text: string) => void;
}

// ─── Props ───────────────────────────────────────────────────

interface ChatThreadProps {
  onClose: () => void;
  /** If provided the thread sends this as the first message automatically */
  initialQuery?: string;
}

// ─── Place card (horizontal scroll variant) ──────────────────

function PlaceCard({
  place,
  index,
}: {
  place: PlaceResult;
  index: number;
}) {
  const router = useRouter();
  const price = place.priceLevel ? '$'.repeat(place.priceLevel) : null;
  const reason = place.matchReasons?.[0];

  return (
    <TouchableOpacity
      style={styles.placeCard}
      activeOpacity={0.82}
      onPress={() => {
        if (place.id) router.push(`/place/${place.id}` as any);
      }}
    >
      {/* Index badge */}
      <View style={styles.placeCardBadge}>
        <Text style={styles.placeCardBadgeText}>{index + 1}</Text>
      </View>

      <Text style={styles.placeCardName} numberOfLines={1}>
        {place.name}
      </Text>

      {place.distanceLabel ? (
        <View style={styles.placeCardDistanceRow}>
          <Ionicons name="walk" size={12} color={
            (place.walkingMinutes ?? 99) <= 10 ? '#059669' : Colors.textSecondary
          } />
          <Text style={[
            styles.placeCardDistance,
            (place.walkingMinutes ?? 99) <= 10 && { color: '#059669', fontWeight: '600' as any },
          ]}>
            {place.distanceLabel}
          </Text>
        </View>
      ) : null}

      <View style={styles.placeCardMeta}>
        {place.category ? (
          <Text style={styles.placeCardChip}>{place.category}</Text>
        ) : null}
        {price ? (
          <Text style={styles.placeCardChip}>{price}</Text>
        ) : null}
      </View>

      {reason ? (
        <Text style={styles.placeCardReason} numberOfLines={2}>
          {reason}
        </Text>
      ) : null}

      <View style={styles.placeCardFooter}>
        {place.matchScore != null ? (
          <Text style={styles.placeCardScore}>{place.matchScore}% match</Text>
        ) : null}
        {place.id ? (
          <TouchableOpacity
            onPress={() => router.push(`/place/${place.id}` as any)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={0.65}
          >
            <Text style={styles.placeCardWhy}>Why?</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ─── Main component ───────────────────────────────────────────

function ChatThreadInner(
  { onClose, initialQuery }: ChatThreadProps,
  ref: React.Ref<ChatThreadHandle>,
) {
  // Single source of truth — subscribe reactively so the UI always reflects
  // whatever useChatActions writes to the store (optimistic user msg, AI reply,
  // error bubble). No local messages copy needed.
  const messages = useChatStore((state) => state.messages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const { setDiscoveryPlaces } = useMapStore();
  const { sendMessage: chatSend } = useChatActions();
  const hasAutoSent = useRef(false);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  /**
   * Send a message.
   *
   * All session management and persistence is delegated to useChatActions
   * (which in turn delegates persistence to the backend). This component is
   * only responsible for local UI state (message list, loading indicator,
   * map pins) and scroll position.
   */
  const send = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
      if (!text || loading) return;

      if (!overrideText) setInput('');
      setLoading(true);
      scrollToBottom();

      try {
        // useChatActions handles: optimistic user msg → store, backend call,
        // AI reply → store, error bubble → store. The reactive subscription
        // above re-renders this component automatically on every store write.
        const result = await chatSend(text);

        // Push place pins to the map if the AI returned results
        if (result?.places && result.places.length > 0) {
          const mappedPlaces: Place[] = (result.places as PlaceResult[])
            .filter((p) => p.location?.latitude && p.location?.longitude)
            .map((p) => ({
              id: p.id ?? `place-${Date.now()}-${Math.random()}`,
              googlePlaceId: p.id ?? '',
              name: p.name,
              category: (p.category as Place['category']) ?? 'other',
              categoryChips: p.category ? [p.category] : [],
              address: p.address ?? '',
              neighborhood: 'Back Bay' as Place['neighborhood'],
              location: {
                latitude: p.location!.latitude,
                longitude: p.location!.longitude,
              },
              rating: p.rating ?? 0,
              priceLevel: p.priceLevel ?? 0,
              photos: p.photos ?? [],
              matchScore: p.matchScore ?? 50,
              matchReasons: p.matchReasons ?? [],
              socialSignals: p.socialSignals ?? [],
              isLoyalty: false,
              visitCount: 0,
            }));

          if (mappedPlaces.length > 0) {
            setDiscoveryPlaces(mappedPlaces);
          }
        }
      } finally {
        setLoading(false);
        scrollToBottom();
      }
    },
    [input, loading, setDiscoveryPlaces, scrollToBottom, chatSend],
  );

  // Expose sendMessage to parent via ref
  useImperativeHandle(ref, () => ({ sendMessage: (t: string) => send(t) }), [
    send,
  ]);

  // Auto-send initial query once
  useEffect(() => {
    if (initialQuery && !hasAutoSent.current) {
      hasAutoSent.current = true;
      send(initialQuery);
    }
  }, [initialQuery, send]);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Thread header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="sparkles" size={16} color={Colors.brandViolet} />
          <Text style={styles.headerTitle}>Mapai</Text>
          <View style={styles.statusDot} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* New chat */}
          <TouchableOpacity
            onPress={() => {
              useChatStore.getState().clearChat();
              setMessages([]);
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="add-circle-outline" size={22} color={Colors.brandBlue} />
          </TouchableOpacity>
          {/* Close */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Close chat"
          >
            <Ionicons name="chevron-down" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Empty state */}
        {messages.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="sparkles" size={28} color={Colors.brandViolet} />
            </View>
            <Text style={styles.emptyTitle}>What are you in the mood for?</Text>
            <Text style={styles.emptySubtitle}>
              Ask me about food, coffee, nightlife — anything in Boston.
            </Text>
            <View style={styles.suggestions}>
              {[
                'Find me good ramen nearby',
                'Cozy coffee shop in Beacon Hill',
                'Best brunch spots in South End',
              ].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={styles.suggestion}
                  onPress={() => send(s)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.suggestionText}>{s}</Text>
                  <Ionicons
                    name="arrow-forward"
                    size={13}
                    color={Colors.brandBlue}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Message bubbles */}
        {messages.map((msg) => (
          <View key={msg.id} style={styles.messageGroup}>
            {/* Bubble */}
            <View
              style={[
                styles.bubble,
                msg.role === 'user' ? styles.bubbleUser : styles.bubbleAI,
              ]}
            >
              {msg.role === 'assistant' && (
                <View style={styles.aiLabel}>
                  <Ionicons
                    name="sparkles"
                    size={11}
                    color={Colors.brandViolet}
                  />
                  <Text style={styles.aiLabelText}>Mapai</Text>
                </View>
              )}
              <Text
                style={[
                  styles.bubbleText,
                  msg.role === 'user'
                    ? styles.bubbleTextUser
                    : styles.bubbleTextAI,
                ]}
              >
                {msg.content}
              </Text>
            </View>

            {/* Horizontal place card scroll */}
            {msg.places && msg.places.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.placeScroll}
                contentContainerStyle={styles.placeScrollContent}
              >
                {msg.places.map((place, i) => (
                  <PlaceCard key={place.id ?? i} place={place} index={i} />
                ))}
              </ScrollView>
            )}
          </View>
        ))}

        {/* Loading indicator */}
        {loading && (
          <View style={styles.typingRow}>
            <ActivityIndicator size="small" color={Colors.brandViolet} />
            <Text style={styles.typingText}>Mapai is thinking...</Text>
          </View>
        )}
      </ScrollView>

      {/* Text input bar */}
      <View style={styles.inputBar}>
        <View style={styles.inputPill}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about places in Boston..."
            placeholderTextColor={Colors.textTertiary}
            returnKeyType="send"
            onSubmitEditing={() => send()}
            blurOnSubmit={false}
            autoFocus={false}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!input.trim() || loading) && styles.sendBtnOff,
            ]}
            onPress={() => send()}
            disabled={!input.trim() || loading}
            activeOpacity={0.8}
          >
            <Ionicons
              name="arrow-up"
              size={18}
              color={
                input.trim() && !loading ? '#FFFFFF' : Colors.textTertiary
              }
            />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

export const ChatThread = forwardRef(ChatThreadInner);
export default ChatThread;

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBorder,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.brandBlue,
    letterSpacing: -0.3,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },

  // Message list
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: Spacing.base,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },

  // Empty state
  empty: {
    marginTop: Spacing['2xl'],
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.brandVioletLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  suggestions: {
    width: '100%',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    ...Shadows.sm,
  },
  suggestionText: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: '500',
  },

  // Message group
  messageGroup: {
    gap: Spacing.sm,
  },

  // Bubbles
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.brandBlue,
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: Colors.brandViolet,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  aiLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 5,
  },
  aiLabelText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.brandViolet,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: '#FFFFFF',
  },
  bubbleTextAI: {
    color: Colors.textPrimary,
  },

  // Place cards (horizontal scroll)
  placeScroll: {
    marginLeft: 0,
  },
  placeScrollContent: {
    gap: Spacing.sm,
    paddingRight: Spacing.base,
  },
  placeCard: {
    width: SCREEN_W * 0.52,
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 5,
    ...Shadows.sm,
  },
  placeCardBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  placeCardBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  placeCardName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  placeCardDistanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  placeCardDistance: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  placeCardMeta: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  placeCardChip: {
    fontSize: 11,
    color: Colors.textSecondary,
    backgroundColor: Colors.surface,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontWeight: '500',
    textTransform: 'capitalize',
    overflow: 'hidden',
  },
  placeCardReason: {
    fontSize: 11,
    color: Colors.brandViolet,
    fontStyle: 'italic',
    lineHeight: 15,
  },
  placeCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  placeCardScore: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.brandBlue,
  },
  placeCardWhy: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.brandViolet,
  },

  // Typing indicator
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: 4,
  },
  typingText: {
    fontSize: 12,
    color: Colors.textTertiary,
    fontStyle: 'italic',
  },

  // Input bar
  inputBar: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? Spacing.sm : Spacing.md,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.surfaceBorder,
  },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingLeft: Spacing.base,
    paddingRight: 5,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    height: 36,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnOff: {
    backgroundColor: Colors.surfaceElevated,
  },
});
