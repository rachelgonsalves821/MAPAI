/**
 * Mapai — Sign In Screen
 * Full-screen hero image with auth buttons on white card at bottom.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Image,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useAuth } from '@/context/AuthContext';

WebBrowser.maybeCompleteAuthSession();

// Clerk imports — wrapped safely
let useOAuth: any = null;
try {
  const clerk = require('@clerk/clerk-expo');
  useOAuth = clerk.useOAuth;
} catch {}

const ENABLED_STRATEGIES = ['oauth_google'];

function useClerkOAuth(strategy: string) {
  const isEnabled = ENABLED_STRATEGIES.includes(strategy);
  if (!useOAuth || !isEnabled) return { startOAuthFlow: null };
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useOAuth({ strategy });
}

const { width: W, height: H } = Dimensions.get('window');
const NAVY = '#1D3E91';

export default function SignInScreen() {
  const router = useRouter();
  const { updateUser } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { startOAuthFlow: startGoogle } = useClerkOAuth('oauth_google');

  async function handleGoogleSignIn() {
    if (!startGoogle) {
      setError('Google sign-in is not available.');
      return;
    }
    setLoading('google');
    setError(null);
    try {
      const { createdSessionId, setActive } = await startGoogle({
        redirectUrl: Linking.createURL('/', { scheme: 'mapai' }),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        // DO NOT navigate here — the root layout route guard will
        // detect isSignedIn=true and route to create-identity or home
        // depending on publicMetadata.onboardingCompleted.
      }
    } catch (e: any) {
      setError(e.message ?? 'Sign-in failed.');
    } finally {
      setLoading(null);
    }
  }

  function handleGuestSignIn() {
    // Set a guest user so the route guard doesn't bounce us back to landing
    updateUser({
      id: 'guest-user',
      displayName: '',
      onboardingComplete: false,
    } as any);
    router.push('/(auth)/create-identity');
  }

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      <Image
        source={{ uri: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800&q=80' }}
        style={s.heroImage}
        resizeMode="cover"
      />
      <View style={s.gradientOverlay} />

      <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
      </TouchableOpacity>

      <View style={s.brandingBlock}>
        <View style={s.wordmarkRow}>
          <View style={s.dot} />
          <Text style={s.wordmark}>MAPAI</Text>
        </View>
        <Text style={s.heroHeading}>Discover{'\n'}your city.</Text>
        <Text style={s.heroSub}>AI-powered local recommendations</Text>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Get started</Text>

        {error && <Text style={s.errorText}>{error}</Text>}

        {/* Google */}
        <TouchableOpacity
          style={s.googleBtn}
          onPress={handleGoogleSignIn}
          disabled={loading !== null}
          activeOpacity={0.85}
        >
          {loading === 'google' ? (
            <ActivityIndicator size="small" color="#111827" />
          ) : (
            <>
              <Ionicons name="logo-google" size={18} color="#EA4335" />
              <Text style={s.googleText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Guest (dev) */}
        <TouchableOpacity style={s.guestBtn} onPress={handleGuestSignIn} disabled={loading !== null}>
          <Text style={s.guestText}>Continue as Guest</Text>
        </TouchableOpacity>

        <Text style={s.footer}>By continuing, you agree to our Terms and Privacy Policy</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },
  heroImage: { ...StyleSheet.absoluteFillObject, width: W, height: H },
  gradientOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(29, 62, 145, 0.55)' },
  backBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 56 : 36, left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  brandingBlock: { position: 'absolute', top: Platform.OS === 'ios' ? 120 : 100, left: 28, right: 28 },
  wordmarkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  wordmark: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.8)', letterSpacing: 3 },
  heroHeading: { fontSize: 44, fontWeight: '300', fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }), color: '#FFFFFF', lineHeight: 52, marginBottom: 12 },
  heroSub: { fontSize: 16, color: 'rgba(255,255,255,0.75)', fontWeight: '400' },
  card: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 28, paddingBottom: Platform.OS === 'ios' ? 44 : 32, shadowColor: '#000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 20 },
  cardTitle: { fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 20 },
  errorText: { color: '#EF4444', fontSize: 13, textAlign: 'center', marginBottom: 12, backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10, overflow: 'hidden' },
  googleBtn: { height: 52, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5E7EB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10 },
  googleText: { fontSize: 15, fontWeight: '600', color: '#111827' },
  guestBtn: { height: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  guestText: { fontSize: 14, color: NAVY, fontWeight: '600' },
  footer: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', lineHeight: 18 },
});
