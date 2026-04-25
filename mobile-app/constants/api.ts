/**
 * Backend API base URL.
 *
 * EXPO_PUBLIC_BACKEND_URL must be set to the deployed backend URL in every
 * non-local environment:
 *
 *   • EAS builds (staging / production):
 *       eas secret:create --name EXPO_PUBLIC_BACKEND_URL \
 *                         --value "https://mapai-api.fly.dev" \
 *                         --scope project
 *
 *   • Vercel web deployment:
 *       Add EXPO_PUBLIC_BACKEND_URL=https://mapai-api.fly.dev in
 *       the Vercel project's Environment Variables settings.
 *
 * If the variable is missing the app falls back to localhost:3001, which only
 * works when the backend is running on the same machine. On a physical device
 * or any deployed environment this will cause every API call to fail with a
 * network error.
 */
const _backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;

if (!_backendUrl) {
  // Warn loudly in development so the misconfiguration is caught immediately.
  // In production builds __DEV__ is false, so this block is tree-shaken out.
  if (__DEV__) {
    console.warn(
      '[Mapai] EXPO_PUBLIC_BACKEND_URL is not set. ' +
      'API calls will target http://localhost:3001, which will fail on a ' +
      'physical device or any deployed environment. ' +
      'Set EXPO_PUBLIC_BACKEND_URL in your .env file or EAS secrets.'
    );
  }
}

export const BACKEND_URL = _backendUrl || 'http://localhost:3001';
