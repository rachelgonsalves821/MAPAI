/**
 * Mapai — ChatOverlay
 *
 * Animated bottom-sheet that sits over the full-screen map.
 *
 * Collapsed: 80px — shows CollapsedChatBar (pill input + chips)
 * Expanded : 62% screen height — shows ChatThread
 *
 * Animation: spring (damping 0.7, stiffness 300) via Reanimated
 * Map dim : uiStore.mapOpacity drives a black overlay on the map
 */

import React, { useRef, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Colors, Shadows } from '@/constants/theme';
import { useUIStore } from '@/store/uiStore';
import CollapsedChatBar from './CollapsedChatBar';
import ChatThread, { ChatThreadHandle } from './ChatThread';

// ─── Constants ───────────────────────────────────────────────

const { height: SCREEN_H } = Dimensions.get('window');

/** Height of the sheet when collapsed */
const COLLAPSED_HEIGHT = 80;
/** Height of the sheet when expanded */
const EXPANDED_HEIGHT = Math.round(SCREEN_H * 0.62);

const SPRING_CONFIG = {
  damping: 14,       // Reanimated uses absolute damping (not ratio like 0.7)
  stiffness: 300,
  overshootClamping: false,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 0.01,
} as const;

// Bottom padding so the sheet clears the home indicator on iOS
const BOTTOM_INSET = Platform.OS === 'ios' ? 34 : 16;

// ─── Props ───────────────────────────────────────────────────

interface ChatOverlayProps {
  /** Called after the sheet fully collapses, if you need to know */
  onCollapsed?: () => void;
}

// ─── Component ───────────────────────────────────────────────

export default function ChatOverlay({ onCollapsed }: ChatOverlayProps) {
  const { isChatOpen, openChat, closeChat } = useUIStore();
  const sheetHeight = useSharedValue(COLLAPSED_HEIGHT);
  const chatThreadRef = useRef<ChatThreadHandle>(null);
  const initialQueryRef = useRef<string | undefined>(undefined);

  // Sync animated height with store state
  useEffect(() => {
    if (isChatOpen) {
      sheetHeight.value = withSpring(EXPANDED_HEIGHT, SPRING_CONFIG);
    } else {
      sheetHeight.value = withSpring(
        COLLAPSED_HEIGHT,
        SPRING_CONFIG,
        (finished) => {
          if (finished && onCollapsed) runOnJS(onCollapsed)();
        },
      );
    }
  }, [isChatOpen, sheetHeight, onCollapsed]);

  const animatedSheetStyle = useAnimatedStyle(() => ({
    height: sheetHeight.value,
  }), [sheetHeight]);

  // Expand and optionally auto-send a query
  const handleFocus = useCallback(
    (query?: string) => {
      initialQueryRef.current = query;
      openChat();
      // If we already have a thread ref and there's a query, send immediately
      if (query && chatThreadRef.current) {
        chatThreadRef.current.sendMessage(query);
        initialQueryRef.current = undefined;
      }
    },
    [openChat],
  );

  const handleClose = useCallback(() => {
    closeChat();
  }, [closeChat]);

  return (
    <>
      {/* Tap-outside-to-dismiss scrim (only visible when expanded) */}
      {isChatOpen && (
        <TouchableWithoutFeedback onPress={handleClose} accessible={false}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
      )}

      {/* The sheet itself */}
      <Animated.View style={[styles.sheet, animatedSheetStyle]}>
        {/* Drag handle */}
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        {/* Content: collapsed bar OR expanded thread */}
        {isChatOpen ? (
          <ChatThread
            ref={chatThreadRef}
            onClose={handleClose}
            initialQuery={initialQueryRef.current}
          />
        ) : (
          <CollapsedChatBar onFocus={handleFocus} />
        )}
      </Animated.View>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    // Shadow on top edge
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 20,
    overflow: 'hidden',
  },

  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 2,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
  },
});
