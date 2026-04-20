/**
 * Mapai — Supabase Client
 * Single auth + data client. Supabase Auth replaces Clerk.
 * Session tokens are used as Bearer tokens for all API requests.
 */

import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Supabase client — handles both auth session management and database queries.
 *
 * Web:    session persisted in localStorage (Supabase default)
 * Native: session persisted in AsyncStorage
 *
 * detectSessionInUrl: true (web only) — Supabase auto-parses the #access_token
 * fragment after an OAuth redirect so /sso-callback just needs to wait for
 * the SIGNED_IN event.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS !== 'web' ? AsyncStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
