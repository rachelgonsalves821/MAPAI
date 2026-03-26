/**
 * Mapai — SSO Callback (Web only)
 * Clerk redirects here after Google OAuth on web.
 * Handles the token exchange and session activation.
 */

import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

let useSignUp: any = null;
let useSignIn: any = null;
try {
  const clerk = require('@clerk/clerk-expo');
  useSignUp = clerk.useSignUp;
  useSignIn = clerk.useSignIn;
} catch {}

export default function SSOCallbackScreen() {
  const router = useRouter();

  const signUpHook = useSignUp ? useSignUp() : { signUp: null, setActive: null, isLoaded: false };
  const signInHook = useSignIn ? useSignIn() : { signIn: null, setActive: null, isLoaded: false };

  useEffect(() => {
    async function handleCallback() {
      try {
        // Check if we have a signUp that needs completion
        if (signUpHook.signUp?.status === 'complete' && signUpHook.signUp.createdSessionId) {
          await signUpHook.setActive({ session: signUpHook.signUp.createdSessionId });
          return; // Route guard handles navigation
        }

        // Check if we have a signIn that needs completion
        if (signInHook.signIn?.status === 'complete' && signInHook.signIn.createdSessionId) {
          await signInHook.setActive({ session: signInHook.signIn.createdSessionId });
          return; // Route guard handles navigation
        }

        // If nothing is ready yet, the Clerk provider will handle it
        // via the onAuthStateChange equivalent
      } catch (err) {
        console.error('[SSO Callback] Error:', err);
        router.replace('/(auth)/sign-in');
      }
    }

    if (signInHook.isLoaded || signUpHook.isLoaded) {
      handleCallback();
    }
  }, [signInHook.isLoaded, signUpHook.isLoaded]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#1D3E91" />
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
