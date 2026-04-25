/**
 * Mapai — Root Layout
 * QueryClientProvider → AuthProvider → Stack Navigator.
 * Route guard in AuthContext handles nav between auth and main screens.
 */

import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { Component, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet as RNStyleSheet } from 'react-native';
import { AuthProvider } from '@/context/AuthContext';
import { useAuth } from '@/context/AuthContext';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useSurveyPrefsStore } from '@/store/surveyPrefsStore';
import { LocationService } from '@/services/LocationService';
import { useOnboardingMigration } from '@/hooks/useOnboardingMigration';
import { CrashReporting } from '@/services/CrashReporting';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setApiAuthToken, setApiTokenGetter } from '@/services/api/client';
import { setUnauthorizedHandler } from '@/services/api/errorHandler';
import ApiToast from '@/components/ApiToast';

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

// Single QueryClient instance — lives for the app lifetime.
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
 * Keeps the API client's Bearer token in sync with Supabase session.
 * Uses getToken() from AuthContext which returns supabase session.access_token.
 *
 * Two-layer protection:
 *  1. setApiTokenGetter — live reference so the request interceptor can call
 *     getToken() directly for any request where _authToken hasn't been set yet.
 *  2. setApiAuthToken — caches the resolved JWT so most requests skip the await.
 */
function ApiTokenSync() {
  const { user, getToken, signOut } = useAuth();

  // Wire up the 401 handler once so the Axios interceptor can trigger a
  // sign-out when the backend rejects a token as invalid or expired.
  // Without this, a 401 is silently swallowed and the user stays stuck.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      console.warn('[Auth] 401 received — signing out and redirecting to sign-in');
      signOut();
    });
    return () => setUnauthorizedHandler(() => {});
  }, [signOut]);

  useEffect(() => {
    setApiTokenGetter(user?.id ? getToken : null);
    return () => setApiTokenGetter(null);
  }, [user?.id, getToken]);

  useEffect(() => {
    if (!user?.id) {
      setApiAuthToken(null);
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchToken = async (attempt: number = 0) => {
      if (cancelled) return;
      try {
        const token = await getToken();
        if (cancelled) return;
        if (token) {
          setApiAuthToken(token);
        } else if (attempt < 4) {
          const delay = Math.min(500 * Math.pow(2, attempt), 4000);
          retryTimer = setTimeout(() => fetchToken(attempt + 1), delay);
        } else {
          setApiAuthToken(null);
        }
      } catch {
        if (!cancelled) setApiAuthToken(null);
      }
    };

    fetchToken();

    // Refresh token periodically (Supabase auto-refreshes, but keep cache warm)
    const interval = setInterval(() => {
      getToken().then(setApiAuthToken).catch(() => setApiAuthToken(null));
    }, 50_000);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      clearInterval(interval);
    };
  }, [user?.id, getToken]);

  return null;
}

/**
 * Clears the React Query user memory cache whenever the authenticated user changes.
 */
function MemoryCacheWatcher() {
  const { user } = useAuth();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (prevUserIdRef.current === undefined) {
      prevUserIdRef.current = user?.id ?? null;
      return;
    }

    if (prevUserIdRef.current !== (user?.id ?? null)) {
      queryClient.removeQueries({ queryKey: ['user', 'memory'] });
      prevUserIdRef.current = user?.id ?? null;
    }
  }, [user?.id]);

  return null;
}

/**
 * Keeps Sentry user context and screen tags in sync with auth state.
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
      <AuthProvider>
        <MigrationRunner />
        <ApiTokenSync />
        <MemoryCacheWatcher />
        <CrashReportingWatcher />
        <StatusBar style="dark" />
        <ApiToast />
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
    </QueryClientProvider>
    </AppErrorBoundary>
  );
}
