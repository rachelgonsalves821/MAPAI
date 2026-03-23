/**
 * Mapai Backend — Supabase Client
 * Shared database client. Gracefully degrades when credentials are missing.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import type { Database } from './schema-types.js';

let supabaseInstance: SupabaseClient<Database> | null = null;

/**
 * Returns the Supabase client, or null if credentials are not configured.
 * Services should check for null and fall back to in-memory stores.
 */
export function getSupabase(): SupabaseClient<Database> | null {
    if (!config.supabase.url || !config.supabase.serviceRoleKey) {
        return null;
    }

    if (!supabaseInstance) {
        supabaseInstance = createClient<Database>(
            config.supabase.url,
            config.supabase.serviceRoleKey,
            {
                auth: { persistSession: false },
                db: { schema: 'public' },
            }
        );
    }

    return supabaseInstance;
}

/**
 * Returns true if a real database connection is available.
 */
export function hasDatabase(): boolean {
    return getSupabase() !== null;
}

/**
 * Anon client for user-facing requests (respects RLS).
 */
let anonInstance: SupabaseClient<Database> | null = null;

export function getAnonSupabase(): SupabaseClient<Database> | null {
    if (!config.supabase.url || !config.supabase.anonKey) {
        return null;
    }

    if (!anonInstance) {
        anonInstance = createClient<Database>(
            config.supabase.url,
            config.supabase.anonKey,
            {
                auth: { persistSession: false },
            }
        );
    }

    return anonInstance;
}
