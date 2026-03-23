import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import ChatBubble from '@/components/ChatBubble';
import { useSendMessage } from '@/services/api/hooks';
import { ChatMessage, Place } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ query?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');

  const sendMutation = useSendMessage();

  // Handle initial query from navigation params
  useEffect(() => {
    if (params.query) {
      handleSend(params.query);
    }
  }, [params.query]);

  const handleSend = async (text?: string) => {
    const messageText = text || inputText.trim();
    if (!messageText || sendMutation.isPending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');

    try {
      const response = await sendMutation.mutateAsync({
        message: messageText,
        session_id: 'session-123',
        user_id: 'user-123',
      });

      const aiMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: response.text,
        timestamp: new Date(),
        placeResults: response.places
      };

      setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const isTyping = sendMutation.isPending;

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Premium Search Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Discovery</Text>
          <View style={styles.statusDot} />
        </View>
        <TouchableOpacity style={styles.historyButton}>
          <Ionicons name="time-outline" size={24} color="#6B7280" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        ref={scrollRef}
        style={styles.chatList}
        contentContainerStyle={styles.chatContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 && (
          <View style={styles.emptyContainer}>
            <View style={styles.sparkleIcon}>
              <Ionicons name="sparkles" size={40} color="#7C3AED" />
            </View>
            <Text style={styles.emptyText}>Ask Mapai to find the perfect spot in Boston</Text>
          </View>
        )}

        {messages.map((msg) => (
          <View key={msg.id}>
            <ChatBubble role={msg.role} content={msg.content} />
            
            {msg.placeResults && (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.placesContainer}
                contentContainerStyle={styles.placesContent}
              >
                {msg.placeResults.map((place) => (
                    <TouchableOpacity 
                      key={place.id} 
                      style={styles.placeCard}
                      onPress={() => router.push(`/place/${place.id}`)}
                    >
                      <Image 
                        source={{ uri: place.photos?.[0] || 'https://via.placeholder.com/300x200' }} 
                        style={styles.placeImage} 
                      />
                      
                      {/* Sentiment Badge */}
                      {place.socialSignals && place.socialSignals.length > 0 && (
                        <View style={styles.sentimentBadge}>
                          <Ionicons 
                            name={place.socialSignals[0].sentiment === 'positive' ? 'trending-up' : 'analytics'} 
                            size={12} 
                            color="#FFF" 
                          />
                        </View>
                      )}

                      <View style={styles.placeInfo}>
                        <Text style={styles.placeName} numberOfLines={1}>{place.name}</Text>
                        <View style={styles.scoreRow}>
                          <Text style={styles.matchScore}>{place.matchScore}% Match</Text>
                          {place.priceLevel && (
                             <Text style={styles.priceLevel}>{'• ' + '$'.repeat(place.priceLevel)}</Text>
                          )}
                        </View>
                        
                        {/* Social Signal Snippet */}
                        {place.socialSignals && place.socialSignals.length > 0 && (
                          <View style={styles.socialSnippet}>
                            <Text style={styles.socialText} numberOfLines={2}>
                              "{place.socialSignals[0].quote}"
                            </Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        ))}

        {isTyping && (
          <View style={styles.typingContainer}>
            <ActivityIndicator color={Colors.brandViolet} size="small" />
            <Text style={styles.typingText}>Mapai is thinking...</Text>
          </View>
        )}
      </ScrollView>

      {/* Modern Input Bar */}
      <View style={styles.inputContainer}>
        <View style={styles.inputPill}>
          <TextInput
            style={styles.input}
            placeholder="Search or ask..."
            placeholderTextColor={Colors.textTertiary}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={() => handleSend()}
          />
          <TouchableOpacity 
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            disabled={!inputText.trim()}
            onPress={() => handleSend()}
          >
            <Ionicons 
              name="arrow-up" 
              size={20} 
              color={inputText.trim() ? '#FFF' : Colors.textTertiary} 
            />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accentNeon,
  },
  historyButton: {
    padding: 8,
  },
  backButton: {
    padding: 8,
  },
  chatList: {
    flex: 1,
  },
  chatContent: {
    paddingVertical: 20,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
    paddingHorizontal: 40,
  },
  sparkleIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 18,
    textAlign: 'center',
    color: Colors.textSecondary,
    lineHeight: 26,
    fontWeight: '600',
  },
  placesContainer: {
    marginVertical: 10,
    paddingLeft: 16,
  },
  placesContent: {
    paddingRight: 32,
    gap: 12,
  },
  placeCard: {
    width: 200,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    ...Shadows.md,
  },
  placeImage: {
    width: '100%',
    height: 100,
    backgroundColor: Colors.surfaceElevated,
  },
  sentimentBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  placeInfo: {
    padding: 12,
  },
  placeName: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  matchScore: {
    color: Colors.brandViolet,
    fontSize: 12,
    fontWeight: '800',
  },
  priceLevel: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontWeight: '600',
  },
  socialSnippet: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  socialText: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginTop: 10,
  },
  typingText: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontStyle: 'italic',
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    backgroundColor: Colors.background,
  },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingLeft: 20,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 16,
    height: 40,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.brandViolet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: 'transparent',
  },
});
