/**
 * Mapai Backend — User Search Service
 *
 * Single canonical implementation for searching users.  Both the
 * /v1/users/search and /v1/social/search endpoints delegate here so
 * that all searches target the same table (user_profiles) with the
 * same query strategy:
 *
 *   username  — prefix  match  (ILIKE query%)
 *   display_name — contains match (ILIKE %query%)
 *
 * Returned records are normalised so that the `id` field always holds
 * the Clerk user-id (clerk_user_id column), which is the canonical
 * user identifier throughout the app.
 */

import { getSupabase, hasDatabase } from '../db/supabase-client.js';

export interface SearchedUser {
    /** Clerk subject claim — the canonical user identifier. */
    id: string;
    display_name: string;
    username: string;
    avatar_url: string | null;
}

/** Static mock results returned when no database is configured. */
const MOCK_USERS: SearchedUser[] = [
    { id: 'dev-user-002', display_name: 'Alex Chen',  username: 'alexchen', avatar_url: null },
    { id: 'dev-user-003', display_name: 'Maya Lin',   username: 'mayalin',  avatar_url: null },
    { id: 'dev-user-004', display_name: 'Sam Park',   username: 'sampark',  avatar_url: null },
];

/**
 * Search `user_profiles` for users matching `query`.
 *
 * @param query    Raw search string (caller must ensure length >= 2).
 * @param callerId Clerk user-id of the requesting user; excluded from results.
 * @param limit    Maximum number of results (default 20).
 */
export async function searchUsers(
    query: string,
    callerId: string,
    limit = 20,
): Promise<SearchedUser[]> {
    if (!hasDatabase()) {
        const q = query.toLowerCase();
        return MOCK_USERS.filter(
            (u) =>
                u.id !== callerId &&
                (u.username.startsWith(q) ||
                    u.display_name.toLowerCase().includes(q)),
        ).slice(0, limit);
    }

    const supabase = getSupabase()!;

    const { data, error } = await (supabase.from('user_profiles') as any)
        .select('clerk_user_id, display_name, username, avatar_url')
        // username prefix-match OR display_name contains-match
        // Sanitize query to prevent PostgREST filter injection
        .or(`username.ilike.${query.replace(/[,%()]/g, '')}%,display_name.ilike.%${query.replace(/[,%()]/g, '')}%`)
        .neq('clerk_user_id', callerId)
        .limit(limit);

    if (error) {
        throw error;
    }

    // Normalise: surface clerk_user_id as `id` for the response shape
    // expected by the mobile app (SocialUser.id).
    return (data ?? []).map((row: any) => ({
        id:           row.clerk_user_id,
        display_name: row.display_name,
        username:     row.username,
        avatar_url:   row.avatar_url ?? null,
    }));
}
