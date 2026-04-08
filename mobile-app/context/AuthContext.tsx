/**
 * Mapai — Auth Context (Clerk)
 *
 * Routing logic uses Clerk's publicMetadata.onboardingCompleted —
 * this is SYNCHRONOUS once Clerk loads, no DB call needed.
 *
 * Guest mode sets a local user object that bypasses Clerk entirely.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Clerk imports — wrapped for web/dev compatibility
let useClerkAuth: any;
let useClerkUser: any;
try {
  const clerk = require('@clerk/clerk-expo');
  useClerkAuth = clerk.useAuth;
  useClerkUser = clerk.useUser;
} catch {
  useClerkAuth = () => ({ isSignedIn: false, isLoaded: true, signOut: async () => {}, getToken: async () => null });
  useClerkUser = () => ({ user: null, isLoaded: true });
}

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
  getToken: (options?: { template?: string }) => Promise<string | null>;
  /** Direct access to Clerk user object for publicMetadata updates */
  clerkUser: any;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const GUEST_STORAGE_KEY = 'mapai_guest_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded: authLoaded, signOut: clerkSignOut, getToken } = useClerkAuth();
  const { user: clerkUser, isLoaded: userLoaded } = useClerkUser();

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  // ─── Sync Clerk user → local state (NO async DB call) ───
  useEffect(() => {
    if (!authLoaded || !userLoaded) return;

    if (isSignedIn && clerkUser) {
      // Read onboarding status from Clerk publicMetadata — SYNCHRONOUS
      const onboardingComplete = clerkUser.publicMetadata?.onboardingCompleted === true;

      setUser({
        id: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress,
        displayName: clerkUser.fullName ?? clerkUser.firstName ?? undefined,
        username: clerkUser.username ?? undefined,
        avatarUrl: clerkUser.imageUrl,
        onboardingComplete,
        isGuest: false,
      });
      setIsLoading(false);
    } else {
      // Not signed in with Clerk — check for guest user
      loadGuestUser();
    }
  }, [isSignedIn, authLoaded, userLoaded, clerkUser?.id, clerkUser?.publicMetadata?.onboardingCompleted]);

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
    setIsLoading(false);
  }

  // ─── Route guard — SYNCHRONOUS, no DB calls ───
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const onSSOCallback = segments[0] === 'sso-callback';

    // Don't interfere with the SSO callback — it handles its own navigation
    if (onSSOCallback) return;

    if (!user) {
      // No user → go to landing (only if not already there)
      if (!inAuthGroup) {
        router.replace('/(auth)/landing');
      }
    } else if (!user.onboardingComplete) {
      // User exists but not onboarded → ensure they're on an onboarding screen
      if (!inAuthGroup) {
        router.replace('/(auth)/create-identity');
      } else if (segments[1] === 'landing' || segments[1] === 'sign-in') {
        // Stuck on landing/sign-in after OAuth — push forward
        router.replace('/(auth)/create-identity');
      }
    } else if (user.onboardingComplete) {
      // Onboarded → go to home (redirect away from auth screens)
      if (inAuthGroup) {
        router.replace('/home');
      }
    }
  }, [user, segments, isLoading]);

  const handleSignOut = useCallback(async () => {
    try {
      await clerkSignOut();
    } catch {}
    await AsyncStorage.removeItem(GUEST_STORAGE_KEY);
    setUser(null);
  }, [clerkSignOut]);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser((prev) => {
      const updated = prev
        ? { ...prev, ...updates }
        : { id: updates.id || 'guest', onboardingComplete: false, isGuest: true, ...updates } as User;

      // Persist guest users to AsyncStorage
      if (updated.isGuest) {
        AsyncStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      }

      return updated;
    });
  }, []);

  const handleGetToken = useCallback(
    async (options?: { template?: string }) => {
      try {
        return await getToken(options);
      } catch {
        return null;
      }
    },
    [getToken]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        signOut: handleSignOut,
        updateUser,
        getToken: handleGetToken,
        clerkUser,
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
      clerkUser: null,
    } as AuthContextType;
  }
  return context;
}
