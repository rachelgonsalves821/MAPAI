/**
 * Mapai — Sign In Screen
 * Clerk OAuth (Google + Apple) with dev guest bypass.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

// Required for expo-web-browser to dismiss the browser on redirect
WebBrowser.maybeCompleteAuthSession();

// Clerk imports — wrapped safely so the module tree doesn't crash if
// ClerkProvider isn't wired up yet in this build variant.
let useOAuth: any = null;
let useAuth: any = null;
try {
  const clerk = require('@clerk/clerk-expo');
  useOAuth = clerk.useOAuth;
  useAuth = clerk.useAuth;
} catch {
  // Clerk not available — dev guest mode only
}

function useClerkOAuth(strategy: string) {
  if (useOAuth) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useOAuth({ strategy });
  }
  return { startOAuthFlow: null };
}

export default function SignInScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { startOAuthFlow: startGoogle } = useClerkOAuth('oauth_google');
  const { startOAuthFlow: startApple } = useClerkOAuth('oauth_apple');

  async function handleGoogleSignIn() {
    if (!startGoogle) {
      setError('Google sign-in is not available in this build.');
      return;
    }
    setLoading('google');
    setError(null);
    try {
      const { createdSessionId, setActive } = await startGoogle({
        redirectUrl: Linking.createURL('/(auth)/create-identity', { scheme: 'mapai' }),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
      router.push('/(auth)/create-identity');
    } catch (e: any) {
      console.error('Google OAuth error:', e);
      setError(e.message ?? 'Sign-in failed. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  async function handleAppleSignIn() {
    if (!startApple) {
      setError('Apple sign-in is not available in this build.');
      return;
    }
    setLoading('apple');
    setError(null);
    try {
      const { createdSessionId, setActive } = await startApple({
        redirectUrl: Linking.createURL('/(auth)/create-identity', { scheme: 'mapai' }),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
      router.push('/(auth)/create-identity');
    } catch (e: any) {
      console.error('Apple OAuth error:', e);
      setError(e.message ?? 'Sign-in failed. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  function handleGuestSignIn() {
    router.push('/(auth)/create-identity');
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Back arrow */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <ChevronLeft size={24} color="#111827" />
      </TouchableOpacity>

      <View style={styles.content}>
        {/* Heading */}
        <Text style={styles.heading}>Welcome to Mapai</Text>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Google button */}
        <TouchableOpacity
          style={styles.googleButton}
          onPress={handleGoogleSignIn}
          disabled={loading !== null}
          activeOpacity={0.85}
        >
          {loading === 'google' ? (
            <ActivityIndicator size="small" color="#111827" />
          ) : (
            <>
              <Ionicons name="logo-google" size={20} color="#EA4335" />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Apple button */}
        <TouchableOpacity
          style={styles.appleButton}
          onPress={handleAppleSignIn}
          disabled={loading !== null}
          activeOpacity={0.85}
        >
          {loading === 'apple' ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
              <Text style={styles.appleButtonText}>Continue with Apple</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Dev guest button */}
        <TouchableOpacity
          style={styles.guestButton}
          onPress={handleGuestSignIn}
          disabled={loading !== null}
          activeOpacity={0.8}
        >
          <Text style={styles.guestButtonText}>Continue as Guest (Dev)</Text>
        </TouchableOpacity>

        {/* Footer */}
        <Text style={styles.footer}>
          By continuing, you agree to our Terms and Privacy Policy
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
    marginTop: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  heading: {
    fontSize: 28,
    fontWeight: '300',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    color: '#111827',
    textAlign: 'center',
    marginBottom: 40,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  googleButton: {
    height: 56,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  appleButton: {
    height: 56,
    borderRadius: 999,
    backgroundColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },
  appleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  guestButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 32,
  },
  guestButtonText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  footer: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
});
