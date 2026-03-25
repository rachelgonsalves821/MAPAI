/**
 * Mapai — Supabase Client (Data Only)
 * Clerk handles authentication. Supabase is used ONLY for database queries.
 * The client uses the anon key — RLS policies validate Clerk JWTs.
 *
 * For authenticated queries that need RLS, use useSupabaseClient() hook
 * which injects the Clerk JWT into the Authorization header.
 */

import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Guard: skip during Expo Router SSR pre-rendering and when env vars aren't set.
const canInit = supabaseUrl && typeof window !== 'undefined';

/**
 * Basic Supabase client with anon key — for public reads.
 * Does NOT include auth session management (Clerk handles that now).
 */
export const supabase: SupabaseClient | null = canInit
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

/**
 * Create a Supabase client that injects a Clerk JWT for RLS-protected queries.
 * Call this inside React components where you have access to Clerk's getToken.
 */
export function createClerkSupabaseClient(getToken: () => Promise<string | null>): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: async (url: RequestInfo | URL, options: RequestInit = {}) => {
        const clerkToken = await getToken();
        const headers = new Headers(options.headers);
        if (clerkToken) {
          headers.set('Authorization', `Bearer ${clerkToken}`);
        }
        return fetch(url, { ...options, headers });
      },
    },
  });
}
