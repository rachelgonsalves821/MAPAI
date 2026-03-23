import React from 'react';
import { StyleSheet, View, Text, Animated } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

interface ChatBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export default function ChatBubble({ role, content, isStreaming }: ChatBubbleProps) {
  const isAI = role === 'assistant';

  return (
    <View style={[styles.container, isAI ? styles.containerAI : styles.containerUser]}>
      <View style={[
        styles.bubble,
        isAI ? styles.bubbleAI : styles.bubbleUser,
      ]}>
        <Text style={[
          styles.text,
          isAI ? styles.textAI : styles.textUser
        ]}>
          {content}
        </Text>
        {isStreaming && (
          <View style={styles.dotContainer}>
            <View style={styles.streamingDot} />
            <View style={styles.streamingDot} />
            <View style={styles.streamingDot} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  containerAI: {
    alignItems: 'flex-start',
  },
  containerUser: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '85%',
    padding: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  bubbleAI: {
    backgroundColor: '#F0F6FF', // Mist
    borderLeftWidth: 3,
    borderLeftColor: '#7C3AED', // AI Violet
    borderTopLeftRadius: 0,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  bubbleUser: {
    backgroundColor: '#0558E8', // Electric Blue
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 0,
  },
  text: {
    fontSize: 15, // Body Default per brand guide
    lineHeight: 22,
    fontWeight: '400',
  },
  textAI: {
    color: '#111827', // Ink (Primary Text)
  },
  textUser: {
    color: '#FFFFFF',
  },
  dotContainer: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 4,
  },
  streamingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textSecondary,
    opacity: 0.5,
  },
});
