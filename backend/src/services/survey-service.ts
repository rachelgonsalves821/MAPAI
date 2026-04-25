/**
 * Mapai Backend — Survey Service
 * Manages arrival surveys triggered after QR code check-ins.
 * Uses Supabase when available; falls back to in-memory Maps.
 *
 * Survey structure: 5 multiple-choice questions covering PRD dimensions
 *   (satisfaction, speed, value, match, return) per check-in.
 * Storage: Option A — 1 row per survey, responses encoded as JSON in response_text.
 *
 * Points: 2 pts awarded on submit (not on create).
 * Expiry: Pending surveys expire after 24 hours.
 *
 * Backward compatibility: old 2-question surveys ('improvement'/'recommendation')
 *   are still readable and aggregated into improvementBreakdown /
 *   recommendationBreakdown for legacy consumers.
 */

import { getSupabase, hasDatabase } from '../db/supabase-client.js';
import { LoyaltyService } from './loyalty-service.js';
import { MemoryService } from './memory-service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SurveyQuestion {
    id: string;       // 'satisfaction' | 'speed' | 'value' | 'match' | 'return'
                      // legacy: 'improvement' | 'recommendation'
    text: string;
    options: string[];
}

export interface SurveyResponse {
    questionId: string;
    answer: string;
}

export interface Survey {
    id: string;
    userId: string;
    placeId: string;
    placeName: string;
    questions: SurveyQuestion[];
    responses?: SurveyResponse[];
    completed: boolean;
    createdAt: string;
}

export interface PlaceSurveyStats {
    placeId: string;
    totalResponses: number;
    averageRating: number;
    /** Per-question answer tallies for the 5 PRD dimensions. */
    dimensionBreakdowns: Record<string, Record<string, number>>;
    /** Legacy breakdown kept for backward compatibility. */
    improvementBreakdown: Record<string, number>;
    /** Legacy breakdown kept for backward compatibility. */
    recommendationBreakdown: Record<string, number>;
}

// ─── Hardcoded questions (identical for every user / place) ───────────────────

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
    {
        id: 'satisfaction',
        text: 'How was your overall experience?',
        options: ['Loved it', 'Really good', 'It was okay', 'Disappointing', 'Bad experience'],
    },
    {
        id: 'speed',
        text: 'How was the service speed?',
        options: ['Lightning fast', 'Quick enough', 'Average', 'A bit slow', 'Painfully slow'],
    },
    {
        id: 'value',
        text: 'How was the value for what you paid?',
        options: ['Amazing deal', 'Fair price', 'About average', 'A bit pricey', 'Overpriced'],
    },
    {
        id: 'match',
        text: 'Did this place match what Mapai suggested?',
        options: ['Even better than expected', 'Matched perfectly', 'Close enough', 'Not quite', 'Completely off'],
    },
    {
        id: 'return',
        text: 'Would you come back?',
        options: ['Already planning my next visit', 'Definitely yes', 'Maybe', 'Probably not', 'Never again'],
    },
];

// ─── Rating derivation ────────────────────────────────────────────────────────

/** Maps 'return' question answers → numeric rating (used for DB storage). */
const RETURN_RATING: Record<string, number> = {
    'Already planning my next visit': 5,
    'Definitely yes': 4,
    'Maybe': 3,
    'Probably not': 2,
    'Never again': 1,
};

/**
 * Legacy rating map kept for surveys submitted with the old 'recommendation'
 * question so that backward-compat re-processing still yields a valid number.
 */
const RECOMMENDATION_RATING: Record<string, number> = {
    'Absolutely, already have': 5,
    'Yes, for the right person': 4,
    "It's fine but nothing special": 3,
    'Probably not': 2,
};

function deriveRating(responses: SurveyResponse[]): number {
    // New 5-question format: derive from the 'return' question.
    const ret = responses.find(r => r.questionId === 'return');
    if (ret) return RETURN_RATING[ret.answer] ?? 3;

    // Legacy 2-question format: fall back to 'recommendation'.
    const rec = responses.find(r => r.questionId === 'recommendation');
    if (rec) return RECOMMENDATION_RATING[rec.answer] ?? 3;

    return 3; // neutral default
}

// ─── In-memory fallback store ─────────────────────────────────────────────────

// keyed by survey id
const inMemorySurveys = new Map<string, any>();

function generateId(): string {
    return `survey-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isExpired(createdAt: string): boolean {
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    return Date.now() - new Date(createdAt).getTime() > TWENTY_FOUR_HOURS;
}

function rowToSurvey(row: any): Survey {
    let questions: SurveyQuestion[] = SURVEY_QUESTIONS;
    let responses: SurveyResponse[] | undefined;

    try {
        if (row.question_text) {
            questions = JSON.parse(row.question_text);
        }
    } catch {
        // fall back to default questions
    }

    try {
        if (row.response_text) {
            responses = JSON.parse(row.response_text);
        }
    } catch {
        // no responses yet
    }

    return {
        id: row.id,
        userId: row.user_id,
        placeId: row.place_id ?? '',
        placeName: row.place_name ?? '',
        questions,
        responses,
        completed: Boolean(row.processed),
        createdAt: row.created_at,
    };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class SurveyService {
    private loyalty = new LoyaltyService();
    private memory = new MemoryService();

    /**
     * Create a survey linked to a check-in.
     * Returns the survey immediately (with questions) so the frontend can show
     * the modal right away.
     *
     * Because the surveys table has visit_id NOT NULL REFERENCES visits(id),
     * we first insert a visit record (status = 'visited') to get a valid UUID,
     * then insert the survey row referencing it.
     *
     * In the in-memory fallback, visit_id is a synthetic string — no FK check.
     */
    async createSurveyForCheckIn(
        userId: string,
        placeId: string,
        placeName: string
    ): Promise<Survey> {
        const now = new Date().toISOString();

        if (!hasDatabase()) {
            const id = generateId();
            const survey = {
                id,
                user_id: userId,
                place_id: placeId,
                place_name: placeName,
                question_text: JSON.stringify(SURVEY_QUESTIONS),
                response_text: null,
                rating: null,
                processed: false,
                created_at: now,
            };
            inMemorySurveys.set(id, survey);
            return rowToSurvey(survey);
        }

        const supabase = getSupabase()!;

        // Resolve the internal UUID for this place so we can insert into visits.
        // The places table uses google_place_id as the external key; placeId here
        // is the Google Place ID sent from the mobile client.
        let placeUuid: string | null = null;
        const { data: placeRow } = await (supabase.from('places') as any)
            .select('id')
            .eq('google_place_id', placeId)
            .maybeSingle();
        placeUuid = placeRow?.id ?? null;

        let visitId: string;

        if (placeUuid) {
            // Insert a real visit record so the FK constraint is satisfied.
            const { data: visitRow, error: visitErr } = await (supabase.from('visits') as any)
                .insert({
                    user_id: userId,
                    place_id: placeUuid,
                    status: 'visited',
                    visit_date: now,
                })
                .select('id')
                .single();

            if (visitErr || !visitRow) {
                throw new Error(`Failed to create visit for survey: ${visitErr?.message ?? 'unknown'}`);
            }
            visitId = visitRow.id;
        } else {
            // Place not yet in our DB (e.g. fresh Google Places result).
            // Insert a placeholder place row so we can satisfy the FK chain.
            const { data: newPlace, error: placeErr } = await (supabase.from('places') as any)
                .insert({
                    google_place_id: placeId,
                    name: placeName,
                    latitude: 0,
                    longitude: 0,
                })
                .select('id')
                .single();

            if (placeErr || !newPlace) {
                throw new Error(`Failed to create place placeholder: ${placeErr?.message ?? 'unknown'}`);
            }
            placeUuid = newPlace.id;

            const { data: visitRow, error: visitErr } = await (supabase.from('visits') as any)
                .insert({
                    user_id: userId,
                    place_id: placeUuid,
                    status: 'visited',
                    visit_date: now,
                })
                .select('id')
                .single();

            if (visitErr || !visitRow) {
                throw new Error(`Failed to create visit for survey: ${visitErr?.message ?? 'unknown'}`);
            }
            visitId = visitRow.id;
        }

        // Insert the survey row.
        const { data: surveyRow, error: surveyErr } = await (supabase.from('surveys') as any)
            .insert({
                visit_id: visitId,
                user_id: userId,
                // Repurpose question_text to carry the full question/place metadata as JSON
                question_text: JSON.stringify(SURVEY_QUESTIONS),
                processed: false,
            })
            .select()
            .single();

        if (surveyErr || !surveyRow) {
            throw new Error(`Failed to create survey: ${surveyErr?.message ?? 'unknown'}`);
        }

        // Attach place data that the DB row doesn't store natively
        return rowToSurvey({ ...surveyRow, place_id: placeId, place_name: placeName });
    }

    /**
     * Get the most recent incomplete survey for a user created within the last 24 h.
     * Returns null if no pending survey exists or all have expired.
     */
    async getPendingSurvey(userId: string): Promise<Survey | null> {
        if (!hasDatabase()) {
            const cutoff = Date.now() - 24 * 60 * 60 * 1000;
            for (const row of inMemorySurveys.values()) {
                if (
                    row.user_id === userId &&
                    !row.processed &&
                    new Date(row.created_at).getTime() > cutoff
                ) {
                    return rowToSurvey(row);
                }
            }
            return null;
        }

        const supabase = getSupabase()!;
        const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data, error } = await (supabase.from('surveys') as any)
            .select('*')
            .eq('user_id', userId)
            .eq('processed', false)
            .gte('created_at', cutoffIso)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error || !data) return null;
        return rowToSurvey(data);
    }

    /**
     * Submit responses for a survey.
     * 1. Validates ownership and that the survey is still open.
     * 2. Persists responses + derived rating.
     * 3. Awards 2 loyalty points.
     * 4. Feeds responses into the memory/preference engine.
     */
    async submitSurvey(
        userId: string,
        surveyId: string,
        responses: SurveyResponse[]
    ): Promise<void> {
        const rating = deriveRating(responses);
        const responseJson = JSON.stringify(responses);

        if (!hasDatabase()) {
            const row = inMemorySurveys.get(surveyId);
            if (!row) throw new Error('Survey not found');
            if (row.user_id !== userId) throw new Error('Survey not found');
            if (row.processed) throw new Error('Survey already completed');
            if (isExpired(row.created_at)) throw new Error('Survey has expired');

            row.response_text = responseJson;
            row.rating = rating;
            row.processed = true;
            inMemorySurveys.set(surveyId, row);

            await this.loyalty.awardPoints(userId, 'survey', 2, surveyId, 'Completed arrival survey');
            await this.memory.processSurveyFeedback(userId, surveyId, rating, responseJson);
            return;
        }

        const supabase = getSupabase()!;

        // Load and validate the survey
        const { data: existing, error: loadErr } = await (supabase.from('surveys') as any)
            .select('*')
            .eq('id', surveyId)
            .eq('user_id', userId)
            .maybeSingle();

        if (loadErr || !existing) throw new Error('Survey not found');
        if (existing.processed) throw new Error('Survey already completed');
        if (isExpired(existing.created_at)) throw new Error('Survey has expired');

        // Persist responses
        const { error: updateErr } = await (supabase.from('surveys') as any)
            .update({
                response_text: responseJson,
                rating,
                processed: true,
            })
            .eq('id', surveyId);

        if (updateErr) throw new Error(`Failed to save survey responses: ${updateErr.message}`);

        // Award points and feed memory engine in parallel — both are non-critical
        await Promise.allSettled([
            this.loyalty.awardPoints(userId, 'survey', 2, surveyId, 'Completed arrival survey'),
            this.memory.processSurveyFeedback(userId, surveyId, rating, responseJson),
        ]);
    }

    /**
     * Aggregated, anonymized survey statistics for a place.
     * Used to show place owners / admins how visitors feel.
     */
    async getPlaceSurveyStats(placeId: string): Promise<PlaceSurveyStats> {
        if (!hasDatabase()) {
            const allForPlace = Array.from(inMemorySurveys.values()).filter(
                r => r.place_id === placeId && r.processed && r.response_text
            );
            return this.aggregateStats(placeId, allForPlace);
        }

        const supabase = getSupabase()!;

        // Resolve internal UUID for the Google Place ID
        const { data: placeRow } = await (supabase.from('places') as any)
            .select('id')
            .eq('google_place_id', placeId)
            .maybeSingle();

        if (!placeRow) {
            return {
                placeId,
                totalResponses: 0,
                averageRating: 0,
                dimensionBreakdowns: {},
                improvementBreakdown: {},
                recommendationBreakdown: {},
            };
        }

        // Surveys join through visits via place_id
        const { data: rows, error } = await (supabase.from('surveys') as any)
            .select('rating, response_text, visits!inner(place_id)')
            .eq('visits.place_id', placeRow.id)
            .eq('processed', true)
            .not('response_text', 'is', null);

        if (error || !rows) {
            return {
                placeId,
                totalResponses: 0,
                averageRating: 0,
                dimensionBreakdowns: {},
                improvementBreakdown: {},
                recommendationBreakdown: {},
            };
        }

        return this.aggregateStats(placeId, rows);
    }

    // ─── Private helpers ───────────────────────────────────────────────────────

    private aggregateStats(placeId: string, rows: any[]): PlaceSurveyStats {
        // Per-dimension tallies for the 5 PRD questions (and any future questions).
        // Keys are question IDs; inner keys are answer option strings.
        const dimensionBreakdowns: Record<string, Record<string, number>> = {};

        // Legacy breakdowns kept for backward compatibility.
        const improvementBreakdown: Record<string, number> = {};
        const recommendationBreakdown: Record<string, number> = {};

        let ratingSum = 0;
        let ratingCount = 0;

        for (const row of rows) {
            if (row.rating != null) {
                ratingSum += row.rating;
                ratingCount++;
            }

            let responses: SurveyResponse[] = [];
            try {
                if (row.response_text) {
                    responses = JSON.parse(row.response_text);
                }
            } catch {
                continue;
            }

            for (const r of responses) {
                // ── New 5-dimension format ────────────────────────────────
                // Accumulate every question into dimensionBreakdowns so that
                // any current or future question ID is captured automatically.
                if (!dimensionBreakdowns[r.questionId]) {
                    dimensionBreakdowns[r.questionId] = {};
                }
                dimensionBreakdowns[r.questionId][r.answer] =
                    (dimensionBreakdowns[r.questionId][r.answer] ?? 0) + 1;

                // ── Legacy 2-question format (backward compat) ───────────
                if (r.questionId === 'improvement') {
                    improvementBreakdown[r.answer] = (improvementBreakdown[r.answer] ?? 0) + 1;
                } else if (r.questionId === 'recommendation') {
                    recommendationBreakdown[r.answer] = (recommendationBreakdown[r.answer] ?? 0) + 1;
                }
            }
        }

        return {
            placeId,
            totalResponses: ratingCount,
            averageRating: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : 0,
            dimensionBreakdowns,
            improvementBreakdown,
            recommendationBreakdown,
        };
    }
}
