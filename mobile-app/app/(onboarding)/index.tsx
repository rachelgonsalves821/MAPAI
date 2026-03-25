/**
 * DEPRECATED — moved to app/(auth)/landing.tsx
 * Redirect to the new auth flow landing screen.
 */
import { Redirect } from 'expo-router';
export default function DeprecatedIndex() {
  return <Redirect href="/(auth)/landing" />;
}
