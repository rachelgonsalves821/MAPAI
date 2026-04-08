/**
 * Mapai Backend — Chat Service
 * Persists chat sessions and messages to Supabase.
 * Requires a Supabase database connection — configure SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY in your .env to enable chat history persistence.
 */

import { getSupabase, hasDatabase } from '../db/supabase-client.js';

export class ChatService {
    /**
     * Create a new chat session for the given user.
     * Returns the session ID (UUID from Supabase).
     */
    async createSession(clerkUserId: string): Promise<string> {
        if (!hasDatabase()) {
            console.warn('[ChatService] No database — returning empty session ID for createSession (configure Supabase to persist chat sessions)');
            return '';
        }

        const supabase = getSupabase()!;
        const now = new Date().toISOString();

        const { data, error } = await (supabase.from('chat_sessions') as any)
            .insert({
                clerk_user_id: clerkUserId,
                created_at: now,
                updated_at: now,
            })
            .select('id')
            .single();

        if (error) {
            throw new Error(`Failed to create chat session: ${error.message}`);
        }

        return data.id as string;
    }

    /**
     * Persist a single message to the given session.
     * Increments the session message_count and updates updated_at.
     * On the first user message, auto-sets the session title from content.
     */
    async saveMessage(params: {
        sessionId: string;
        clerkUserId: string;
        role: 'user' | 'assistant' | 'system';
        content: string;
        metadata?: Record<string, any>;
    }): Promise<void> {
        const { sessionId, clerkUserId, role, content, metadata = {} } = params;

        if (!hasDatabase()) {
            console.warn('[ChatService] No database — saveMessage is a no-op (configure Supabase to persist chat messages)');
            return;
        }

        const supabase = getSupabase()!;
        const now = new Date().toISOString();

        const { error: msgError } = await (supabase.from('chat_messages') as any).insert({
            session_id: sessionId,
            clerk_user_id: clerkUserId,
            role,
            content,
            metadata,
            created_at: now,
        });

        if (msgError) {
            throw new Error(`Failed to save message: ${msgError.message}`);
        }

        // Fetch current session to check whether title needs to be set
        const { data: sessionData } = await (supabase.from('chat_sessions') as any)
            .select('title, message_count')
            .eq('id', sessionId)
            .single();

        const isFirstUserMessage =
            role === 'user' &&
            (sessionData?.title === null || sessionData?.title === undefined);

        const sessionUpdate: Record<string, any> = {
            updated_at: now,
            message_count: ((sessionData?.message_count as number) || 0) + 1,
        };

        if (isFirstUserMessage) {
            sessionUpdate.title = content.slice(0, 60);
        }

        await (supabase.from('chat_sessions') as any)
            .update(sessionUpdate)
            .eq('id', sessionId);
    }

    /**
     * Retrieve all messages for a session, ordered by creation time ascending.
     * Also selects clerk_user_id for ownership verification by callers.
     */
    async getSessionHistory(sessionId: string): Promise<any[]> {
        if (!hasDatabase()) {
            console.warn('[ChatService] No database — returning empty array for getSessionHistory (configure Supabase to read chat history)');
            return [];
        }

        const supabase = getSupabase()!;

        const { data, error } = await (supabase.from('chat_messages') as any)
            .select('id, role, content, metadata, clerk_user_id, created_at')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            throw new Error(`Failed to fetch session history: ${error.message}`);
        }

        // Re-sort ascending after fetching the latest 20 in descending order
        return (data || []).reverse();
    }

    /**
     * List the most recent sessions for a user, newest first.
     * Only returns sessions updated within the last 30 days.
     * When `q` is provided, searches across title, summary, and message content
     * (full-text ILIKE) and returns matching sessions without the 30-day window.
     */
    async getRecentSessions(clerkUserId: string, limit: number = 20, q?: string): Promise<any[]> {
        if (!hasDatabase()) {
            console.warn('[ChatService] No database — returning empty array for getRecentSessions (configure Supabase to read chat sessions)');
            return [];
        }

        const supabase = getSupabase()!;

        // ── Search path ────────────────────────────────────────────────────────
        if (q && q.trim()) {
            return this.searchSessions(clerkUserId, q.trim(), limit);
        }

        // ── Default recent-sessions path ───────────────────────────────────────
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const { data, error } = await (supabase.from('chat_sessions') as any)
            .select('id, title, summary, message_count, created_at, updated_at')
            .eq('clerk_user_id', clerkUserId)
            .gte('updated_at', thirtyDaysAgo)
            .order('updated_at', { ascending: false })
            .limit(limit);

        if (error) {
            throw new Error(`Failed to fetch recent sessions: ${error.message}`);
        }

        return data || [];
    }

    /**
     * Search a user's sessions by keyword.
     * Matches against title and summary on the session, and against the content
     * of any message belonging to that session. Results are deduplicated and
     * returned newest-first.
     */
    async searchSessions(clerkUserId: string, q: string, limit: number = 50): Promise<any[]> {
        if (!hasDatabase()) {
            console.warn('[ChatService] No database — returning empty array for searchSessions (configure Supabase to search chat sessions)');
            return [];
        }

        const supabase = getSupabase()!;
        const pattern = `%${q}%`;

        // Sessions whose title or summary match the query
        const { data: sessionMatches, error: sessionError } = await (supabase.from('chat_sessions') as any)
            .select('id, title, summary, message_count, created_at, updated_at')
            .eq('clerk_user_id', clerkUserId)
            .or(`title.ilike.${pattern},summary.ilike.${pattern}`)
            .order('updated_at', { ascending: false })
            .limit(limit);

        if (sessionError) {
            throw new Error(`Failed to search sessions: ${sessionError.message}`);
        }

        // Sessions that contain a message matching the query
        const { data: messageMatches, error: messageError } = await (supabase.from('chat_messages') as any)
            .select('session_id')
            .eq('clerk_user_id', clerkUserId)
            .ilike('content', pattern)
            .limit(limit);

        if (messageError) {
            throw new Error(`Failed to search messages: ${messageError.message}`);
        }

        // Collect unique session IDs from message matches that aren't already in sessionMatches
        const sessionMatchIds = new Set<string>((sessionMatches || []).map((s: any) => s.id));
        const extraSessionIds = [
            ...new Set<string>((messageMatches || []).map((m: any) => m.session_id as string)),
        ].filter((id) => !sessionMatchIds.has(id));

        let extraSessions: any[] = [];
        if (extraSessionIds.length > 0) {
            const { data: extras, error: extrasError } = await (supabase.from('chat_sessions') as any)
                .select('id, title, summary, message_count, created_at, updated_at')
                .eq('clerk_user_id', clerkUserId)
                .in('id', extraSessionIds)
                .order('updated_at', { ascending: false });

            if (extrasError) {
                throw new Error(`Failed to fetch sessions for message matches: ${extrasError.message}`);
            }
            extraSessions = extras || [];
        }

        // Merge, deduplicate, and sort newest-first
        const all = [...(sessionMatches || []), ...extraSessions];
        all.sort(
            (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );

        return all.slice(0, limit);
    }

    /**
     * Delete a session owned by clerkUserId.
     * Messages are cascade-deleted by the database foreign key constraint.
     */
    async deleteSession(sessionId: string, clerkUserId: string): Promise<void> {
        if (!hasDatabase()) {
            console.warn('[ChatService] No database — deleteSession is a no-op (configure Supabase to delete chat sessions)');
            return;
        }

        const supabase = getSupabase()!;

        const { error } = await (supabase.from('chat_sessions') as any)
            .delete()
            .eq('id', sessionId)
            .eq('clerk_user_id', clerkUserId);

        if (error) {
            throw new Error(`Failed to delete session: ${error.message}`);
        }
    }

    /**
     * Update the title and/or summary of a session owned by clerkUserId.
     */
    async updateSession(
        sessionId: string,
        clerkUserId: string,
        updates: { title?: string; summary?: string }
    ): Promise<void> {
        if (!hasDatabase()) {
            console.warn('[ChatService] No database — updateSession is a no-op (configure Supabase to update chat sessions)');
            return;
        }

        const supabase = getSupabase()!;

        const payload: Record<string, any> = { updated_at: new Date().toISOString() };
        if (updates.title !== undefined) payload.title = updates.title;
        if (updates.summary !== undefined) payload.summary = updates.summary;

        const { error } = await (supabase.from('chat_sessions') as any)
            .update(payload)
            .eq('id', sessionId)
            .eq('clerk_user_id', clerkUserId);

        if (error) {
            throw new Error(`Failed to update session: ${error.message}`);
        }
    }

    /**
     * Return a session's metadata together with its full message history.
     * Verifies ownership via clerk_user_id. Returns null when the session
     * does not exist or belongs to a different user.
     */
    async getSessionWithMessages(
        sessionId: string,
        clerkUserId: string
    ): Promise<{ session: any; messages: any[] } | null> {
        if (!hasDatabase()) {
            console.warn('[ChatService] No database — returning null for getSessionWithMessages (configure Supabase to read chat sessions)');
            return null;
        }

        const supabase = getSupabase()!;

        const { data: sessionData, error: sessionError } = await (
            supabase.from('chat_sessions') as any
        )
            .select('id, title, summary, message_count, clerk_user_id, created_at, updated_at')
            .eq('id', sessionId)
            .single();

        if (sessionError || !sessionData) return null;
        if (sessionData.clerk_user_id !== clerkUserId) return null;

        const { data: messages, error: msgError } = await (supabase.from('chat_messages') as any)
            .select('id, role, content, metadata, clerk_user_id, created_at')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (msgError) {
            throw new Error(`Failed to fetch messages for session: ${msgError.message}`);
        }

        return { session: sessionData, messages: messages || [] };
    }
}
