/**
 * Mapai — Root Layout
 * ClerkProvider → AuthProvider → Stack Navigator.
 * Route guard in AuthContext handles nav between auth and main screens.
 */

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AuthProvider } from '@/context/AuthContext';
import { useOnboardingStore } from '@/store/onboardingStore';
import { LocationService } from '@/services/LocationService';
import { useOnboardingMigration } from '@/hooks/useOnboardingMigration';

// Clerk — wrapped for web dev compatibility
let ClerkProvider: any;
let ClerkLoaded: any;
try {
  const clerk = require('@clerk/clerk-expo');
  ClerkProvider = clerk.ClerkProvider;
  ClerkLoaded = clerk.ClerkLoaded;
} catch {
  ClerkProvider = ({ children }: any) => children;
  ClerkLoaded = ({ children }: any) => children;
}

// SecureStore token cache for Clerk session persistence
let tokenCache: any;
try {
  const SecureStore = require('expo-secure-store');
  tokenCache = {
    async getToken(key: string) {
      try {
        return await SecureStore.getItemAsync(key);
      } catch {
        return null;
      }
    },
    async saveToken(key: string, value: string) {
      try {
        return await SecureStore.setItemAsync(key, value);
      } catch {
        return;
      }
    },
  };
} catch {
  tokenCache = undefined;
}

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(auth)',
};

SplashScreen.preventAutoHideAsync();

const CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || '';

/** Runs migration hooks inside the AuthProvider context */
function MigrationRunner() {
  useOnboardingMigration();
  return null;
}

export default function RootLayout() {
  useEffect(() => {
    useOnboardingStore.getState().loadFromStorage();
    LocationService.init();
    SplashScreen.hideAsync();
  }, []);

  return (
    <ClerkProvider publishableKey={CLERK_KEY} tokenCache={tokenCache}>
      <ClerkLoaded>
        <AuthProvider>
          <MigrationRunner />
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" options={{ animation: 'none' }} />
            <Stack.Screen name="home" options={{ animation: 'none' }} />
            <Stack.Screen
              name="chat"
              options={{
                animation: 'slide_from_bottom',
                presentation: 'modal',
                gestureEnabled: true,
              }}
            />
            <Stack.Screen
              name="profile"
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="chat-history"
              options={{
                animation: 'slide_from_right',
                presentation: 'modal',
              }}
            />
            <Stack.Screen
              name="place/[id]"
              options={{
                animation: 'slide_from_bottom',
                presentation: 'modal',
              }}
            />
            <Stack.Screen
              name="transport/[placeId]"
              options={{
                animation: 'slide_from_bottom',
                presentation: 'modal',
              }}
            />
            <Stack.Screen
              name="u/[username]"
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="settings"
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="social"
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="rewards"
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="planning/[id]"
              options={{
                animation: 'slide_from_bottom',
                presentation: 'modal',
              }}
            />
          </Stack>
        </AuthProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
