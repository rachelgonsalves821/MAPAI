import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useSegments } from 'expo-router';
import { supabase } from '@/services/supabase';
import type { Session } from '@supabase/supabase-js';

interface User {
  id: string;
  email?: string;
  displayName?: string;
  onboardingComplete: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const IS_DEV = process.env.NODE_ENV !== 'production';

/** Extract our User shape from a Supabase session */
function userFromSession(session: Session): User {
  const supaUser = session.user;
  const meta = supaUser.user_metadata ?? {};
  return {
    id: supaUser.id,
    email: supaUser.email ?? undefined,
    displayName: meta.full_name ?? meta.name ?? supaUser.email ?? 'Explorer',
    onboardingComplete: meta.onboarding_complete ?? false,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  // ── Bootstrap: get initial session + subscribe to changes ──
  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        if (supabase) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session && isMounted) {
            setUser(userFromSession(session));
          }
        }

        // If no Supabase session AND dev mode, try loading stored dev user
        if (!supabase || !(await hasSupabaseSession())) {
          await loadDevUser(isMounted);
        }
      } catch (e) {
        console.error('Auth init error:', e);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    init();

    // Live session listener
    let subscription: { unsubscribe: () => void } | undefined;
    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
        if (!isMounted) return;
        if (session) {
          setUser(userFromSession(session));
        } else {
          setUser(null);
        }
      });
      subscription = data.subscription;
    }

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  async function hasSupabaseSession(): Promise<boolean> {
    if (!supabase) return false;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return !!session;
    } catch {
      return false;
    }
  }

  /** In dev mode, restore a previously-stored dev user from AsyncStorage */
  async function loadDevUser(isMounted: boolean) {
    if (!IS_DEV) return;
    try {
      const storedUser = await AsyncStorage.getItem('user_data');
      if (storedUser && isMounted) {
        setUser(JSON.parse(storedUser));
      }
    } catch (e) {
      console.error('Failed to load dev user:', e);
    }
  }

  // ── Route guard ──
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboardingGroup = segments[0] === '(onboarding)';

    if (!user && !inAuthGroup) {
      // No user — go to sign-in
      router.replace('/(auth)/sign-in');
    } else if (user && !user.onboardingComplete && !inOnboardingGroup) {
      router.replace('/(onboarding)');
    } else if (user && user.onboardingComplete && (inAuthGroup || inOnboardingGroup)) {
      router.replace('/home');
    }
  }, [user, segments, isLoading]);

  // ── Auth actions ──

  const signIn = async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase not initialised');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // onAuthStateChange listener will update user state
  };

  const signInWithGoogle = async () => {
    if (!supabase) throw new Error('Supabase not initialised');
    // Implemented in sign-in screen via OAuth + WebBrowser
    // This is a convenience method if called directly
    const Linking = await import('expo-linking');
    const WebBrowser = await import('expo-web-browser');

    const redirectUri = Linking.createURL('auth/callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUri, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (data.url) {
      await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
    }
  };

  const signInAsGuest = async () => {
    const devUser: User = {
      id: 'dev-user-001',
      email: 'dev@mapai.app',
      displayName: 'Dev Explorer',
      onboardingComplete: false,
    };
    await AsyncStorage.setItem('auth_token', 'dev-token-secret');
    await AsyncStorage.setItem('user_data', JSON.stringify(devUser));
    setUser(devUser);
  };

  const signOut = async () => {
    if (supabase) {
      await supabase.auth.signOut().catch(() => {});
    }
    await AsyncStorage.removeItem('auth_token');
    await AsyncStorage.removeItem('user_data');
    setUser(null);
  };

  const updateUser = (updates: Partial<User>) => {
    if (user) {
      const updated = { ...user, ...updates };
      setUser(updated);
      AsyncStorage.setItem('user_data', JSON.stringify(updated));
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, isLoading, signIn, signInWithGoogle, signInAsGuest, signOut, updateUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // Safe defaults when AuthProvider is not mounted (MVP mode / SSR pre-render)
    return {
      user: null,
      isLoading: false,
      signIn: async () => {},
      signInWithGoogle: async () => {},
      signInAsGuest: async () => {},
      signOut: async () => {},
      updateUser: () => {},
    } as AuthContextType;
  }
  return context;
}
