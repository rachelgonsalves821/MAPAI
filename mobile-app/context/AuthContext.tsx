import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useSegments } from 'expo-router';
import apiClient from '../services/api/client';

interface User {
  id: string;
  email?: string;
  displayName?: string;
  onboardingComplete: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signIn: (token: string, userData: User) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    loadStorageData();
  }, []);

  // Protect routes based on auth and onboarding status
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboardingGroup = segments[0] === '(onboarding)';

    if (!user && !inAuthGroup) {
      // Redirect to sign-in if not logged in (fallback to dev user for now)
      // For now, we auto-gen a dev user if none exists
      signInAsDevUser();
    } else if (user && !user.onboardingComplete && !inOnboardingGroup) {
      // Redirect to onboarding if not complete
      router.replace('/(onboarding)');
    } else if (user && user.onboardingComplete && inOnboardingGroup) {
      // Redirect to home if onboarding is already complete
      router.replace('/(tabs)');
    }
  }, [user, segments, isLoading]);

  async function loadStorageData() {
    try {
      const storedUser = await AsyncStorage.getItem('user_data');
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (e) {
      console.error('Failed to load auth state', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function signInAsDevUser() {
    // In dev mode, we auto-sign-in with a test ID if no user exists
    const devUser: User = {
      id: 'dev-user-001',
      email: 'dev@mapai.app',
      displayName: 'Dev Explorer',
      onboardingComplete: false, // Force onboarding for testing if first time
    };
    await signIn('dev-token-secret', devUser);
  }

  const signIn = async (token: string, userData: User) => {
    await AsyncStorage.setItem('auth_token', token);
    await AsyncStorage.setItem('user_data', JSON.stringify(userData));
    setUser(userData);
  };

  const signOut = async () => {
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
    <AuthContext.Provider value={{ user, isLoading, signIn, signOut, updateUser }}>
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
      signOut: async () => {},
      updateUser: () => {},
    } as AuthContextType;
  }
  return context;
}
