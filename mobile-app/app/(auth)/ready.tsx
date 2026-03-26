/**
 * Mapai — Ready Screen
 * Full-screen Boston hero image with navy tint, personalized completion.
 * Blue + white brand theme per PRD §8.2.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Image,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useAuth } from '@/context/AuthContext';
import apiClient from '@/services/api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: W, height: H } = Dimensions.get('window');
const NAVY = '#1D3E91';

export default function ReadyScreen() {
  const router = useRouter();
  const { displayName, selectedFriends, complete } = useOnboardingStore();
  const { getToken, updateUser, clerkUser } = useAuth();

  const friendCount = selectedFriends.length;
  const friendSubtitle =
    friendCount === 0
      ? 'Your personalized map is ready.'
      : friendCount === 1
        ? '1 friend connected. Your map is ready.'
        : `${friendCount} friends connected. Your map is ready.`;

  const resolvedName = displayName || 'Explorer';

  async function handleOpenMap() {
    // 1. PRIMARY: Set Clerk publicMetadata — this is what the router reads
    if (clerkUser && !clerkUser.publicMetadata?.onboardingCompleted) {
      try {
        await clerkUser.update({
          publicMetadata: {
            ...clerkUser.publicMetadata,
            onboardingCompleted: true,
            onboardingCompletedAt: new Date().toISOString(),
          },
        });
      } catch (err) {
        console.error('[Ready] Clerk metadata update failed:', err);
        // Continue anyway — try backend as backup
      }
    }

    // 2. SECONDARY: Set Supabase flag via backend — for data consistency
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
      console.warn('[Ready] Backend onboarding completion failed (non-blocking):', e);
    }

    // 3. Update local state + Zustand store
    complete();
    updateUser({ onboardingComplete: true });

    // 4. Navigate — replace() clears the auth stack entirely
    router.replace('/home');
  }

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* Full-screen hero image */}
      <Image
        source={{ uri: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800&q=80' }}
        style={s.heroImage}
        resizeMode="cover"
      />
      {/* Navy gradient overlay — darker at bottom for text readability */}
      <View style={s.overlayTop} />
      <View style={s.overlayBottom} />

      {/* Back arrow */}
      <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Bottom content */}
      <View style={s.bottom}>
        {/* Checkmark */}
        <View style={s.checkWrap}>
          <Ionicons name="checkmark" size={26} color="#FFFFFF" />
        </View>

        {/* Heading */}
        <View style={s.headingRow}>
          <Text style={s.headingRegular}>Ready,</Text>
          <Text style={s.headingItalic}> {resolvedName}.</Text>
        </View>

        {/* Subtitle */}
        <Text style={s.subtitle}>{friendSubtitle}</Text>

        {/* CTA — white pill */}
        <TouchableOpacity style={s.cta} onPress={handleOpenMap} activeOpacity={0.85}>
          <Text style={s.ctaText}>Open my map</Text>
          <Ionicons name="location" size={16} color={NAVY} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: NAVY,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: W,
    height: H,
  },
  overlayTop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(29, 62, 145, 0.35)',
  },
  overlayBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: H * 0.55,
    backgroundColor: 'transparent',
    // CSS gradient fallback for web
    ...(Platform.OS === 'web' ? {
      backgroundImage: 'linear-gradient(to bottom, transparent, rgba(15, 20, 25, 0.75))',
    } as any : {}),
  },
  backBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 36,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 28,
    paddingBottom: Platform.OS === 'ios' ? 48 : 36,
  },
  checkWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
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
    fontSize: 38,
    fontWeight: '300',
    fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }),
    color: '#FFFFFF',
    lineHeight: 46,
  },
  headingItalic: {
    fontSize: 38,
    fontWeight: '300',
    fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }),
    fontStyle: 'italic',
    color: '#FFFFFF',
    lineHeight: 46,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 28,
    lineHeight: 22,
  },
  cta: {
    height: 54,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: NAVY,
  },
});
