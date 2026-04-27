/**
 * Mapai Backend — Loyalty Service
 * Manages points transactions, balance, rewards, and redemptions.
 * Uses Supabase when available; falls back to in-memory Maps.
 *
 * Points rules:
 *   survey      → 2 pts
 *   review      → 3 pts
 *   check_in    → 3 pts
 *   first_visit → 10 pts
 *   referral    → 10 pts
 *   redemption threshold: 50 pts
 */

import { getSupabase, hasDatabase } from '../db/supabase-client.js';

// ─── In-memory fallback stores ────────────────────────────────────────────────

const inMemoryBalances = new Map<string, number>();
const inMemoryTransactions = new Map<string, any[]>();
const inMemoryRedemptions = new Map<string, any[]>();

const SEED_REWARDS = [
    {
        id: 'reward-001',
        title: 'Free drip coffee',
        description: 'Any size drip coffee on the house.',
        partner_name: 'George Howell',
        points_required: 80,
        reward_type: 'free_item',
        category: 'coffee',
        terms: 'Valid at George Howell Coffee locations. One per visit.',
        valid_until: '2026-12-31',
        quantity_available: null,
        is_active: true,
        created_at: new Date().toISOString(),
    },
    {
        id: 'reward-002',
        title: '$10 off dinner',
        description: '$10 off any dinner entrée.',
        partner_name: 'The Salty Pig',
        points_required: 200,
        reward_type: 'discount',
        category: 'food',
        terms: 'Valid for dine-in only. Cannot be combined with other offers.',
        valid_until: '2026-12-31',
        quantity_available: 50,
        is_active: true,
        created_at: new Date().toISOString(),
    },
    {
        id: 'reward-003',
        title: 'Free pastry',
        description: 'Any pastry or baked good, on us.',
        partner_name: 'Tatte Bakery',
        points_required: 60,
        reward_type: 'free_item',
        category: 'dessert',
        terms: 'Valid at all Tatte locations.',
        valid_until: '2026-12-31',
        quantity_available: null,
        is_active: true,
        created_at: new Date().toISOString(),
    },
    {
        id: 'reward-004',
        title: 'Ramen upgrade',
        description: 'Free extra toppings on any ramen bowl.',
        partner_name: 'Ganko Ittetsu',
        points_required: 120,
        reward_type: 'free_item',
        category: 'food',
        terms: 'Valid for dine-in. One upgrade per visit.',
        valid_until: '2026-12-31',
        quantity_available: 30,
        is_active: true,
        created_at: new Date().toISOString(),
    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateCode(length = 8): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class LoyaltyService {

    // ─── Balance ─────────────────────────────────────────────────────────────

    async getBalance(userId: string): Promise<number> {
        if (!hasDatabase()) {
            return inMemoryBalances.get(userId) ?? 0;
        }
        const supabase = getSupabase()!;
        const { data } = await (supabase.from('users') as any)
            .select('points_balance')
            .eq('clerk_user_id', userId)
            .maybeSingle();
        return data?.points_balance ?? 0;
    }

    // ─── Transaction History ──────────────────────────────────────────────────

    async getHistory(userId: string, limit = 20, cursor?: string): Promise<{
        transactions: any[];
        next_cursor: string | null;
    }> {
        if (!hasDatabase()) {
            const all = inMemoryTransactions.get(userId) || [];
            const slice = all.slice(0, limit);
            return {
                transactions: slice,
                next_cursor: slice.length === limit && all.length > limit
                    ? slice[slice.length - 1].created_at
                    : null,
            };
        }

        const supabase = getSupabase()!;
        let query = (supabase.from('points_transactions') as any)
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (cursor) {
            query = query.lt('created_at', cursor);
        }

        const { data } = await query;
        const rows = data || [];
        return {
            transactions: rows,
            next_cursor: rows.length === limit ? rows[rows.length - 1].created_at : null,
        };
    }

    // ─── Award Points ─────────────────────────────────────────────────────────

    async awardPoints(
        userId: string,
        type: 'survey' | 'review' | 'check_in' | 'first_visit' | 'referral' | 'redemption',
        points: number,
        referenceId?: string,
        description?: string
    ): Promise<{ balance: number; transaction: any }> {
        if (!hasDatabase()) {
            const current = inMemoryBalances.get(userId) ?? 0;
            const newBalance = Math.max(0, current + points);
            inMemoryBalances.set(userId, newBalance);

            const tx = {
                id: `tx-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                user_id: userId,
                points,
                transaction_type: type,
                reference_id: referenceId ?? null,
                description: description ?? null,
                created_at: new Date().toISOString(),
            };
            const existing = inMemoryTransactions.get(userId) || [];
            existing.unshift(tx);
            if (existing.length > 200) existing.length = 200;
            inMemoryTransactions.set(userId, existing);
            return { balance: newBalance, transaction: tx };
        }

        const supabase = getSupabase()!;

        // Insert transaction
        const { data: tx } = await (supabase.from('points_transactions') as any)
            .insert({
                user_id: userId,
                points,
                transaction_type: type,
                reference_id: referenceId ?? null,
                description: description ?? null,
            })
            .select()
            .single();

        // Read current balance, add points, write back
        const currentBalance = await this.getBalance(userId);
        await (supabase.from('users') as any)
            .update({ points_balance: currentBalance + points })
            .eq('clerk_user_id', userId);

        const newBalance = currentBalance + points;
        return { balance: newBalance, transaction: tx };
    }

    // ─── Rewards Catalog ──────────────────────────────────────────────────────

    async getRewards(): Promise<any[]> {
        if (!hasDatabase()) {
            return SEED_REWARDS;
        }
        const supabase = getSupabase()!;
        const { data } = await (supabase.from('rewards') as any)
            .select('*')
            .eq('is_active', true)
            .order('points_required', { ascending: true });
        return data || [];
    }

    // ─── Redeem Reward ────────────────────────────────────────────────────────

    async redeemReward(userId: string, rewardId: string): Promise<{
        redemption_code: string;
        reward: any;
        new_balance: number;
    }> {
        if (!hasDatabase()) {
            const reward = SEED_REWARDS.find(r => r.id === rewardId);
            if (!reward) throw new Error('Reward not found');
            if (!reward.is_active) throw new Error('Reward is no longer available');

            const balance = inMemoryBalances.get(userId) ?? 0;
            if (balance < reward.points_required) {
                throw new Error(`Insufficient points. Need ${reward.points_required}, have ${balance}`);
            }

            const code = generateCode();
            const newBalance = balance - reward.points_required;
            inMemoryBalances.set(userId, newBalance);

            const redemption = {
                id: `red-${Date.now()}`,
                user_id: userId,
                reward_id: rewardId,
                redeemed_at: new Date().toISOString(),
                status: 'pending',
                redemption_code: code,
            };
            const existing = inMemoryRedemptions.get(userId) || [];
            existing.unshift(redemption);
            inMemoryRedemptions.set(userId, existing);

            // Record deduction in transactions
            await this.awardPoints(userId, 'redemption', -reward.points_required, rewardId, `Redeemed: ${reward.title}`);

            return { redemption_code: code, reward, new_balance: newBalance };
        }

        const supabase = getSupabase()!;

        // Load reward
        const { data: reward, error: rewardErr } = await (supabase.from('rewards') as any)
            .select('*')
            .eq('id', rewardId)
            .eq('is_active', true)
            .maybeSingle();

        if (rewardErr || !reward) throw new Error('Reward not found or inactive');

        // Check balance
        const balance = await this.getBalance(userId);
        if (balance < reward.points_required) {
            throw new Error(`Insufficient points. Need ${reward.points_required}, have ${balance}`);
        }

        // Check quantity
        if (reward.quantity_available !== null && reward.quantity_available <= 0) {
            throw new Error('This reward is out of stock');
        }

        const code = generateCode();

        // Insert redemption
        await (supabase.from('reward_redemptions') as any)
            .insert({
                user_id: userId,
                reward_id: rewardId,
                status: 'pending',
                redemption_code: code,
            });

        // Deduct quantity if limited
        if (reward.quantity_available !== null) {
            await (supabase.from('rewards') as any)
                .update({ quantity_available: reward.quantity_available - 1 })
                .eq('id', rewardId);
        }

        // Deduct points
        await this.awardPoints(userId, 'redemption', -reward.points_required, rewardId, `Redeemed: ${reward.title}`);
        const newBalance = await this.getBalance(userId);

        return { redemption_code: code, reward, new_balance: newBalance };
    }

    // ─── Domain-specific award helpers ────────────────────────────────────────

    async awardForReview(userId: string, placeId: string): Promise<{ balance: number; transaction: any }> {
        return this.awardPoints(userId, 'review', 5, placeId, 'Points for writing a review');
    }

    async awardForSurvey(userId: string, surveyId: string): Promise<{ balance: number; transaction: any }> {
        return this.awardPoints(userId, 'survey', 2, surveyId, 'Points for completing a survey');
    }

    async awardForCheckIn(userId: string, placeId: string): Promise<{ balance: number; transaction: any }> {
        return this.awardPoints(userId, 'check_in', 3, placeId, 'Points for checking in');
    }

    /**
     * Returns true if the user has already checked in at this venue today (UTC).
     * "Today" is defined as the current calendar day in UTC, matching the
     * unique index in migration 008 which casts visit_date to ::date.
     */
    async hasCheckedInToday(userId: string, placeId: string): Promise<boolean> {
        if (!hasDatabase()) {
            // In-memory mode: inspect the transactions store for a same-day
            // check_in transaction referencing this placeId.
            const txs = inMemoryTransactions.get(userId) || [];
            const today = new Date().toISOString().split('T')[0];
            return txs.some(
                t =>
                    t.reference_id === placeId &&
                    t.transaction_type === 'check_in' &&
                    t.created_at.startsWith(today)
            );
        }

        const supabase = getSupabase()!;
        const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'

        // Resolve internal place UUID — visits.place_id is a UUID FK, not the
        // Google Place ID.  A missing place row means no prior visit exists.
        const { data: placeRow } = await (supabase.from('places') as any)
            .select('id')
            .eq('google_place_id', placeId)
            .maybeSingle();

        if (!placeRow) return false;

        const { data } = await (supabase.from('visits') as any)
            .select('id')
            .eq('user_id', userId)
            .eq('place_id', placeRow.id)
            .gte('visit_date', today)
            .eq('status', 'visited')
            .limit(1);

        return !!(data && data.length > 0);
    }

    async awardForFirstVisit(userId: string, placeId: string): Promise<void> {
        // Only award if this is genuinely the user's first check-in here
        if (!hasDatabase()) {
            const txs = inMemoryTransactions.get(userId) || [];
            const alreadyVisited = txs.some(
                t => t.reference_id === placeId && t.transaction_type === 'first_visit'
            );
            if (alreadyVisited) return;
            await this.awardPoints(userId, 'first_visit', 10, placeId, 'Bonus for your first visit here');
            return;
        }

        const supabase = getSupabase()!;
        const { count } = await (supabase.from('points_transactions') as any)
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('reference_id', placeId)
            .eq('transaction_type', 'first_visit');

        if ((count ?? 0) === 0) {
            await this.awardPoints(userId, 'first_visit', 10, placeId, 'Bonus for your first visit here');
        }
    }
}
