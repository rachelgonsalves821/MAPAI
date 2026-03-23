/**
 * Mapai — Root Layout (MVP mode)
 * Minimal setup: routes directly to the chat screen for end-to-end testing.
 * No auth, no onboarding, no navigation. Restore (tabs) routing when ready.
 */

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'chat',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
        <Stack.Screen name="chat" />
      </Stack>
    </>
  );
}
