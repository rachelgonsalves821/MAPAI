/**
 * Mapai Backend — Places Service
 * Google Places API proxy with caching and personalization re-ranking.
 * PRD §6.2: Places Service with match scoring.
 */

import { config } from '../config.js';
import { getSupabase } from '../db/supabase-client.js';
import { UserMemoryContext } from './ai-orchestrator.js';

const PLACES_BASE = 'https://places.googleapis.com/v1/places';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// In-memory cache (Redis in production)
const placeCache = new Map<string, { data: any; ts: number }>();

interface SearchInput {
    query: string;
    location: { latitude: number; longitude: number };
    userId: string;
    userMemory: UserMemoryContext;
}

interface NearbyInput {
    location: { latitude: number; longitude: number };
    radius: number;
    category?: string;
    maxResults: number;
    userId: string;
    userMemory: UserMemoryContext;
}

export class PlacesService {
    /**
     * Text-based place search with personalization.
     */
    async search(input: SearchInput): Promise<any[]> {
        const cacheKey = `search:${input.query}:${input.location.latitude.toFixed(3)}`;
        const cached = placeCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
            return this.reRank(cached.data, input.userMemory);
        }

        try {
            const response = await fetch(`${PLACES_BASE}:searchText`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': config.google.placesApiKey,
                    'X-Goog-FieldMask':
                        'places.id,places.displayName,places.formattedAddress,places.location,' +
                        'places.rating,places.priceLevel,places.primaryType,places.photos,' +
                        'places.regularOpeningHours,places.websiteUri,places.nationalPhoneNumber',
                },
                body: JSON.stringify({
                    textQuery: input.query,
                    locationBias: {
                        circle: {
                            center: input.location,
                            radius: 5000,
                        },
                    },
                    maxResultCount: 10,
                }),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error(`[Places] Google text search error — status: ${response.status}, body: ${errorBody}`);
                return [];
            }

            const data = (await response.json()) as any;
            const places = (data.places || []).map((p: any) => this.mapGooglePlace(p));

            placeCache.set(cacheKey, { data: places, ts: Date.now() });
            return this.reRank(places, input.userMemory);
        } catch (err) {
            console.error('Places search error:', err);
            return [];
        }
    }

    /**
     * Nearby place search.
     */
    async searchNearby(input: NearbyInput): Promise<any[]> {
        const cacheKey = `nearby:${input.location.latitude.toFixed(3)}:${input.radius}:${input.category || ''}`;
        const cached = placeCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
            return this.reRank(cached.data, input.userMemory).slice(0, input.maxResults);
        }

        try {
            const includedTypes = input.category
                ? [input.category]
                : ['restaurant', 'cafe', 'bar', 'coffee_shop', 'bakery'];

            const response = await fetch(`${PLACES_BASE}:searchNearby`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': config.google.placesApiKey,
                    'X-Goog-FieldMask':
                        'places.id,places.displayName,places.formattedAddress,places.location,' +
                        'places.rating,places.priceLevel,places.primaryType,places.photos,' +
                        'places.regularOpeningHours',
                },
                body: JSON.stringify({
                    locationRestriction: {
                        circle: {
                            center: input.location,
                            radius: input.radius,
                        },
                    },
                    includedTypes,
                    maxResultCount: input.maxResults,
                }),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error(`[Places] Google nearby search error — status: ${response.status}, body: ${errorBody}`);
                return [];
            }

            const data = (await response.json()) as any;
            const places = (data.places || []).map((p: any) => this.mapGooglePlace(p));

            placeCache.set(cacheKey, { data: places, ts: Date.now() });
            return this.reRank(places, input.userMemory).slice(0, input.maxResults);
        } catch (err) {
            console.error('Nearby search error:', err);
            return [];
        }
    }

    /**
     * Get detailed place info.
     */
    async getDetails(
        placeId: string,
        userId: string,
        userMemory: UserMemoryContext
    ): Promise<any | null> {
            const cacheKey = `detail:${placeId}`;
        const cached = placeCache.get(cacheKey);
        
        let place: any;
        if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
            place = cached.data;
        } else {
            try {
                const response = await fetch(`${PLACES_BASE}/${placeId}`, {
                    headers: {
                        'X-Goog-Api-Key': config.google.placesApiKey,
                        'X-Goog-FieldMask':
                            'id,displayName,formattedAddress,location,rating,priceLevel,' +
                            'primaryType,photos,regularOpeningHours,websiteUri,nationalPhoneNumber,' +
                            'editorialSummary,reviews',
                    },
                });

                if (!response.ok) return null;

                const raw = await response.json();
                place = this.mapGooglePlace(raw);
                placeCache.set(cacheKey, { data: place, ts: Date.now() });
            } catch (err) {
                console.error('Place details error:', err);
                return null;
            }
        }

        // Fetch social signals from Supabase
        const socialSignals = await this.getSocialSignals(placeId);

        return {
            ...place,
            ...this.scorePlace(place, userMemory),
            socialSignals,
        };
    }

    /**
     * Map Google Places API response to Mapai's internal schema.
     */
    private mapGooglePlace(raw: any): any {
        const priceLevelMap: Record<string, number> = {
            PRICE_LEVEL_FREE: 0,
            PRICE_LEVEL_INEXPENSIVE: 1,
            PRICE_LEVEL_MODERATE: 2,
            PRICE_LEVEL_EXPENSIVE: 3,
            PRICE_LEVEL_VERY_EXPENSIVE: 4,
        };

        return {
            id: raw.id || '',
            name: raw.displayName?.text || '',
            address: raw.formattedAddress || '',
            location: raw.location || { latitude: 0, longitude: 0 },
            rating: raw.rating || 0,
            priceLevel: priceLevelMap[raw.priceLevel] ?? 2,
            category: raw.primaryType || 'restaurant',
            photos: (raw.photos || []).map((p: any) => p.name),
            openNow: raw.regularOpeningHours?.openNow,
            hours: raw.regularOpeningHours?.weekdayDescriptions || [],
            website: raw.websiteUri || '',
            phoneNumber: raw.nationalPhoneNumber || '',
            editorialSummary: raw.editorialSummary?.text || '',
        };
    }

    /**
     * Re-rank places based on user preferences.
     * Deterministic heuristic scoring (fast, no LLM call).
     */
    private reRank(places: any[], memory: UserMemoryContext): any[] {
        return places
            .map((place) => ({
                ...place,
                ...this.scorePlace(place, memory),
            }))
            .sort((a, b) => b.matchScore - a.matchScore);
    }

    /**
     * Score a single place against user preferences.
     */
    private scorePlace(
        place: any,
        memory: UserMemoryContext
    ): { matchScore: number; matchReasons: string[] } {
        let score = 50;
        const reasons: string[] = [];

        // Category matching
        const category = (place.category || '').toLowerCase();
        const likes = memory.cuisineLikes.map((c) => c.toLowerCase());
        const dislikes = memory.cuisineDislikes.map((c) => c.toLowerCase());

        if (likes.some((l) => category.includes(l) || l.includes(category))) {
            score += 20;
            reasons.push(`Matches your taste for ${memory.cuisineLikes[0]}`);
        }
        if (dislikes.some((d) => category.includes(d) || d.includes(category))) {
            score -= 25;
            reasons.push('May not match your preferences');
        }

        // Price
        if (place.priceLevel >= memory.priceRange.min && place.priceLevel <= memory.priceRange.max) {
            score += 10;
            reasons.push('In your price comfort zone');
        } else if (place.priceLevel > memory.priceRange.max) {
            score -= 10;
            reasons.push('Above your typical budget');
        }

        // Rating
        if (place.rating >= 4.3) {
            score += 10;
            reasons.push(`Highly rated at ${place.rating}★`);
        }

        // Open now
        if (place.openNow) score += 5;

        score = Math.max(0, Math.min(100, score));
        return {
            matchScore: score,
            matchReasons: reasons.length > 0 ? reasons.slice(0, 2) : ['Nearby option'],
        };
    }

    /**
     * Fetch social signals (Reddit/IG/Google) from Supabase for a specific place.
     */
    private async getSocialSignals(googlePlaceId: string): Promise<any[]> {
        const supabase = getSupabase();
        if (!supabase) return [];

        try {
            // First, get our internal place ID
            const { data: placeData } = await supabase
                .from('places')
                .select('id')
                .eq('google_place_id', googlePlaceId)
                .maybeSingle();

            if (!placeData) return [];

            const internalId = (placeData as any).id;

            const { data: signals, error } = await supabase
                .from('social_signals')
                .select('*')
                .eq('place_id', internalId)
                .order('created_at', { ascending: false })
                .limit(5);

            if (error) throw error;
            return signals || [];
        } catch (err) {
            console.error('Error fetching social signals:', err);
            return [];
        }
    }
}
