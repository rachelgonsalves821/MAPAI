/**
 * Mapai — Chat Screen (modal)
 * Full-screen conversational discovery. Slides up from the HomeScreen.
 * User types → backend responds → place cards render inline.
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
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '@/constants/theme';
import { useMapStore } from '@/store/mapStore';
import { useLocationStore } from '@/store/locationStore';
import { buildUserContext } from '@/lib/buildUserContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3001';
const { width: SCREEN_W } = Dimensions.get('window');

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
  const router = useRouter();
  const price = place.priceLevel ? '$'.repeat(place.priceLevel) : null;
  const reason = place.matchReasons?.[0];
  const chips = [place.category, price].filter(Boolean);

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onPress={() => {
        if (place.id) router.push(`/place/${place.id}` as any);
      }}
    >
      <View style={styles.cardLeft}>
        <View style={styles.cardIndexBadge}>
          <Text style={styles.cardIndexText}>{index + 1}</Text>
        </View>
      </View>
      <View style={styles.cardRight}>
        <View style={styles.cardTitleRow}>
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
        {reason && (
          <Text style={styles.cardReason} numberOfLines={2}>{reason}</Text>
        )}
        {place.address && (
          <Text style={styles.cardAddress} numberOfLines={1}>{place.address}</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ query?: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const sessionId = useRef(`session-${Date.now()}`).current;
  const scrollRef = useRef<ScrollView>(null);
  const { setDiscoveryPlaces } = useMapStore();
  const hasAutoSent = useRef(false);

  const scrollToBottom = () =>
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

  const send = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText || input).trim();
      if (!text || loading) return;

      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: text,
      };
      setMessages((prev) => [...prev, userMsg]);
      if (!overrideText) setInput('');
      setLoading(true);
      scrollToBottom();

      try {
        console.log('CHAT REQUEST:', { message: text, sessionId, apiUrl: `${BACKEND_URL}/v1/chat/message` });

        const res = await fetch(`${BACKEND_URL}/v1/chat/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            session_id: sessionId,
            location: {
              lat: useLocationStore.getState().coords.latitude,
              lng: useLocationStore.getState().coords.longitude,
            },
          }),
        });

        if (!res.ok) {
          const errBody = await res.text();
          console.error('CHAT RESPONSE ERROR:', res.status, errBody);
          throw new Error(`Server returned ${res.status}: ${errBody}`);
        }

        const json = await res.json();
        console.log('CHAT RESPONSE:', JSON.stringify(json).slice(0, 500));
        const data = json.data ?? json;
        const responseType: ResponseType = data.type || 'recommendation';
        const places =
          Array.isArray(data.places) ? data.places.slice(0, 5) : [];

        console.log('PLACES RECEIVED:', places.length, places.map((p: any) => p.name));

        if (places.length > 0) {
          const mappedPlaces = places
            .filter((p: any) => p.location?.latitude && p.location?.longitude)
            .map((p: any) => ({
              ...p,
              location: {
                latitude: p.location.latitude,
                longitude: p.location.longitude,
              },
              matchScore: p.matchScore ?? 50,
              matchReasons: p.matchReasons || [],
              socialSignals: p.socialSignals || [],
              isLoyalty: false,
              visitCount: 0,
            }));
          console.log('MAP MARKERS:', mappedPlaces.length, mappedPlaces.map((p: any) => ({ name: p.name, lat: p.location.latitude, lng: p.location.longitude })));
          if (mappedPlaces.length > 0) {
            setDiscoveryPlaces(mappedPlaces);
          }
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: data.reply || data.text || '(no response)',
            places,
          },
        ]);
      } catch (err: any) {
        console.error('CHAT ERROR:', err);
        const isNet =
          err.message?.includes('Network request failed') ||
          err.message?.includes('fetch failed');
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            content: isNet
              ? `Can't reach the backend.\n\nCheck that:\n• Backend is running (npm run dev)\n• EXPO_PUBLIC_BACKEND_URL is set correctly\n• Current: ${BACKEND_URL}`
              : `Error: ${err.message}`,
          },
        ]);
      } finally {
        setLoading(false);
        scrollToBottom();
      }
    },
    [input, loading, sessionId, setDiscoveryPlaces],
  );

  // Auto-send if opened with a query from HomeScreen
  React.useEffect(() => {
    if (params.query && !hasAutoSent.current) {
      hasAutoSent.current = true;
      send(params.query);
    }
  }, [params.query]);

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-down" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Mapai</Text>
          <View style={styles.statusDot} />
        </View>
        <TouchableOpacity style={styles.historyBtn}>
          <Ionicons name="time-outline" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="sparkles" size={32} color={Colors.brandViolet} />
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
                  >
                    <Text style={styles.suggestionText}>{s}</Text>
                    <Ionicons name="arrow-forward" size={14} color={Colors.brandBlue} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {messages.map((msg) => (
            <View key={msg.id} style={styles.messageGroup}>
              <View
                style={[
                  styles.bubble,
                  msg.role === 'user' ? styles.bubbleUser : styles.bubbleAI,
                ]}
              >
                {msg.role === 'assistant' && (
                  <View style={styles.aiLabel}>
                    <Ionicons name="sparkles" size={12} color={Colors.brandViolet} />
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
              <ActivityIndicator size="small" color={Colors.brandViolet} />
              <Text style={styles.typingText}>Mapai is thinking…</Text>
            </View>
          )}
        </ScrollView>

        {/* Input bar */}
        <View style={styles.inputBar}>
          <View style={styles.inputPill}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask about places in Boston…"
              placeholderTextColor={Colors.textTertiary}
              returnKeyType="send"
              onSubmitEditing={() => send()}
              blurOnSubmit={false}
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
                size={20}
                color={input.trim() && !loading ? '#FFFFFF' : Colors.textTertiary}
              />
            </TouchableOpacity>
          </View>
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
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 12 : 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.brandBlue,
    letterSpacing: -0.3,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  historyBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Message list
  messageList: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  messageListContent: {
    padding: 16,
    paddingBottom: 24,
    gap: 16,
  },

  // Empty state
  empty: {
    marginTop: 48,
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.brandVioletLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  suggestions: {
    width: '100%',
    gap: 8,
    marginTop: 8,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    ...Shadows.sm,
  },
  suggestionText: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: '500',
  },

  // Message group
  messageGroup: {
    gap: 8,
  },

  // Bubbles
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.brandBlue,
    borderBottomRightRadius: 6,
  },
  bubbleAI: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    ...Shadows.sm,
  },
  aiLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  aiLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.brandViolet,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  bubbleTextUser: {
    color: '#FFFFFF',
  },
  bubbleTextAI: {
    color: Colors.textPrimary,
  },

  // Place cards
  cardList: {
    gap: 6,
    paddingLeft: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    ...Shadows.sm,
  },
  cardLeft: {
    marginRight: 12,
  },
  cardIndexBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIndexText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardRight: {
    flex: 1,
    gap: 3,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  cardScore: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.brandBlue,
    marginLeft: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  chip: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  chipText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  cardReason: {
    fontSize: 12,
    color: Colors.brandViolet,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  cardAddress: {
    fontSize: 11,
    color: Colors.textTertiary,
  },

  // Typing
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  typingText: {
    fontSize: 13,
    color: Colors.textTertiary,
    fontStyle: 'italic',
  },

  // Input bar
  inputBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 8 : 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 26,
    paddingLeft: 18,
    paddingRight: 5,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    height: 38,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnOff: {
    backgroundColor: Colors.surfaceElevated,
  },
});
