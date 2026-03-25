/**
 * DEPRECATED — moved to app/(auth)/ready.tsx
 */
import { Redirect } from 'expo-router';
export default function DeprecatedComplete() {
  return <Redirect href="/(auth)/ready" />;
}
