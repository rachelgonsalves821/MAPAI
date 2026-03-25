/**
 * Mapai — Ready Screen
 * Mockup 1 — full-screen warm bg, personalized completion, enter app.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useAuth } from '@/context/AuthContext';
import apiClient from '@/services/api/client';

export default function ReadyScreen() {
  const router = useRouter();
  const { displayName, selectedFriends, complete } = useOnboardingStore();
  const { getToken, updateUser } = useAuth();

  const friendCount = selectedFriends.length;
  const friendSubtitle =
    friendCount === 0
      ? 'Your map is waiting.'
      : friendCount === 1
        ? '1 friend connected. Your map is waiting.'
        : `${friendCount} friends connected. Your map is waiting.`;

  const resolvedName = displayName || 'Explorer';

  async function handleOpenMap() {
    // Mark onboarding complete via backend API
    try {
      const token = await getToken();
      await apiClient.post(
        '/v1/user/onboarding',
        {
          display_name: displayName || 'Explorer',
          username: '',
          is_onboarded: true,
          preferences: {
            cuisine_preferences: [],
            ambiance_preferences: [],
            dietary_restrictions: [],
            price_range: { min: 1, max: 3 },
          },
        },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
    } catch (e) {
      console.warn('Backend onboarding completion failed (non-blocking):', e);
    }

    complete();
    updateUser({ onboardingComplete: true });
    router.replace('/home');
  }

  return (
    <View style={styles.root}>
      {/* Warm background placeholder */}
      <View style={styles.bg} />

      {/* Gradient overlay */}
      <LinearGradient
        colors={['transparent', 'transparent', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.65)']}
        locations={[0, 0.35, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Back arrow */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Bottom content */}
      <View style={styles.bottomContent}>
        {/* Checkmark */}
        <View style={styles.checkWrap}>
          <Ionicons name="checkmark" size={28} color="#FFFFFF" />
        </View>

        {/* Heading */}
        <View style={styles.headingRow}>
          <Text style={styles.headingRegular}>Ready,</Text>
          <Text style={styles.headingItalic}> {resolvedName}.</Text>
        </View>

        {/* Subtitle */}
        <Text style={styles.subtitle}>{friendSubtitle}</Text>

        {/* CTA */}
        <TouchableOpacity style={styles.ctaButton} onPress={handleOpenMap} activeOpacity={0.85}>
          <Text style={styles.ctaText}>Open my map</Text>
          <Ionicons name="location" size={18} color="#0F1419" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#D4956A',
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#D4956A',
  },
  backButton: {
    position: 'absolute',
    top: 56,
    left: 20,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  bottomContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  checkWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  headingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  headingRegular: {
    fontSize: 36,
    fontWeight: '300',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    color: '#FFFFFF',
    lineHeight: 44,
  },
  headingItalic: {
    fontSize: 36,
    fontWeight: '300',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    fontStyle: 'italic',
    color: '#FFFFFF',
    lineHeight: 44,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 28,
    lineHeight: 22,
  },
  ctaButton: {
    height: 56,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F1419',
  },
});
