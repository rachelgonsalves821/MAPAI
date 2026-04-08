/**
 * Mapai Backend — Planning Service
 * Collaborative trip planning: sessions, suggestions, votes, messages.
 * Uses Supabase when available, in-memory fallback otherwise.
 */

import { getSupabase, hasDatabase } from '../db/supabase-client.js';

// ─── In-memory fallback stores ────────────────────────────────

const inMemorySessions     = new Map<string, any>();
const inMemoryMembers      = new Map<string, any[]>();   // key: sessionId
const inMemorySuggestions  = new Map<string, any[]>();   // key: sessionId
const inMemoryVotes        = new Map<string, any[]>();   // key: sessionId
const inMemoryMessages     = new Map<string, any[]>();   // key: sessionId

function genId(): string {
    return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Types ────────────────────────────────────────────────────

export interface SuggestionInput {
    place_id: string;
    place_name: string;
    place_address?: string;
    place_location?: Record<string, any>;
    note?: string;
}

// ─── Service ─────────────────────────────────────────────────

export class PlanningService {

    // ── Create Session ───────────────────────────────────────

    async createSession(creatorId: string, title: string, friendIds: string[]): Promise<any> {
        // Enforce max 10 total members (creator + friends)
        const allMemberIds = [creatorId, ...friendIds.filter(id => id !== creatorId)];
        if (allMemberIds.length > 10) {
            throw new Error('Session cannot have more than 10 members');
        }

        if (!hasDatabase()) {
            const sessionId = genId();
            const session = {
                id: sessionId,
                creator_id: creatorId,
                title,
                status: 'active',
                decided_place_id: null,
                decided_at: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            inMemorySessions.set(sessionId, session);

            const members: any[] = allMemberIds.map((uid) => ({
                id: genId(),
                session_id: sessionId,
                user_id: uid,
                role: uid === creatorId ? 'creator' : 'member',
                joined_at: new Date().toISOString(),
            }));
            inMemoryMembers.set(sessionId, members);
            inMemorySuggestions.set(sessionId, []);
            inMemoryVotes.set(sessionId, []);
            inMemoryMessages.set(sessionId, []);

            return session;
        }

        const supabase = getSupabase()!;

        // Insert session
        const { data: session, error: sessionErr } = await (supabase.from('planning_sessions') as any)
            .insert({ creator_id: creatorId, title, status: 'active' })
            .select()
            .single();

        if (sessionErr || !session) {
            throw new Error(sessionErr?.message || 'Failed to create session');
        }

        // Insert all members
        const memberRows = allMemberIds.map((uid) => ({
            session_id: session.id,
            user_id: uid,
            role: uid === creatorId ? 'creator' : 'member',
        }));

        await (supabase.from('planning_members') as any).insert(memberRows);

        return session;
    }

    // ── Get Full Session State ───────────────────────────────

    async getSession(sessionId: string, userId: string): Promise<any> {
        if (!hasDatabase()) {
            const session = inMemorySessions.get(sessionId);
            if (!session) return null;

            const members     = inMemoryMembers.get(sessionId) || [];
            const suggestions = inMemorySuggestions.get(sessionId) || [];
            const messages    = inMemoryMessages.get(sessionId) || [];
            const votes       = inMemoryVotes.get(sessionId) || [];

            const userVote = votes.find((v: any) => v.user_id === userId);

            return {
                session,
                members,
                suggestions: suggestions.map((s: any) => ({
                    ...s,
                    is_voted_by_me: userVote?.suggestion_id === s.id,
                })),
                messages,
            };
        }

        const supabase = getSupabase()!;

        const { data: session } = await (supabase.from('planning_sessions') as any)
            .select('*')
            .eq('id', sessionId)
            .single();

        if (!session) return null;

        const [membersResult, suggestionsResult, messagesResult, votesResult] = await Promise.all([
            (supabase.from('planning_members') as any)
                .select('id, user_id, role, joined_at')
                .eq('session_id', sessionId),
            (supabase.from('planning_suggestions') as any)
                .select('*')
                .eq('session_id', sessionId)
                .order('vote_count', { ascending: false }),
            (supabase.from('planning_messages') as any)
                .select('*')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true }),
            (supabase.from('planning_votes') as any)
                .select('suggestion_id, user_id')
                .eq('session_id', sessionId),
        ]);

        const userVote = (votesResult.data || []).find((v: any) => v.user_id === userId);

        const suggestions = (suggestionsResult.data || []).map((s: any) => ({
            ...s,
            is_voted_by_me: userVote?.suggestion_id === s.id,
        }));

        return {
            session,
            members:     membersResult.data || [],
            suggestions,
            messages:    messagesResult.data || [],
        };
    }

    // ── List User's Sessions ─────────────────────────────────

    async getUserSessions(userId: string): Promise<any[]> {
        if (!hasDatabase()) {
            const result: any[] = [];
            inMemorySessions.forEach((session) => {
                const members = inMemoryMembers.get(session.id) || [];
                const isMember = members.some((m: any) => m.user_id === userId);
                if (isMember) result.push(session);
            });
            return result.sort((a, b) =>
                new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
            );
        }

        const supabase = getSupabase()!;

        const { data: memberRows } = await (supabase.from('planning_members') as any)
            .select('session_id')
            .eq('user_id', userId);

        if (!memberRows?.length) return [];

        const sessionIds = memberRows.map((r: any) => r.session_id);

        const { data: sessions } = await (supabase.from('planning_sessions') as any)
            .select('*')
            .in('id', sessionIds)
            .order('updated_at', { ascending: false });

        return sessions || [];
    }

    // ── Add Suggestion ───────────────────────────────────────

    async addSuggestion(sessionId: string, userId: string, input: SuggestionInput): Promise<any> {
        if (!hasDatabase()) {
            const suggestions = inMemorySuggestions.get(sessionId) || [];
            const existing = suggestions.find((s: any) => s.place_id === input.place_id);
            if (existing) throw new Error('Place already suggested in this session');

            const suggestion = {
                id: genId(),
                session_id: sessionId,
                suggested_by: userId,
                ...input,
                vote_count: 0,
                created_at: new Date().toISOString(),
            };
            suggestions.push(suggestion);
            inMemorySuggestions.set(sessionId, suggestions);
            return suggestion;
        }

        const supabase = getSupabase()!;

        const { data, error } = await (supabase.from('planning_suggestions') as any)
            .insert({
                session_id:     sessionId,
                suggested_by:   userId,
                place_id:       input.place_id,
                place_name:     input.place_name,
                place_address:  input.place_address,
                place_location: input.place_location,
                note:           input.note,
            })
            .select()
            .single();

        if (error) throw new Error(error.message);
        return data;
    }

    // ── Cast Vote (one per user per session) ─────────────────

    async castVote(sessionId: string, userId: string, suggestionId: string): Promise<any> {
        if (!hasDatabase()) {
            const votes = inMemoryVotes.get(sessionId) || [];
            const suggestions = inMemorySuggestions.get(sessionId) || [];

            // Find and decrement old vote
            const oldVoteIdx = votes.findIndex((v: any) => v.user_id === userId);
            if (oldVoteIdx !== -1) {
                const oldSuggId = votes[oldVoteIdx].suggestion_id;
                const oldSugg = suggestions.find((s: any) => s.id === oldSuggId);
                if (oldSugg) oldSugg.vote_count = Math.max(0, (oldSugg.vote_count || 0) - 1);
                votes.splice(oldVoteIdx, 1);
            }

            // Add new vote
            const vote = {
                id: genId(),
                session_id: sessionId,
                suggestion_id: suggestionId,
                user_id: userId,
                created_at: new Date().toISOString(),
            };
            votes.push(vote);
            inMemoryVotes.set(sessionId, votes);

            // Increment new suggestion vote count
            const newSugg = suggestions.find((s: any) => s.id === suggestionId);
            if (newSugg) newSugg.vote_count = (newSugg.vote_count || 0) + 1;
            inMemorySuggestions.set(sessionId, suggestions);

            return vote;
        }

        const supabase = getSupabase()!;

        // Check for existing vote in this session
        const { data: existingVote } = await (supabase.from('planning_votes') as any)
            .select('id, suggestion_id')
            .eq('session_id', sessionId)
            .eq('user_id', userId)
            .maybeSingle();

        if (existingVote) {
            // Decrement old suggestion vote count
            await (supabase.from('planning_suggestions') as any)
                .rpc('decrement_vote_count', { suggestion_id: existingVote.suggestion_id })
                .catch(() => {
                    // Fallback: manual decrement
                    return (supabase.from('planning_suggestions') as any)
                        .select('vote_count')
                        .eq('id', existingVote.suggestion_id)
                        .single()
                        .then(({ data }: any) => {
                            if (data) {
                                return (supabase.from('planning_suggestions') as any)
                                    .update({ vote_count: Math.max(0, (data.vote_count || 0) - 1) })
                                    .eq('id', existingVote.suggestion_id);
                            }
                        });
                });

            // Delete old vote
            await (supabase.from('planning_votes') as any)
                .delete()
                .eq('id', existingVote.id);
        }

        // Insert new vote
        const { data: vote, error } = await (supabase.from('planning_votes') as any)
            .insert({ session_id: sessionId, suggestion_id: suggestionId, user_id: userId })
            .select()
            .single();

        if (error) throw new Error(error.message);

        // Increment new suggestion vote count
        const { data: sugg } = await (supabase.from('planning_suggestions') as any)
            .select('vote_count')
            .eq('id', suggestionId)
            .single();

        if (sugg) {
            await (supabase.from('planning_suggestions') as any)
                .update({ vote_count: (sugg.vote_count || 0) + 1 })
                .eq('id', suggestionId);
        }

        return vote;
    }

    // ── Finalize Decision ────────────────────────────────────

    async finalizeDecision(sessionId: string, creatorId: string): Promise<any> {
        if (!hasDatabase()) {
            const session = inMemorySessions.get(sessionId);
            if (!session || session.creator_id !== creatorId) {
                throw new Error('Only the creator can finalize the decision');
            }

            const suggestions = inMemorySuggestions.get(sessionId) || [];
            if (!suggestions.length) throw new Error('No suggestions to decide on');

            const winner = suggestions.reduce((best: any, s: any) =>
                (s.vote_count || 0) > (best.vote_count || 0) ? s : best
            );

            session.status          = 'decided';
            session.decided_place_id = winner.place_id;
            session.decided_at      = new Date().toISOString();
            session.updated_at      = new Date().toISOString();
            inMemorySessions.set(sessionId, session);

            return winner;
        }

        const supabase = getSupabase()!;

        // Verify creator
        const { data: session } = await (supabase.from('planning_sessions') as any)
            .select('creator_id')
            .eq('id', sessionId)
            .single();

        if (!session || session.creator_id !== creatorId) {
            throw new Error('Only the creator can finalize the decision');
        }

        // Find winning suggestion
        const { data: suggestions } = await (supabase.from('planning_suggestions') as any)
            .select('*')
            .eq('session_id', sessionId)
            .order('vote_count', { ascending: false })
            .limit(1);

        if (!suggestions?.length) throw new Error('No suggestions to decide on');
        const winner = suggestions[0];

        // Update session
        await (supabase.from('planning_sessions') as any)
            .update({
                status:           'decided',
                decided_place_id: winner.place_id,
                decided_at:       new Date().toISOString(),
            })
            .eq('id', sessionId);

        return winner;
    }

    // ── Send Message ─────────────────────────────────────────

    async sendMessage(sessionId: string, userId: string, text: string): Promise<any> {
        if (!hasDatabase()) {
            const messages = inMemoryMessages.get(sessionId) || [];
            const message = {
                id: genId(),
                session_id: sessionId,
                user_id: userId,
                text,
                created_at: new Date().toISOString(),
            };
            messages.push(message);
            inMemoryMessages.set(sessionId, messages);
            return message;
        }

        const supabase = getSupabase()!;

        const { data, error } = await (supabase.from('planning_messages') as any)
            .insert({ session_id: sessionId, user_id: userId, text })
            .select()
            .single();

        if (error) throw new Error(error.message);
        return data;
    }

    // ── Get Messages ─────────────────────────────────────────

    async getMessages(sessionId: string, since?: string): Promise<any[]> {
        if (!hasDatabase()) {
            const messages = inMemoryMessages.get(sessionId) || [];
            if (since) {
                return messages.filter((m: any) => m.created_at > since);
            }
            return messages;
        }

        const supabase = getSupabase()!;

        let query = (supabase.from('planning_messages') as any)
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (since) {
            query = query.gt('created_at', since);
        }

        const { data } = await query;
        return data || [];
    }

    // ── Get Updates (polling) ────────────────────────────────

    async getUpdates(sessionId: string, since: string): Promise<any> {
        if (!hasDatabase()) {
            const suggestions = inMemorySuggestions.get(sessionId) || [];
            const votes       = inMemoryVotes.get(sessionId) || [];
            const messages    = inMemoryMessages.get(sessionId) || [];
            const session     = inMemorySessions.get(sessionId);

            return {
                new_suggestions: suggestions.filter((s: any) => s.created_at > since),
                new_votes:       votes.filter((v: any) => v.created_at > since),
                new_messages:    messages.filter((m: any) => m.created_at > since),
                session,
            };
        }

        const supabase = getSupabase()!;

        const [suggestionsResult, votesResult, messagesResult, sessionResult] = await Promise.all([
            (supabase.from('planning_suggestions') as any)
                .select('*')
                .eq('session_id', sessionId)
                .gt('created_at', since),
            (supabase.from('planning_votes') as any)
                .select('*')
                .eq('session_id', sessionId)
                .gt('created_at', since),
            (supabase.from('planning_messages') as any)
                .select('*')
                .eq('session_id', sessionId)
                .gt('created_at', since)
                .order('created_at', { ascending: true }),
            (supabase.from('planning_sessions') as any)
                .select('*')
                .eq('id', sessionId)
                .single(),
        ]);

        return {
            new_suggestions: suggestionsResult.data || [],
            new_votes:       votesResult.data || [],
            new_messages:    messagesResult.data || [],
            session:         sessionResult.data,
        };
    }

    // ── Membership Check ─────────────────────────────────────

    async isMember(sessionId: string, userId: string): Promise<boolean> {
        if (!hasDatabase()) {
            const members = inMemoryMembers.get(sessionId) || [];
            return members.some((m: any) => m.user_id === userId);
        }

        const supabase = getSupabase()!;

        const { count } = await (supabase.from('planning_members') as any)
            .select('id', { count: 'exact', head: true })
            .eq('session_id', sessionId)
            .eq('user_id', userId);

        return (count ?? 0) > 0;
    }
}
