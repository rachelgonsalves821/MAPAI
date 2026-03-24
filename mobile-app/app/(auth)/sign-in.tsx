/**
 * Mapai — Sign In Screen
 * Google OAuth via Supabase + dev guest bypass.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/context/AuthContext';
import { Colors, Typography, BorderRadius, Shadows, Spacing } from '@/constants/theme';

// Required for expo-web-browser to dismiss the browser on redirect
WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const { signInAsGuest } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    if (!supabase) {
      setError('Auth service not available. Try guest mode.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const redirectUri = Linking.createURL('auth/callback');

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUri, skipBrowserRedirect: true },
      });

      if (oauthError) throw oauthError;

      if (data.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

        if (result.type === 'cancel' || result.type === 'dismiss') {
          // User closed the browser — not an error
          setLoading(false);
          return;
        }
      }
    } catch (e: any) {
      console.error('Google sign-in error:', e);
      setError(e.message ?? 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGuestSignIn() {
    setLoading(true);
    setError(null);
    try {
      await signInAsGuest();
    } catch (e: any) {
      setError(e.message ?? 'Guest sign-in failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Logo / Wordmark */}
        <View style={styles.heroSection}>
          <Text style={styles.wordmark}>Mapai</Text>
          <Text style={styles.tagline}>Your AI-native discovery co-pilot</Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonSection}>
          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, styles.googleButton]}
            onPress={handleGoogleSignIn}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color={Colors.textOnBrand} />
            ) : (
              <Text style={styles.googleButtonText}>Sign in with Google</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.guestButton]}
            onPress={handleGuestSignIn}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.guestButtonText}>Continue as Guest (Dev)</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing['2xl'],
    justifyContent: 'center',
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 64,
  },
  wordmark: {
    fontSize: Typography.sizes['3xl'],
    fontWeight: '800',
    color: Colors.brandBlue,
    letterSpacing: -1,
    marginBottom: Spacing.sm,
  },
  tagline: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  buttonSection: {
    gap: Spacing.md,
  },
  button: {
    height: 52,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  googleButton: {
    backgroundColor: Colors.brandBlue,
  },
  googleButtonText: {
    color: Colors.textOnBrand,
    fontSize: Typography.sizes.base,
    fontWeight: '600',
  },
  guestButton: {
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.brandBlue,
  },
  guestButtonText: {
    color: Colors.brandBlue,
    fontSize: Typography.sizes.base,
    fontWeight: '600',
  },
  errorText: {
    color: Colors.error,
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  footer: {
    marginTop: 48,
    textAlign: 'center',
    fontSize: Typography.sizes.xs,
    color: Colors.textTertiary,
    lineHeight: Typography.sizes.xs * Typography.lineHeights.relaxed,
  },
});
