/**
 * Mapai — Sign In Screen
 * Full-screen hero with auth card: Google OAuth, email/password, guest.
 *
 * Clerk v2.x: uses useOAuth for native, useSignIn for web + email/password.
 * CRITICAL: WebBrowser.maybeCompleteAuthSession() must be at module level.
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
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useAuth } from '@/context/AuthContext';

// CRITICAL: Module-level call — closes the in-app browser on OAuth redirect
WebBrowser.maybeCompleteAuthSession();

// Clerk imports
let useOAuth: any = null;
let clerkUseSignIn: any = null;
let clerkUseSignUp: any = null;
let clerkUseAuth: any = null;
try {
  const clerk = require('@clerk/clerk-expo');
  useOAuth = clerk.useOAuth;
  clerkUseSignIn = clerk.useSignIn;
  clerkUseSignUp = clerk.useSignUp;
  clerkUseAuth = clerk.useAuth;
} catch {}

const { width: W, height: H } = Dimensions.get('window');
const NAVY = '#0558E8';
const IS_WEB = Platform.OS === 'web';

export default function SignInScreen() {
  const router = useRouter();
  const { updateUser } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Email/password state
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');

  // Clerk hooks — called unconditionally (React rules of hooks)
  const oauthGoogle = useOAuth ? useOAuth({ strategy: 'oauth_google' }) : { startOAuthFlow: null };
  const oauthApple = useOAuth ? useOAuth({ strategy: 'oauth_apple' }) : { startOAuthFlow: null };
  const signInHook = clerkUseSignIn ? clerkUseSignIn() : { signIn: null, setActive: null, isLoaded: false };
  const signUpHook = clerkUseSignUp ? clerkUseSignUp() : { signUp: null, setActive: null, isLoaded: false };

  // ─── Google OAuth ───
  async function handleGoogleSignIn() {
    setLoading('google');
    setError(null);
    try {
      if (IS_WEB && signInHook.signIn && signInHook.isLoaded) {
        // Web: redirect-based OAuth
        await signInHook.signIn.authenticateWithRedirect({
          strategy: 'oauth_google',
          redirectUrl: window.location.origin + '/sso-callback',
          redirectUrlComplete: window.location.origin + '/sso-callback',
        });
        return;
      }

      // Native: expo-web-browser OAuth
      if (!oauthGoogle.startOAuthFlow) {
        setError('Google sign-in is not available.');
        return;
      }
      const { createdSessionId, setActive } = await oauthGoogle.startOAuthFlow({
        redirectUrl: Linking.createURL('/', { scheme: 'mapai' }),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace('/(auth)/create-identity');
      }
    } catch (e: any) {
      if (e?.errors?.[0]?.code === 'session_exists') return;
      console.error('[SignIn] Google OAuth error:', e);
      setError(e?.errors?.[0]?.longMessage || e?.message || 'Sign-in failed.');
    } finally {
      setLoading(null);
    }
  }

  // ─── Apple OAuth ───
  async function handleAppleSignIn() {
    setLoading('apple');
    setError(null);
    try {
      if (IS_WEB && signInHook.signIn && signInHook.isLoaded) {
        await signInHook.signIn.authenticateWithRedirect({
          strategy: 'oauth_apple',
          redirectUrl: window.location.origin + '/sso-callback',
          redirectUrlComplete: window.location.origin + '/sso-callback',
        });
        return;
      }

      if (!oauthApple.startOAuthFlow) {
        setError('Apple sign-in is not available.');
        return;
      }
      const { createdSessionId, setActive } = await oauthApple.startOAuthFlow({
        redirectUrl: Linking.createURL('/', { scheme: 'mapai' }),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace('/(auth)/create-identity');
      }
    } catch (e: any) {
      if (e?.errors?.[0]?.code === 'session_exists') return;
      console.error('[SignIn] Apple OAuth error:', e);
      setError(e?.errors?.[0]?.longMessage || e?.message || 'Apple sign-in failed.');
    } finally {
      setLoading(null);
    }
  }

  // ─── Email Sign In ───
  async function handleEmailSignIn() {
    if (!signInHook.signIn || !signInHook.isLoaded) {
      setError('Sign-in not ready.');
      return;
    }
    setLoading('email');
    setError(null);
    try {
      const result = await signInHook.signIn.create({
        identifier: email,
        password,
      });
      if (result.status === 'needs_second_factor') {
        router.push('/(auth)/mfa-challenge');
        return;
      }
      if (result.status === 'complete' && result.createdSessionId) {
        await signInHook.setActive({ session: result.createdSessionId });
        router.replace('/(auth)/create-identity');
      }
    } catch (e: any) {
      console.error('[SignIn] Email sign-in error:', e);
      setError(e?.errors?.[0]?.longMessage || 'Invalid email or password.');
    } finally {
      setLoading(null);
    }
  }

  // ─── Email Sign Up ───
  async function handleEmailSignUp() {
    if (!signUpHook.signUp || !signUpHook.isLoaded) {
      setError('Sign-up not ready.');
      return;
    }
    setLoading('email');
    setError(null);
    try {
      await signUpHook.signUp.create({
        emailAddress: email,
        password,
      });
      await signUpHook.signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (e: any) {
      console.error('[SignIn] Email sign-up error:', e);
      setError(e?.errors?.[0]?.longMessage || 'Sign-up failed.');
    } finally {
      setLoading(null);
    }
  }

  // ─── Verify Email Code ───
  async function handleVerifyCode() {
    if (!signUpHook.signUp) return;
    setLoading('verify');
    setError(null);
    try {
      const result = await signUpHook.signUp.attemptEmailAddressVerification({
        code: verificationCode,
      });
      if (result.status === 'complete' && result.createdSessionId) {
        await signUpHook.setActive({ session: result.createdSessionId });
        router.replace('/(auth)/create-identity');
      }
    } catch (e: any) {
      console.error('[SignIn] Verification error:', e);
      setError(e?.errors?.[0]?.longMessage || 'Invalid code. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  // ─── Guest ───
  function handleGuestSignIn() {
    updateUser({
      id: 'guest-user',
      displayName: '',
      onboardingComplete: false,
    } as any);
    router.push('/(auth)/create-identity');
  }

  // ─── Render ───
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

          {/* Google OAuth */}
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

          {/* Apple OAuth */}
          {Platform.OS === 'ios' || IS_WEB ? (
            <TouchableOpacity
              style={s.appleBtn}
              onPress={handleAppleSignIn}
              disabled={loading !== null}
              activeOpacity={0.85}
            >
              {loading === 'apple' ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="logo-apple" size={18} color="#FFFFFF" />
                  <Text style={s.appleText}>Continue with Apple</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}

          {/* Divider */}
          <View style={s.divider}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>or</Text>
            <View style={s.dividerLine} />
          </View>

          {/* Email/password form */}
          {!showEmailForm ? (
            <TouchableOpacity onPress={() => setShowEmailForm(true)}>
              <Text style={s.emailLink}>Sign in with email</Text>
            </TouchableOpacity>
          ) : pendingVerification ? (
            /* Verification code input */
            <View style={s.formSection}>
              <Text style={s.inputLabel}>Verification code</Text>
              <Text style={s.helperText}>Check your email for a 6-digit code</Text>
              <TextInput
                style={s.input}
                placeholder="Enter code"
                placeholderTextColor="#9CA3AF"
                value={verificationCode}
                onChangeText={setVerificationCode}
                keyboardType="number-pad"
                autoFocus
              />
              <TouchableOpacity
                style={[s.submitBtn, (!verificationCode || loading === 'verify') && s.submitBtnDisabled]}
                onPress={handleVerifyCode}
                disabled={!verificationCode || loading === 'verify'}
              >
                {loading === 'verify' ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={s.submitBtnText}>Verify</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            /* Email + password form */
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
                style={[s.submitBtn, (!email || !password || loading === 'email') && s.submitBtnDisabled]}
                onPress={isSignUpMode ? handleEmailSignUp : handleEmailSignIn}
                disabled={!email || !password || loading === 'email'}
              >
                {loading === 'email' ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={s.submitBtnText}>{isSignUpMode ? 'Create Account' : 'Sign In'}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIsSignUpMode(!isSignUpMode)}>
                <Text style={s.toggleText}>
                  {isSignUpMode ? 'Already have an account? ' : "Don't have an account? "}
                  <Text style={s.toggleLink}>{isSignUpMode ? 'Sign in' : 'Sign up'}</Text>
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Guest */}
          <TouchableOpacity style={s.guestBtn} onPress={handleGuestSignIn} disabled={loading !== null}>
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
  googleBtn: { height: 52, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5E7EB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10 },
  googleText: { fontSize: 15, fontWeight: '600', color: '#111827' },
  appleBtn: { height: 52, borderRadius: 999, backgroundColor: '#000000', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 },
  appleText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  dividerLine: { flex: 1, height: 0.5, backgroundColor: '#E5E7EB' },
  dividerText: { fontSize: 13, color: '#9CA3AF', paddingHorizontal: 12 },
  emailLink: { fontSize: 15, color: NAVY, textAlign: 'center', fontWeight: '600' },
  formSection: { gap: 4 },
  inputLabel: { fontSize: 13, color: '#6B7280', marginBottom: 6, marginTop: 12 },
  helperText: { fontSize: 13, color: '#9CA3AF', marginBottom: 8 },
  input: { height: 52, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 16, fontSize: 16, backgroundColor: '#FFFFFF', color: '#111827' },
  submitBtn: { height: 52, borderRadius: 999, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  submitBtnDisabled: { backgroundColor: '#E8E5F0' },
  submitBtnText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  toggleText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginTop: 16 },
  toggleLink: { color: NAVY, fontWeight: '600' },
  guestBtn: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 12, marginBottom: 8 },
  guestText: { fontSize: 14, color: NAVY, fontWeight: '600' },
  footer: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', lineHeight: 18 },
});
