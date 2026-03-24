/**
 * Mapai Backend — Username Generator
 * Generates unique, shareable usernames for new users.
 */

import { getSupabase, hasDatabase } from '../db/supabase-client.js';

const FALLBACK_ADJECTIVES = [
  'happy', 'chill', 'hungry', 'cozy', 'vibey',
  'sunny', 'curious', 'bold', 'swift', 'local',
];

/**
 * Generate a unique username from user metadata.
 * Format: firstname_boston_XXXX (4-digit random suffix)
 */
export async function generateUsername(user: {
  id: string;
  email?: string;
  user_metadata?: { name?: string; full_name?: string };
}): Promise<string> {
  const name =
    user.user_metadata?.name ||
    user.user_metadata?.full_name ||
    user.email?.split('@')[0] ||
    'user';

  const firstName = name.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const base = firstName || 'explorer';

  // Try up to 10 times to find a unique username
  for (let i = 0; i < 10; i++) {
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const candidate = `${base}_boston_${suffix}`;

    const isTaken = await isUsernameTaken(candidate);
    if (!isTaken) return candidate;
  }

  // Fallback: adjective + timestamp
  const adj = FALLBACK_ADJECTIVES[Math.floor(Math.random() * FALLBACK_ADJECTIVES.length)];
  return `${adj}_explorer_${Date.now().toString(36)}`;
}

async function isUsernameTaken(username: string): Promise<boolean> {
  if (!hasDatabase()) return false;

  const supabase = getSupabase()!;
  const { data } = await (supabase
    .from('users') as any)
    .select('id')
    .eq('username', username)
    .maybeSingle();

  return !!data;
}
