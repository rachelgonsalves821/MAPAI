import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { placesApi } from './places';
import { chatApi, ChatRequest } from './chat';
import { navigationApi } from './navigation';
import { LatLng, Place } from '../../types';

/**
 * Hook for searching nearby places.
 * Used on the map view for initial discovery.
 */
export const useNearbyPlaces = (params: {
  lat: number;
  lng: number;
  radius?: number;
  category?: string;
}) => {
  return useQuery({
    queryKey: ['places', 'nearby', params],
    queryFn: () => placesApi.searchNearby(params),
    enabled: !!params.lat && !!params.lng,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });
};

/**
 * Hook for getting place details.
 */
export const usePlaceDetails = (placeId: string) => {
  return useQuery({
    queryKey: ['places', 'detail', placeId],
    queryFn: () => placesApi.getPlaceDetails(placeId),
    enabled: !!placeId,
    staleTime: 1000 * 60 * 10, // 10 minutes cache
  });
};

/**
 * Hook for natural language search queries.
 */
export const usePlacesByText = (query: string, location?: LatLng) => {
  return useQuery({
    queryKey: ['places', 'search', query, location],
    queryFn: () => placesApi.searchByText(query, location),
    enabled: query.trim().length > 2,
  });
};

/**
 * Hook for sending chat messages to the AI orchestrator.
 * It also populates the 'discovery' query data with suggested places.
 */
export const useSendMessage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ChatRequest) => chatApi.sendMessage(payload),
    onSuccess: (data) => {
      // If the AI suggests specific places, update the discovery cache
      if (data.places && data.places.length > 0) {
        queryClient.setQueryData(['places', 'discovery'], data.places);
      }
    },
  });
};

/**
 * Hook for accessing the current discovery results (populated by chat).
 */
export const useDiscoveryResults = () => {
  const queryClient = useQueryClient();
  return useQuery<Place[]>({
    queryKey: ['places', 'discovery'],
    queryFn: () => Promise.resolve([]), // Populated via manual cache update in useSendMessage
    staleTime: Infinity,
  });
};

/**
 * Hook for fetching routes between user and a destination.
 */
export const useRoutes = (params: {
  origin_lat: number | null;
  origin_lng: number | null;
  dest_lat: number;
  dest_lng: number;
  place_id: string;
}) => {
  return useQuery({
    queryKey: ['routes', params],
    queryFn: () => navigationApi.getRoutes(params as any),
    enabled: !!params.place_id && !!params.origin_lat && !!params.origin_lng,
  });
};
