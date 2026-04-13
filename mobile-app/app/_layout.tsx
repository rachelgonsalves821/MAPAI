/**
 * Mapai — Root Layout
 * ClerkProvider → QueryClientProvider → AuthProvider → Stack Navigator.
 * Route guard in AuthContext handles nav between auth and main screens.
 */

import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { Component, useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Platform, TouchableOpacity, StyleSheet as RNStyleSheet } from 'react-native';
import { AuthProvider } from '@/context/AuthContext';
import { useAuth } from '@/context/AuthContext';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useSurveyPrefsStore } from '@/store/surveyPrefsStore';
import { LocationService } from '@/services/LocationService';
import { useOnboardingMigration } from '@/hooks/useOnboardingMigration';
import { CrashReporting } from '@/services/CrashReporting';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setApiAuthToken } from '@/services/api/client';

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

/**
 * Wraps ClerkLoaded with a timeout fallback so the app doesn't show a blank
 * screen if Clerk takes too long to initialize on web.
 */
function ClerkLoadedOrFallback({ children }: { children: React.ReactNode }) {
  // ClerkLoaded from @clerk/clerk-expo never fires on web — bypass it
  if (Platform.OS === 'web') {
    return <>{children}</>;
  }

  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <ClerkLoaded>{children}</ClerkLoaded>
      {timedOut && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', zIndex: -1 }}>
          <ActivityIndicator size="large" color="#0558E8" />
          <Text style={{ marginTop: 16, fontSize: 15, color: '#6B7280' }}>Loading Mapai...</Text>
        </View>
      )}
    </>
  );
}

/**
 * Custom error boundary — shown when a route component crashes.
 * Branded fallback with retry button instead of a white screen.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  useEffect(() => {
    CrashReporting.captureException(error);
  }, [error]);

  return (
    <View style={ebStyles.container}>
      <Text style={ebStyles.icon}>!</Text>
      <Text style={ebStyles.title}>Something went wrong</Text>
      <Text style={ebStyles.message}>{error.message || 'An unexpected error occurred.'}</Text>
      <TouchableOpacity style={ebStyles.button} onPress={retry} activeOpacity={0.85}>
        <Text style={ebStyles.buttonText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

const ebStyles = RNStyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FEE2E2', color: '#EF4444', fontSize: 24, fontWeight: '700', textAlign: 'center', lineHeight: 48, marginBottom: 16, overflow: 'hidden' },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  message: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  button: { height: 48, paddingHorizontal: 32, borderRadius: 999, backgroundColor: '#0558E8', justifyContent: 'center', alignItems: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
});

/**
 * Class-based error boundary wrapping the entire app tree.
 * Catches errors that occur outside of route components (providers, context, etc).
 */
class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    CrashReporting.captureException(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorBoundary
          error={this.state.error || new Error('Unknown error')}
          retry={() => this.setState({ hasError: false, error: null })}
        />
      );
    }
    return this.props.children;
  }
}

export const unstable_settings = {
  initialRouteName: '(auth)',
};

SplashScreen.preventAutoHideAsync();

const CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
if (!CLERK_KEY) {
  console.error('[Config] EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is empty — Clerk will not initialize and auth will fail!');
}

// Single QueryClient instance — lives for the app lifetime.
// staleTime 0 means data is always considered stale on re-mount (good for auth transitions).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      retry: 1,
    },
  },
});

/** Runs migration hooks inside the AuthProvider context */
function MigrationRunner() {
  useOnboardingMigration();
  return null;
}

/**
 * Keeps the API client's Bearer token in sync with Clerk auth state.
 * Without this, apiClient requests go out without Authorization headers
 * and the backend returns 401.
 */
function ApiTokenSync() {
  const { user, getToken } = useAuth();

  useEffect(() => {
    if (!user?.id) {
      console.warn('[ApiTokenSync] No authenticated user — token cleared. CLERK_KEY set:', !!CLERK_KEY);
      setApiAuthToken(null);
      return;
    }

    console.log('[ApiTokenSync] User signed in:', user.id.slice(0, 8) + '... — fetching token');
    getToken()
      .then((token) => {
        if (token) {
          console.log('[ApiTokenSync] Token acquired:', token.slice(0, 20) + '...');
        } else {
          console.warn('[ApiTokenSync] getToken() returned null — requests will 401');
        }
        setApiAuthToken(token);
      })
      .catch((err) => {
        console.error('[ApiTokenSync] getToken() threw:', err?.message ?? err);
        setApiAuthToken(null);
      });

    const interval = setInterval(() => {
      getToken().then(setApiAuthToken).catch(() => setApiAuthToken(null));
    }, 50_000);

    return () => clearInterval(interval);
  }, [user?.id, getToken]);

  return null;
}

/**
 * Clears the React Query user memory cache whenever the authenticated user
 * changes (sign-in, sign-out, or account switch). This ensures the next
 * useUserMemory() call fetches fresh data for the current user instead of
 * serving a previous user's cached preferences.
 */
function MemoryCacheWatcher() {
  const { user } = useAuth();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    // undefined → not yet resolved; skip
    if (prevUserIdRef.current === undefined) {
      prevUserIdRef.current = user?.id ?? null;
      return;
    }

    // User changed (sign-out sets null; sign-in sets a new id)
    if (prevUserIdRef.current !== (user?.id ?? null)) {
      queryClient.removeQueries({ queryKey: ['user', 'memory'] });
      prevUserIdRef.current = user?.id ?? null;
    }
  }, [user?.id]);

  return null;
}

/**
 * Watches Clerk auth state and pathname inside AuthProvider context.
 * Keeps Sentry user context and screen tags in sync without touching RootLayout.
 */
function CrashReportingWatcher() {
  const { user } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (user?.id) {
      CrashReporting.setUser(user.id);
    } else {
      CrashReporting.clearUser();
    }
  }, [user?.id]);

  useEffect(() => {
    if (pathname) {
      CrashReporting.setScreen(pathname);
    }
  }, [pathname]);

  return null;
}

export default function RootLayout() {
  useEffect(() => {
    CrashReporting.init();
    useOnboardingStore.getState().loadFromStorage();
    useSurveyPrefsStore.getState().loadFromStorage();
    LocationService.init();
    SplashScreen.hideAsync();
  }, []);

  return (
    <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
    <ClerkProvider publishableKey={CLERK_KEY} tokenCache={tokenCache}>
      <ClerkLoadedOrFallback>
        <AuthProvider>
          <MigrationRunner />
          <ApiTokenSync />
          <MemoryCacheWatcher />
          <CrashReportingWatcher />
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" options={{ animation: 'none' }} />
            <Stack.Screen name="sso-callback" options={{ animation: 'none' }} />
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
            <Stack.Screen
              name="preference-detail"
              options={{
                headerShown: false,
                animation: 'slide_from_right',
                presentation: 'card',
              }}
            />
            <Stack.Screen
              name="add-friends"
              options={{
                headerShown: false,
                animation: 'slide_from_right',
              }}
            />
            <Stack.Screen
              name="friend-requests"
              options={{
                headerShown: false,
                animation: 'slide_from_right',
              }}
            />
            <Stack.Screen
              name="loved-places"
              options={{
                headerShown: false,
                animation: 'slide_from_right',
              }}
            />
            <Stack.Screen
              name="compare"
              options={{
                animation: 'slide_from_bottom',
                presentation: 'modal',
              }}
            />
          </Stack>
        </AuthProvider>
      </ClerkLoadedOrFallback>
    </ClerkProvider>
    </QueryClientProvider>
    </AppErrorBoundary>
  );
}
