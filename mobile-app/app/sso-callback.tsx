/**
 * Mapai — SSO Callback (Web only)
 * Supabase redirects here after Google/Apple OAuth on web.
 * detectSessionInUrl: true (set in supabase client) auto-parses the
 * #access_token fragment — we just wait for the SIGNED_IN event.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/services/supabase';

// CRITICAL: Close the in-app browser on redirect
WebBrowser.maybeCompleteAuthSession();

export default function SSOCallbackScreen() {
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (handled.current) return;
      if (event === 'SIGNED_IN' && session) {
        handled.current = true;
        router.replace('/(auth)/create-identity');
      } else if (event === 'SIGNED_OUT') {
        handled.current = true;
        router.replace('/(auth)/sign-in');
      }
    });

    // Fallback: if Supabase already has a session when this page mounts
    // (e.g. fast redirect), navigate immediately.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (handled.current) return;
      if (session) {
        handled.current = true;
        router.replace('/(auth)/create-identity');
      }
    });

    // Timeout fallback — if no event fires, push forward and let route guard decide
    const timer = setTimeout(() => {
      if (!handled.current) {
        handled.current = true;
        router.replace('/(auth)/create-identity');
      }
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

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
