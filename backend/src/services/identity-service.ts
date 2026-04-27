/**
 * Mapai Backend — Identity Service
 * Handles user creation on first login and profile management.
 */

import { getSupabase, hasDatabase } from '../db/supabase-client.js';
import { generateUsername } from './username-service.js';

export interface MapaiUser {
  id: string;
  username: string;
  display_name: string;
  email?: string;
  avatar_url?: string;
  preferences: Record<string, any>;
  social: { friends_count: number; mutuals: number };
  onboarding_complete: boolean;
  created_at: string;
}

/**
 * Get or create a Mapai user record from a Supabase auth session.
 * Called on every authenticated request to ensure the user row exists.
 */
export async function getOrCreateUser(authUser: {
  id: string;
  email?: string;
  user_metadata?: Record<string, any>;
}): Promise<MapaiUser | null> {
  if (!hasDatabase()) {
    // Dev fallback
    return {
      id: authUser.id,
      username: 'dev_explorer_0001',
      display_name: authUser.user_metadata?.name || 'Dev Explorer',
      email: authUser.email,
      avatar_url: authUser.user_metadata?.avatar_url,
      preferences: {},
      social: { friends_count: 0, mutuals: 0 },
      onboarding_complete: false,
      created_at: new Date().toISOString(),
    };
  }

  const supabase = getSupabase()!;

  // Check if user already exists (by user_id — the auth sub, renamed from clerk_user_id)
  const { data: existing } = await (supabase
    .from('users') as any)
    .select('*')
    .eq('user_id', authUser.id)
    .maybeSingle();

  if (existing) return existing as MapaiUser;

  // Create new user with generated username
  const username = await generateUsername(authUser as any);
  const displayName =
    authUser.user_metadata?.name ||
    authUser.user_metadata?.full_name ||
    authUser.email?.split('@')[0] ||
    'Explorer';

  const { data: newUser, error } = await (supabase
    .from('users') as any)
    .insert({
      user_id: authUser.id,
      username,
      display_name: displayName,
      email: authUser.email,
      avatar_url: authUser.user_metadata?.avatar_url || null,
      preferences: {},
      social: { friends_count: 0, mutuals: 0 },
      onboarding_complete: false,
    })
    .select()
    .single();

  if (error) {
    console.error('[Identity] Failed to create user:', error);
    return null;
  }

  console.log(`[Identity] New user created: ${username} (${authUser.id})`);
  return newUser as MapaiUser;
}

/**
 * Get a user's public profile by username.
 */
export async function getPublicProfile(username: string): Promise<{
  username: string;
  display_name: string;
  avatar_url?: string;
  social: { friends_count: number; mutuals: number };
  created_at: string;
} | null> {
  if (!hasDatabase()) {
    return {
      username,
      display_name: 'Dev User',
      social: { friends_count: 0, mutuals: 0 },
      created_at: new Date().toISOString(),
    };
  }

  const supabase = getSupabase()!;
  const { data, error } = await (supabase
    .from('users') as any)
    .select('username, display_name, avatar_url, social, created_at')
    .eq('username', username)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}
