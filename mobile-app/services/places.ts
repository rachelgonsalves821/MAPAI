import { Place, PlaceCategory, LatLng } from '../types';
import { placesApi } from './api/places';

/**
 * @deprecated Use services/api/places.ts for backend-enriched data.
 * This service now proxies to the Mapai Backend.
 */

export async function searchNearbyPlaces(params: any = {}): Promise<Place[]> {
    console.warn('searchNearbyPlaces is deprecated. Use useNearbyPlaces hook or placesApi.');
    return placesApi.searchNearby({
        lat: params.location?.latitude || 42.3601,
        lng: params.location?.longitude || -71.0589,
        radius: params.radius || 3000,
        category: params.category
    });
}

export async function getPlaceDetails(placeId: string): Promise<Place | null> {
    console.warn('getPlaceDetails is deprecated. Use usePlaceDetails hook or placesApi.');
    return placesApi.getPlaceDetails(placeId);
}

export async function searchPlacesByText(query: string, location?: LatLng): Promise<Place[]> {
    console.warn('searchPlacesByText is deprecated. Use placesApi.searchByText.');
    return placesApi.searchByText(query, location);
}

export function getPlacePhotoUrl(photoReference: string, maxWidth: number = 400): string {
    // Photos still need direct Google access for now or backend proxy
    const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';
    return `https://places.googleapis.com/v1/${photoReference}/media?maxWidthPx=${maxWidth}&key=${API_KEY}`;
}
