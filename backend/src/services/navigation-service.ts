/**
 * Mapai Backend — Navigation Service
 * Integration with Google Routes API for multi-modal travel options.
 * PRD §6.4: Multi-modal navigation (Walking, Transit, Driving, Cycling).
 */

import { config } from '../config.js';
import { getSupabase } from '../db/supabase-client.js';

interface RouteInput {
    origin: { latitude: number; longitude: number };
    destination: { latitude: number; longitude: number };
    userId: string;
    placeId: string;
}

interface RouteOption {
    mode: 'walking' | 'transit' | 'driving' | 'cycling';
    durationSeconds: number;
    distanceMeters: number;
    polyline: string;
    description: string;
}

export class NavigationService {
    /**
     * Get multi-modal routes to a destination.
     */
    async getRoutes(input: RouteInput): Promise<RouteOption[]> {
        const modes: Array<'walking' | 'transit' | 'driving' | 'cycling'> = [
            'walking',
            'transit',
            'driving',
            'cycling',
        ];

        // If no API key, return mock data for development
        if (!config.google.placesApiKey) {
            console.log('⚠️  GOOGLE_PLACES_API_KEY not set — returning mock navigation data');
            return this.getMockRoutes();
        }

        try {
            const results = await Promise.all(
                modes.map(mode => this.fetchRoute(input.origin, input.destination, mode))
            );

            const validRoutes = results.filter((r): r is RouteOption => r !== null);

            // Log navigation request to DB
            if (validRoutes.length > 0) {
                await this.logNavigation(input, validRoutes[0]); // Logging the first one as primary
            }

            return validRoutes;
        } catch (err) {
            console.error('Navigation service error:', err);
            return this.getMockRoutes();
        }
    }

    private async fetchRoute(
        origin: { latitude: number; longitude: number },
        destination: { latitude: number; longitude: number },
        mode: 'walking' | 'transit' | 'driving' | 'cycling'
    ): Promise<RouteOption | null> {
        const GOOGLE_ROUTES_API = 'https://routes.googleapis.com/directions/v2:computeRoutes';
        
        const routingPreference = mode === 'driving' ? 'TRAFFIC_AWARE' : 'ROUTING_PREFERENCE_UNSPECIFIED';
        const travelMode = mode === 'cycling' ? 'BICYCLE' : 
                          mode === 'walking' ? 'WALK' : 
                          mode === 'transit' ? 'TRANSIT' : 'DRIVE';

        const body = {
            origin: { location: { latLng: origin } },
            destination: { location: { latLng: destination } },
            travelMode,
            routingPreference,
            computeAlternativeRoutes: false,
            units: 'METRIC',
        };

        try {
            const response = await fetch(GOOGLE_ROUTES_API, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': config.google.placesApiKey,
                    'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) return null;

            const data = await response.json() as any;
            const route = data.routes?.[0];

            if (!route) return null;

            return {
                mode,
                durationSeconds: parseInt(route.duration.replace('s', '')),
                distanceMeters: route.distanceMeters,
                polyline: route.polyline.encodedPolyline,
                description: `${mode.charAt(0).toUpperCase() + mode.slice(1)}: ${Math.round(parseInt(route.duration.replace('s', '')) / 60)} mins`,
            };
        } catch {
            return null;
        }
    }

    private async logNavigation(input: RouteInput, primaryRoute: RouteOption): Promise<void> {
        const supabase = getSupabase();
        if (!supabase) return;

        await supabase.from('navigation_logs').insert({
            user_id: input.userId,
            place_id: input.placeId,
            mode: primaryRoute.mode,
            origin_lat: input.origin.latitude,
            origin_lng: input.origin.longitude,
            travel_time_seconds: primaryRoute.durationSeconds,
            distance_meters: primaryRoute.distanceMeters,
        } as any);
    }

    private getMockRoutes(): RouteOption[] {
        return [
            { mode: 'walking', durationSeconds: 600, distanceMeters: 800, polyline: '', description: 'Walking: 10 mins' },
            { mode: 'transit', durationSeconds: 900, distanceMeters: 2500, polyline: '', description: 'Transit: 15 mins (Orange Line)' },
            { mode: 'cycling', durationSeconds: 300, distanceMeters: 1200, polyline: '', description: 'Cycling: 5 mins' },
            { mode: 'driving', durationSeconds: 420, distanceMeters: 2000, polyline: '', description: 'Driving: 7 mins' },
        ];
    }
}
