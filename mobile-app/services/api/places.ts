import apiClient from './client';
import { Place, LatLng } from '../../types';

export interface NearbySearchResponse {
  data: {
    places: Place[];
    total: number;
    center: { lat: number; lng: number };
    radius: number;
  };
}

export const placesApi = {
  /**
   * Fetches personalized places nearby based on coordinates and optional category.
   */
  async searchNearby(params: {
    lat: number;
    lng: number;
    radius?: number;
    category?: string;
  }): Promise<Place[]> {
    const response = await apiClient.get<NearbySearchResponse>('/v1/places/nearby', {
      params,
    });
    return response.data.data.places;
  },

  /**
   * Fetches enriched details for a specific place.
   */
  async getPlaceDetails(id: string): Promise<Place> {
    const response = await apiClient.get<{ data: { place: Place } }>(`/v1/places/${id}`);
    return response.data.data.place;
  },

  /**
   * Natural language search for places.
   */
  async searchByText(query: string, location?: LatLng): Promise<Place[]> {
    const response = await apiClient.get<{ data: { places: Place[] } }>('/v1/places/search', {
      params: { query, lat: location?.latitude, lng: location?.longitude },
    });
    return response.data.data.places;
  },
};
