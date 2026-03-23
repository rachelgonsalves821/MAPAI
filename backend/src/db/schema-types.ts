/**
 * Mapai Backend — Database Schema Types
 * TypeScript types matching the Supabase/PostgreSQL schema.
 * Generated from the migration; keep in sync with migrate.ts.
 */

export interface Database {
    public: {
        Tables: {
            users: {
                Row: UserRow;
                Insert: Omit<UserRow, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string };
                Update: Partial<Omit<UserRow, 'id'>>;
            };
            user_preferences: {
                Row: UserPreferenceRow;
                Insert: Omit<UserPreferenceRow, 'id' | 'created_at' | 'last_updated'>;
                Update: Partial<Omit<UserPreferenceRow, 'id'>>;
            };
            places: {
                Row: PlaceRow;
                Insert: Omit<PlaceRow, 'id' | 'created_at' | 'updated_at'>;
                Update: Partial<Omit<PlaceRow, 'id'>>;
            };
            social_signals: {
                Row: SocialSignalRow;
                Insert: Omit<SocialSignalRow, 'id' | 'created_at'>;
                Update: Partial<Omit<SocialSignalRow, 'id'>>;
            };
            chat_sessions: {
                Row: ChatSessionRow;
                Insert: Omit<ChatSessionRow, 'id' | 'created_at' | 'updated_at'>;
                Update: Partial<Omit<ChatSessionRow, 'id'>>;
            };
            visits: {
                Row: VisitRow;
                Insert: Omit<VisitRow, 'id' | 'created_at'>;
                Update: Partial<Omit<VisitRow, 'id'>>;
            };
            surveys: {
                Row: SurveyRow;
                Insert: Omit<SurveyRow, 'id' | 'created_at'>;
                Update: Partial<Omit<SurveyRow, 'id'>>;
            };
            navigation_logs: {
                Row: NavigationLogRow;
                Insert: Omit<NavigationLogRow, 'id' | 'created_at'>;
                Update: Partial<Omit<NavigationLogRow, 'id'>>;
            };
        };
    };
}

// ─── Row Types ───────────────────────────────────────────

export interface UserRow {
    id: string;
    email: string | null;
    display_name: string | null;
    avatar_url: string | null;
    onboarding_complete: boolean;
    created_at: string;
    updated_at: string;
}

export interface UserPreferenceRow {
    id: string;
    user_id: string;
    dimension: string;
    value: string;
    confidence: number;
    source: 'explicit' | 'inferred' | 'behavioral';
    created_at: string;
    last_updated: string;
    decay_weight: number;
}

export interface PlaceRow {
    id: string;
    google_place_id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    neighborhood: string | null;
    category: string;
    rating: number;
    rating_count: number;
    price_level: number;
    photos: string[];
    website: string | null;
    phone_number: string | null;
    open_now: boolean | null;
    seed_category: string | null;
    created_at: string;
    updated_at: string;
}

export interface SocialSignalRow {
    id: string;
    place_id: string;
    source: 'reddit' | 'google' | 'instagram';
    quote: string;
    author: string;
    post_date: string | null;
    sentiment: 'positive' | 'neutral' | 'negative';
    highlighted_attributes: string[];
    created_at: string;
    expires_at: string;
}

export interface ChatSessionRow {
    id: string;
    user_id: string;
    messages: Array<{ role: string; content: string; timestamp: string }>;
    created_at: string;
    updated_at: string;
}

export interface VisitRow {
    id: string;
    user_id: string;
    place_id: string;
    status: 'planned' | 'visited' | 'cancelled';
    visit_date: string;
    created_at: string;
}

export interface SurveyRow {
    id: string;
    visit_id: string;
    user_id: string;
    question_text: string;
    response_text: string | null;
    rating: number | null;
    processed: boolean;
    created_at: string;
}

export interface NavigationLogRow {
    id: string;
    user_id: string;
    place_id: string;
    mode: 'walking' | 'transit' | 'driving' | 'cycling';
    origin_lat: number;
    origin_lng: number;
    travel_time_seconds: number | null;
    distance_meters: number | null;
    created_at: string;
}
