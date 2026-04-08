/**
 * Mapai — SSO Callback (Web only)
 * Clerk redirects here after Google OAuth on web.
 * Handles the token exchange and session activation.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

// CRITICAL: Close the in-app browser on redirect (matches sign-in.tsx)
WebBrowser.maybeCompleteAuthSession();

let useSignUp: any = null;
let useSignIn: any = null;
try {
  const clerk = require('@clerk/clerk-expo');
  useSignUp = clerk.useSignUp;
  useSignIn = clerk.useSignIn;
} catch {}

const MAX_RETRIES = 10;
const RETRY_INTERVAL = 500; // ms

export default function SSOCallbackScreen() {
  const router = useRouter();
  const handled = useRef(false);

  const signUpHook = useSignUp ? useSignUp() : { signUp: null, setActive: null, isLoaded: false };
  const signInHook = useSignIn ? useSignIn() : { signIn: null, setActive: null, isLoaded: false };

  useEffect(() => {
    if (!signInHook.isLoaded && !signUpHook.isLoaded) return;
    if (handled.current) return;

    let retries = 0;

    async function tryActivateSession(): Promise<boolean> {
      // Check signUp completion (new user)
      if (signUpHook.signUp?.status === 'complete' && signUpHook.signUp.createdSessionId) {
        await signUpHook.setActive({ session: signUpHook.signUp.createdSessionId });
        return true;
      }

      // Check signIn completion (existing user)
      if (signInHook.signIn?.status === 'complete' && signInHook.signIn.createdSessionId) {
        await signInHook.setActive({ session: signInHook.signIn.createdSessionId });
        return true;
      }

      return false;
    }

    async function poll() {
      try {
        const activated = await tryActivateSession();
        if (activated) {
          handled.current = true;
          router.replace('/(auth)/create-identity');
          return;
        }

        retries++;
        if (retries < MAX_RETRIES) {
          setTimeout(poll, RETRY_INTERVAL);
        } else {
          // Timeout — fall back to create-identity and let route guard sort it out
          handled.current = true;
          router.replace('/(auth)/create-identity');
        }
      } catch (err) {
        console.error('[SSO Callback] Error:', err);
        handled.current = true;
        router.replace('/(auth)/sign-in');
      }
    }

    poll();
  }, [signInHook.isLoaded, signUpHook.isLoaded, signInHook.signIn?.status, signUpHook.signUp?.status]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0558E8" />
      <Text style={styles.text}>Completing sign in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  text: {
    fontSize: 15,
    color: '#6B7280',
  },
});
