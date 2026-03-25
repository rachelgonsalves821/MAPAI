import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#FFFFFF' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="landing" options={{ animation: 'none' }} />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="create-identity" />
      <Stack.Screen name="find-friends" />
      <Stack.Screen name="ready" />
      <Stack.Screen name="mfa-challenge" />
    </Stack>
  );
}
