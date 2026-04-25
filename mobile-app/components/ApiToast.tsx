/**
 * ApiToast — lightweight toast overlay that subscribes to apiErrorEvents.
 *
 * Mount this once inside the root layout (inside QueryClientProvider).
 * It listens for toast events emitted by the API error handler and
 * displays a brief animated notification at the bottom of the screen.
 *
 * Works on both React Native (Hermes) and Expo web.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  Platform,
  SafeAreaView,
} from 'react-native';
import { apiErrorEvents, ErrorToast } from '@/services/api/errorHandler';

const TOAST_DURATION_MS = 3500;
const FADE_DURATION_MS = 300;

export default function ApiToast() {
  const [toast, setToast] = useState<ErrorToast | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = apiErrorEvents.on('toast', (incoming) => {
      // Cancel any pending hide timer
      if (timerRef.current) clearTimeout(timerRef.current);

      setToast(incoming);

      // Fade in
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_DURATION_MS,
        useNativeDriver: true,
      }).start();

      // Auto-hide after duration
      timerRef.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: FADE_DURATION_MS,
          useNativeDriver: true,
        }).start(() => setToast(null));
      }, TOAST_DURATION_MS);
    });

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [opacity]);

  if (!toast) return null;

  const bgColor =
    toast.type === 'error'
      ? '#DC2626'
      : toast.type === 'warning'
      ? '#D97706'
      : '#2563EB';

  return (
    <Animated.View style={[styles.wrapper, { opacity }]} pointerEvents="none">
      <SafeAreaView>
        <View style={[styles.toast, { backgroundColor: bgColor }]}>
          <Text style={styles.text} numberOfLines={3}>
            {toast.message}
          </Text>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: Platform.OS === 'web' ? 32 : 16,
    left: 16,
    right: 16,
    zIndex: 9999,
    // Ensure it floats above all other content
    elevation: 9999,
  },
  toast: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
});
