/**
 * Mapai — Core Chat Screen (MVP)
 * Minimal end-to-end test: user types → backend responds → place cards render.
 * No auth, no navigation, no state management — just the core loop.
 */

import React, { useState, useRef, useCallback } from 'react';
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
  SafeAreaView,
} from 'react-native';
import { useMapStore } from '@/store/mapStore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3001';

// ─── Types ────────────────────────────────────────────────────

type PlaceResult = {
  id?: string;
  name: string;
  category?: string;
  priceLevel?: number;
  matchScore?: number;
  matchReasons?: string[];
  address?: string;
  location?: { latitude: number; longitude: number };
};

type ResponseType = 'recommendation' | 'conversational' | 'error';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  places?: PlaceResult[];
};

// ─── Place Card ───────────────────────────────────────────────

function PlaceCard({ place, index }: { place: PlaceResult; index: number }) {
  const price = place.priceLevel ? '$'.repeat(place.priceLevel) : null;
  const reason = place.matchReasons?.[0];
  const chips = [place.category, price].filter(Boolean);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardIndex}>{index + 1}</Text>
        <Text style={styles.cardName} numberOfLines={1}>{place.name}</Text>
        {place.matchScore != null && (
          <Text style={styles.cardScore}>{place.matchScore}%</Text>
        )}
      </View>

      {chips.length > 0 && (
        <View style={styles.chipRow}>
          {chips.map((chip, i) => (
            <View key={i} style={styles.chip}>
              <Text style={styles.chipText}>{chip}</Text>
            </View>
          ))}
        </View>
      )}

      {reason ? (
        <Text style={styles.cardReason} numberOfLines={2}>
          {reason}
        </Text>
      ) : null}

      {place.address ? (
        <Text style={styles.cardAddress} numberOfLines={1}>
          {place.address}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const sessionId = useRef(`session-${Date.now()}`).current;
  const scrollRef = useRef<ScrollView>(null);
  const { setDiscoveryPlaces } = useMapStore();

  const scrollToBottom = () =>
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    scrollToBottom();

    try {
      const res = await fetch(`${BACKEND_URL}/v1/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          session_id: sessionId,
          location: { lat: 42.3601, lng: -71.0589 },
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const json = await res.json();
      // Backend wraps in { data: { type, reply, places, session_id } }
      const data = json.data ?? json;
      const responseType: ResponseType = data.type || 'recommendation';

      // Only include places for recommendation responses
      const places =
        responseType === 'recommendation' && Array.isArray(data.places)
          ? data.places.slice(0, 5)
          : [];

      // Sync places to the map store so ExploreView markers update
      if (places.length > 0) {
        setDiscoveryPlaces(
          places
            .filter((p: PlaceResult) => p.location?.latitude && p.location?.longitude)
            .map((p: PlaceResult) => ({
              ...p,
              location: {
                latitude: p.location!.latitude,
                longitude: p.location!.longitude,
              },
              matchScore: p.matchScore ?? 0,
            })),
        );
      }

      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.reply || data.text || '(no response)',
        places,
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err: any) {
      const isNetworkError = err.message?.includes('Network request failed') || err.message?.includes('fetch');
      setMessages(prev => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: isNetworkError
            ? `Can't reach the backend.\n\nCheck that:\n• Backend is running (npm run dev)\n• EXPO_PUBLIC_BACKEND_URL is set correctly\n• Current: ${BACKEND_URL}`
            : `Error: ${err.message}`,
        },
      ]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }, [input, loading, sessionId, setDiscoveryPlaces]);

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Mapai</Text>
          <Text style={styles.headerSub}>Boston discovery</Text>
        </View>
        <View style={styles.statusDot} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Message list */}
        <ScrollView
          ref={scrollRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Ask Mapai anything</Text>
              <View style={styles.suggestions}>
                {[
                  'Find me good ramen in Boston',
                  'Cozy coffee shop near Beacon Hill',
                  'Best brunch spots in South End',
                ].map(s => (
                  <TouchableOpacity
                    key={s}
                    style={styles.suggestion}
                    onPress={() => setInput(s)}
                  >
                    <Text style={styles.suggestionText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {messages.map(msg => (
            <View key={msg.id} style={styles.messageGroup}>
              {/* Chat bubble */}
              <View
                style={[
                  styles.bubble,
                  msg.role === 'user' ? styles.bubbleUser : styles.bubbleAI,
                ]}
              >
                <Text
                  style={[
                    styles.bubbleText,
                    msg.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAI,
                  ]}
                >
                  {msg.content}
                </Text>
              </View>

              {/* Place cards */}
              {msg.places && msg.places.length > 0 && (
                <View style={styles.cardList}>
                  {msg.places.map((place, i) => (
                    <PlaceCard key={place.id ?? i} place={place} index={i} />
                  ))}
                </View>
              )}
            </View>
          ))}

          {loading && (
            <View style={styles.typingRow}>
              <ActivityIndicator size="small" color="#1D3E91" />
              <Text style={styles.typingText}>Mapai is thinking…</Text>
            </View>
          )}
        </ScrollView>

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about places in Boston…"
            placeholderTextColor="#9CA3AF"
            returnKeyType="send"
            onSubmitEditing={send}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!input.trim() || loading) && styles.sendBtnOff,
            ]}
            onPress={send}
            disabled={!input.trim() || loading}
            activeOpacity={0.8}
          >
            <Text style={styles.sendArrow}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  flex: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.12)',
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1D3E91',
    letterSpacing: -0.4,
  },
  headerSub: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
    marginTop: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },

  // Message list
  messageList: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  messageListContent: {
    padding: 16,
    paddingBottom: 24,
    gap: 16,
  },

  // Empty state
  empty: {
    marginTop: 40,
    alignItems: 'center',
    gap: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  suggestions: {
    width: '100%',
    gap: 8,
  },
  suggestion: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  suggestionText: {
    fontSize: 14,
    color: '#1D3E91',
    fontWeight: '500',
  },

  // Message group (bubble + cards)
  messageGroup: {
    gap: 8,
  },

  // Bubble
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: '#1D3E91',
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0F6FF',
    borderTopLeftRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#7C3AED',
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  bubbleTextUser: {
    color: '#FFFFFF',
  },
  bubbleTextAI: {
    color: '#111827',
  },

  // Place cards
  cardList: {
    gap: 8,
    paddingLeft: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    gap: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1D3E91',
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    overflow: 'hidden',
  },
  cardName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  cardScore: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1D3E91',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  chipText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  cardReason: {
    fontSize: 13,
    color: '#7C3AED',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  cardAddress: {
    fontSize: 12,
    color: '#9CA3AF',
  },

  // Typing indicator
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  typingText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 12 : 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.12)',
  },
  input: {
    flex: 1,
    height: 44,
    backgroundColor: '#F9FAFB',
    borderRadius: 22,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1D3E91',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnOff: {
    backgroundColor: '#E5E7EB',
  },
  sendArrow: {
    fontSize: 22,
    color: '#FFFFFF',
    fontWeight: '700',
    lineHeight: 26,
    marginTop: -2,
  },
});
