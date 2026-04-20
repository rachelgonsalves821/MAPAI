/**
 * Mapai — Sign In Screen
 * Email/password auth via Supabase. Guest flow preserved.
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
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/services/supabase';

const { width: W, height: H } = Dimensions.get('window');
const NAVY = '#0558E8';

export default function SignInScreen() {
  const router = useRouter();
  const { updateUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  async function handleEmailSignIn() {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // AuthContext picks up SIGNED_IN and navigates automatically
    } catch (e: any) {
      setError(e?.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSignUp() {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      setEmailSent(true);
    } catch (e: any) {
      setError(e?.message || 'Sign-up failed.');
    } finally {
      setLoading(false);
    }
  }

  function handleGuestSignIn() {
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

      <KeyboardAvoidingView
        style={s.cardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={s.card}
          contentContainerStyle={s.cardContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.cardTitle}>Get started</Text>

          {error && <Text style={s.errorText}>{error}</Text>}

          {emailSent ? (
            <View style={s.formSection}>
              <Text style={s.sentText}>
                Check your email for a confirmation link to complete sign-up.
              </Text>
              <TouchableOpacity
                onPress={() => { setEmailSent(false); setIsSignUpMode(false); }}
              >
                <Text style={s.toggleText}>
                  Back to <Text style={s.toggleLink}>sign in</Text>
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.formSection}>
              <Text style={s.inputLabel}>Email</Text>
              <TextInput
                style={s.input}
                placeholder="you@example.com"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={s.inputLabel}>Password</Text>
              <TextInput
                style={s.input}
                placeholder="••••••••"
                placeholderTextColor="#9CA3AF"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
              <TouchableOpacity
                style={[s.submitBtn, (!email || !password || loading) && s.submitBtnDisabled]}
                onPress={isSignUpMode ? handleEmailSignUp : handleEmailSignIn}
                disabled={!email || !password || loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={s.submitBtnText}>
                    {isSignUpMode ? 'Create Account' : 'Sign In'}
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setIsSignUpMode(!isSignUpMode); setError(null); }}>
                <Text style={s.toggleText}>
                  {isSignUpMode ? 'Already have an account? ' : "Don't have an account? "}
                  <Text style={s.toggleLink}>{isSignUpMode ? 'Sign in' : 'Sign up'}</Text>
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={s.guestBtn} onPress={handleGuestSignIn} disabled={loading}>
            <Text style={s.guestText}>Continue as Guest</Text>
          </TouchableOpacity>

          <Text style={s.footer}>By continuing, you agree to our Terms and Privacy Policy</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },
  heroImage: { ...StyleSheet.absoluteFillObject, width: W, height: H },
  gradientOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5, 88, 232, 0.55)' },
  backBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 56 : 36, left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  brandingBlock: { position: 'absolute', top: Platform.OS === 'ios' ? 120 : 100, left: 28, right: 28 },
  wordmarkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  wordmark: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.8)', letterSpacing: 3 },
  heroHeading: { fontSize: 44, fontWeight: '300', fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }), color: '#FFFFFF', lineHeight: 52, marginBottom: 12 },
  heroSub: { fontSize: 16, color: 'rgba(255,255,255,0.75)', fontWeight: '400' },
  cardWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: H * 0.65 },
  card: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, shadowColor: '#000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 20 },
  cardContent: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: Platform.OS === 'ios' ? 44 : 32 },
  cardTitle: { fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 20 },
  errorText: { color: '#EF4444', fontSize: 13, textAlign: 'center', marginBottom: 12, backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10, overflow: 'hidden' },
  formSection: { gap: 4 },
  inputLabel: { fontSize: 13, color: '#6B7280', marginBottom: 6, marginTop: 12 },
  input: { height: 52, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 16, fontSize: 16, backgroundColor: '#FFFFFF', color: '#111827' },
  submitBtn: { height: 52, borderRadius: 999, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  submitBtnDisabled: { backgroundColor: '#E8E5F0' },
  submitBtnText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  sentText: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  toggleText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginTop: 16 },
  toggleLink: { color: NAVY, fontWeight: '600' },
  guestBtn: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 20, marginBottom: 8 },
  guestText: { fontSize: 14, color: NAVY, fontWeight: '600' },
  footer: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', lineHeight: 18 },
});
