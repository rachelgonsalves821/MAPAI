import apiClient from './client';
import { LatLng } from '../../types';

export interface RouteOption {
  mode: 'walking' | 'transit' | 'cycling' | 'driving';
  duration: number; // in seconds
  distance: number; // in meters
  polyline: string;
  description: string;
}

export interface RoutesResponse {
  data: {
    routes: RouteOption[];
  };
}

export const navigationApi = {
  /**
   * Fetches multi-modal routes between two points.
   */
  async getRoutes(params: {
    origin_lat: number;
    origin_lng: number;
    dest_lat: number;
    dest_lng: number;
    place_id: string;
  }): Promise<RouteOption[]> {
    const response = await apiClient.get<RoutesResponse>('/v1/navigation/routes', {
      params,
    });
    return response.data.data.routes;
  },
};
