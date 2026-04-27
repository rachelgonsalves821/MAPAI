/**
 * Mapai — Auth Context (Supabase)
 *
 * Supabase Auth replaces Clerk.
 * Session JWTs come from supabase.auth.getSession().
 * Onboarding status is loaded from user_profiles.is_onboarded.
 *
 * Guest mode sets a local user object that bypasses Supabase entirely.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';

interface User {
  id: string;
  email?: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  onboardingComplete: boolean;
  isGuest?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  getToken: () => Promise<string | null>;
  /** Direct access to Supabase user object */
  supabaseUser: SupabaseUser | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const GUEST_STORAGE_KEY = 'mapai_guest_user';
const ONBOARDING_COMPLETE_KEY = 'mapai_onboarding_complete';

async function loadUserProfile(userId: string, sbUser: SupabaseUser): Promise<User> {
  // Check AsyncStorage first — written by ready.tsx on successful onboarding
  // and survives app restarts even if the DB row isn't yet visible
  const localOnboarded = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY).catch(() => null);

  try {
    const { data } = await supabase
      .from('user_profiles')
      .select('display_name, username, avatar_url, is_onboarded')
      .eq('user_id', userId)
      .maybeSingle();

    return {
      id: userId,
      email: sbUser.email,
      displayName:
        data?.display_name ||
        sbUser.user_metadata?.full_name ||
        sbUser.user_metadata?.name ||
        undefined,
      username: data?.username || undefined,
      avatarUrl: data?.avatar_url || sbUser.user_metadata?.avatar_url || undefined,
      // Trust the local flag if DB row is missing — prevents bounce after onboarding
      onboardingComplete: data?.is_onboarded === true || localOnboarded === 'true',
      isGuest: false,
    };
  } catch {
    return {
      id: userId,
      email: sbUser.email,
      displayName:
        sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || undefined,
      onboardingComplete: localOnboarded === 'true',
      isGuest: false,
    };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Load initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        setSupabaseUser(session.user);
        const profile = await loadUserProfile(session.user.id, session.user);
        setUser(profile);
      } else {
        await loadGuestUser();
      }
      setIsLoading(false);
    });

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      if (session?.user) {
        setSupabaseUser(session.user);
        const profile = await loadUserProfile(session.user.id, session.user);
        // Never downgrade onboardingComplete mid-session: a TOKEN_REFRESHED event
        // can fire after the user has just finished onboarding but before the DB
        // row is visible, which would bounce them back to create-identity.
        setUser((prev) => ({
          ...profile,
          onboardingComplete: prev?.onboardingComplete === true
            ? true
            : profile.onboardingComplete,
        }));
        setIsLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setSupabaseUser(null);
        setSession(null);
        await AsyncStorage.removeItem(GUEST_STORAGE_KEY);
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadGuestUser() {
    try {
      const stored = await AsyncStorage.getItem(GUEST_STORAGE_KEY);
      if (stored) {
        setUser(JSON.parse(stored));
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }

  // ─── Route guard — runs after auth state resolves ───
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const onSSOCallback = segments[0] === 'sso-callback';

    // Don't interfere with the SSO callback — it handles its own navigation
    if (onSSOCallback) return;

    if (!user) {
      if (!inAuthGroup) {
        router.replace('/(auth)/landing');
      }
    } else if (!user.onboardingComplete) {
      if (!inAuthGroup) {
        router.replace('/(auth)/create-identity');
      } else if (segments[1] === 'landing' || segments[1] === 'sign-in') {
        router.replace('/(auth)/create-identity');
      }
    } else if (user.onboardingComplete) {
      if (inAuthGroup) {
        router.replace('/home');
      }
    }
  }, [user, segments, isLoading]);

  const handleSignOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    await AsyncStorage.removeItem(GUEST_STORAGE_KEY);
    setUser(null);
    setSupabaseUser(null);
    setSession(null);
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser((prev) => {
      const updated = prev
        ? { ...prev, ...updates }
        : ({
            id: updates.id || 'guest',
            onboardingComplete: false,
            isGuest: true,
            ...updates,
          } as User);

      if (updated.isGuest) {
        AsyncStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      }

      return updated;
    });
  }, []);

  const getToken = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session?.access_token ?? null;
    } catch {
      return null;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        signOut: handleSignOut,
        updateUser,
        getToken,
        supabaseUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    return {
      user: null,
      isLoading: false,
      signOut: async () => {},
      updateUser: () => {},
      getToken: async () => null,
      supabaseUser: null,
    } as AuthContextType;
  }
  return context;
}
