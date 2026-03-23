/**
 * Mapai — Core Type Definitions
 * Aligned with PRD §7 (API Design) and §6 (Feature Requirements)
 */

// ─── Place Types ─────────────────────────────────────────────

export interface Place {
    id: string;
    googlePlaceId: string;
    name: string;
    category: PlaceCategory;
    categoryChips: string[];       // e.g. ['Japanese', 'Ramen', 'Casual']
    address: string;
    neighborhood: BostonNeighborhood;
    location: LatLng;
    rating: number;                // Google rating 1-5
    priceLevel: number;            // 1-4 ($-$$$$)
    photos: string[];              // Photo URLs
    openNow?: boolean;
    hours?: string[];              // Formatted hours strings
    phoneNumber?: string;
    website?: string;

    // Mapai-specific enrichment
    matchScore: number;            // 0-100 personalized match score
    matchReasons: string[];        // Top 2-3 reasons this place matches
    socialSignals: SocialSignal[];
    crowdingLevel?: CrowdingLevel;
    typicalWait?: string;          // e.g. '10-15 min'
    isLoyalty: boolean;            // Visited 3+ times
    visitCount: number;
}

export type PlaceCategory =
    | 'restaurant'
    | 'cafe'
    | 'bar'
    | 'coffee'
    | 'bakery'
    | 'gym'
    | 'grocery'
    | 'nightlife'
    | 'other';

export type BostonNeighborhood =
    | 'Back Bay'
    | 'Beacon Hill'
    | 'Downtown'
    | 'South End'
    | 'Seaport'
    | 'North End'
    | 'Waterfront'
    | 'Harvard Square'
    | 'Central Square'
    | 'Kendall Square'
    | 'Davis Square'
    | 'Union Square'
    | 'Fenway'
    | 'Jamaica Plain';

export type CrowdingLevel = 'empty' | 'quiet' | 'moderate' | 'busy' | 'packed';

// ─── Social Signals ──────────────────────────────────────────

export interface SocialSignal {
    source: SocialSource;
    quote: string;
    author?: string;
    date: string;
    sentiment: 'positive' | 'neutral' | 'negative';
    highlightedAttributes?: string[];  // e.g. ['fast service', 'great ramen']
    highlighted_attributes?: string[]; // Backend snake_case fallback
}

export type SocialSource = 'reddit' | 'google' | 'instagram' | 'tiktok';

// ─── Chat / Conversation ────────────────────────────────────

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    placeResults?: Place[];        // Place cards embedded in AI response
    isStreaming?: boolean;
}

export interface ConversationSession {
    id: string;
    messages: ChatMessage[];
    createdAt: Date;
    lastActiveAt: Date;
}

// ─── LLM Types ───────────────────────────────────────────────

export interface DiscoveryIntent {
    type: 'discovery' | 'navigation' | 'comparison' | 'factual';
    filters: PlaceFilters;
    reasoning: string;
}

export interface PlaceFilters {
    category?: PlaceCategory;
    cuisine?: string;
    maxPrice?: number;           // 1-4
    ambiance?: string;
    maxDistance?: number;         // in meters
    openNow?: boolean;
    otherConstraints?: string[];
}

// ─── User / Preferences ─────────────────────────────────────

export interface UserProfile {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
    preferences: UserPreferences;
    regulars: string[];           // Place IDs visited 3+ times
}

export interface UserPreferences {
    cuisinePreferences: string[];
    cuisineAversions: string[];
    priceRange: { min: number; max: number };
    speedSensitivity: 'relaxed' | 'moderate' | 'fast';
    ambiancePreferences: string[];
    dietaryRestrictions: string[];
}

export interface MemoryFact {
    dimension: string;
    value: string;
    confidence: number;          // 0-1
    source: 'explicit' | 'implicit' | 'survey';
    createdAt: Date;
    lastUpdated: Date;
    decayWeight: number;
}

// ─── Navigation / Transport ─────────────────────────────────

export interface TransportOption {
    mode: TransportMode;
    estimatedCost: number | null;   // null = free (walking)
    estimatedMinutes: number;
    distanceKm: number;
    badge?: 'Best Value' | 'Fastest';
    deepLinkUrl?: string;
}

export type TransportMode = 'walk' | 'drive' | 'uber' | 'lyft' | 'transit';

// ─── Survey ─────────────────────────────────────────────────

export interface SurveyQuestion {
    id: string;
    type: 'emoji_scale' | 'binary' | 'chip_select';
    question: string;
    options?: string[];
}

export interface SurveyResponse {
    placeId: string;
    answers: { questionId: string; value: string | number }[];
    completedAt: Date;
}

// ─── Geo ─────────────────────────────────────────────────────

export interface LatLng {
    latitude: number;
    longitude: number;
}

export interface MapRegion extends LatLng {
    latitudeDelta: number;
    longitudeDelta: number;
}
