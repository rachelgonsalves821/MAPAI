/**
 * Mapai Backend — Chat Service
 * Persists chat sessions and messages to Supabase.
 * Falls back to in-memory stores when the database is not configured.
 */

import { getSupabase, hasDatabase } from '../db/supabase-client.js';

// ─── In-memory fallback stores ────────────────────────────────────────────────

interface MockSession {
    id: string;
    user_id: string;
    created_at: string;
    updated_at: string;
}

interface MockMessage {
    id: string;
    session_id: string;
    user_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata: Record<string, any>;
    created_at: string;
}

const mockSessions = new Map<string, MockSession>();
const mockMessages = new Map<string, MockMessage[]>(); // keyed by session_id
let mockSessionCounter = 1;
let mockMessageCounter = 1;

// ─── Service ─────────────────────────────────────────────────────────────────

export class ChatService {
    /**
     * Create a new chat session for the given user.
     * Returns the session ID (UUID from Supabase, or a mock ID).
     */
    async createSession(clerkUserId: string): Promise<string> {
        if (!hasDatabase()) {
            const id = `mock-session-${mockSessionCounter++}`;
            const now = new Date().toISOString();
            mockSessions.set(id, { id, user_id: clerkUserId, created_at: now, updated_at: now });
            mockMessages.set(id, []);
            console.log(`[Mock] Created chat session ${id} for user ${clerkUserId}`);
            return id;
        }

        const supabase = getSupabase()!;
        const now = new Date().toISOString();

        const { data, error } = await (supabase.from('chat_sessions') as any)
            .insert({
                user_id: clerkUserId,
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
            const id = `mock-message-${mockMessageCounter++}`;
            const now = new Date().toISOString();
            const message: MockMessage = {
                id,
                session_id: sessionId,
                user_id: clerkUserId,
                role,
                content,
                metadata,
                created_at: now,
            };
            const existing = mockMessages.get(sessionId) || [];
            existing.push(message);
            mockMessages.set(sessionId, existing);

            // Update session timestamp
            const session = mockSessions.get(sessionId);
            if (session) {
                session.updated_at = now;
            }

            console.log(`[Mock] Saved ${role} message to session ${sessionId}`);
            return;
        }

        const supabase = getSupabase()!;
        const now = new Date().toISOString();

        const { error: msgError } = await (supabase.from('chat_messages') as any).insert({
            session_id: sessionId,
            user_id: clerkUserId,
            role,
            content,
            metadata,
            created_at: now,
        });

        if (msgError) {
            throw new Error(`Failed to save message: ${msgError.message}`);
        }

        // Keep session updated_at current
        await (supabase.from('chat_sessions') as any)
            .update({ updated_at: now })
            .eq('id', sessionId);
    }

    /**
     * Retrieve all messages for a session, ordered by creation time ascending.
     */
    async getSessionHistory(sessionId: string): Promise<any[]> {
        if (!hasDatabase()) {
            const messages = mockMessages.get(sessionId) || [];
            console.log(`[Mock] Fetching ${messages.length} messages for session ${sessionId}`);
            return [...messages].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
        }

        const supabase = getSupabase()!;

        const { data, error } = await (supabase.from('chat_messages') as any)
            .select('id, role, content, metadata, created_at')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (error) {
            throw new Error(`Failed to fetch session history: ${error.message}`);
        }

        return data || [];
    }

    /**
     * List the most recent sessions for a user, newest first.
     */
    async getRecentSessions(clerkUserId: string, limit: number = 20): Promise<any[]> {
        if (!hasDatabase()) {
            const sessions = Array.from(mockSessions.values())
                .filter((s) => s.user_id === clerkUserId)
                .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
                .slice(0, limit);
            console.log(`[Mock] Fetching ${sessions.length} sessions for user ${clerkUserId}`);
            return sessions;
        }

        const supabase = getSupabase()!;

        const { data, error } = await (supabase.from('chat_sessions') as any)
            .select('id, created_at, updated_at')
            .eq('user_id', clerkUserId)
            .order('updated_at', { ascending: false })
            .limit(limit);

        if (error) {
            throw new Error(`Failed to fetch recent sessions: ${error.message}`);
        }

        return data || [];
    }
}
