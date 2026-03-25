/**
 * Mapai — Auth Context (Clerk)
 * Provides user state, onboarding check, and route guarding.
 * Clerk handles OAuth sessions; Supabase is data-only via Clerk JWT bridge.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, useSegments } from 'expo-router';

// Clerk imports — wrapped for web/dev compatibility
let useClerkAuth: any;
let useClerkUser: any;
try {
  const clerk = require('@clerk/clerk-expo');
  useClerkAuth = clerk.useAuth;
  useClerkUser = clerk.useUser;
} catch {
  // Clerk not available (web dev, SSR) — use stubs
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
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  getToken: (options?: { template?: string }) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const IS_DEV = process.env.NODE_ENV !== 'production';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded: authLoaded, signOut: clerkSignOut, getToken } = useClerkAuth();
  const { user: clerkUser, isLoaded: userLoaded } = useClerkUser();

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  // Sync Clerk user → local user state
  useEffect(() => {
    if (!authLoaded || !userLoaded) return;

    if (isSignedIn && clerkUser) {
      const mapped: User = {
        id: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress,
        displayName: clerkUser.fullName ?? clerkUser.firstName ?? undefined,
        username: clerkUser.username ?? undefined,
        avatarUrl: clerkUser.imageUrl,
        onboardingComplete: false, // Will be checked below
      };
      setUser(mapped);
      checkOnboardingStatus(clerkUser.id, mapped);
    } else {
      // Dev guest mode
      if (IS_DEV && !isSignedIn) {
        // Don't auto-set dev user — wait for explicit guest sign-in
      }
      setUser(null);
      setOnboardingChecked(true);
      setIsLoading(false);
    }
  }, [isSignedIn, authLoaded, userLoaded, clerkUser?.id]);

  async function checkOnboardingStatus(clerkUserId: string, mappedUser: User) {
    try {
      // Try fetching profile from backend
      const token = await getToken();
      if (token) {
        const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3001';
        const res = await fetch(`${backendUrl}/v1/user/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const profile = data.data;
          if (profile) {
            mappedUser.onboardingComplete = profile.is_onboarded ?? profile.onboarding_complete ?? false;
            mappedUser.displayName = profile.display_name ?? mappedUser.displayName;
            mappedUser.username = profile.username ?? mappedUser.username;
          }
        }
      }
    } catch {
      // Backend unavailable — assume not onboarded
    }

    setUser({ ...mappedUser });
    setOnboardingChecked(true);
    setIsLoading(false);
  }

  // Route guard
  useEffect(() => {
    if (isLoading || !onboardingChecked) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user) {
      if (!inAuthGroup) {
        router.replace('/(auth)/landing');
      }
    } else if (!user.onboardingComplete) {
      // Signed in but not onboarded — allow auth flow screens
      if (!inAuthGroup) {
        router.replace('/(auth)/create-identity');
      }
    } else if (user.onboardingComplete && inAuthGroup) {
      router.replace('/home');
    }
  }, [user, segments, isLoading, onboardingChecked]);

  const handleSignOut = useCallback(async () => {
    try {
      await clerkSignOut();
    } catch {}
    setUser(null);
  }, [clerkSignOut]);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : null));
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
    } as AuthContextType;
  }
  return context;
}
