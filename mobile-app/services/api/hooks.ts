import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { placesApi } from './places';
import { chatApi, ChatRequest } from './chat';
import { navigationApi } from './navigation';
import { memoryApi, UserMemoryResponse } from './memory';
import { showApiError } from './errorHandler';
import { LatLng, Place } from '../../types';
import { useAuth } from '../../context/AuthContext';
import apiClient from './client';

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
    retry: 1,
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
    retry: 1,
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
    onError: (error: any) => {
      showApiError(error);
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
 * Hook for fetching the user's memory profile (preferences + learned facts).
 * Only runs when the user is authenticated and not in guest mode.
 */
export const useUserMemory = () => {
  const { user } = useAuth();
  const isAuthenticated = !!user && !user.isGuest;

  return useQuery<UserMemoryResponse>({
    queryKey: ['user', 'memory'],
    queryFn: () => memoryApi.getMemory(),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
    retry: 1,
  });
};

/**
 * Hook for deleting a single preference dimension.
 */
export function useDeletePreference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dimension: string) => memoryApi.deletePreference(dimension),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'memory'] });
    },
  });
}

/**
 * Hook for upserting a single preference dimension.
 */
export function useUpdatePreference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dimension, value, confidence }: { dimension: string; value: string; confidence?: number }) =>
      memoryApi.updatePreference(dimension, value, confidence),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'memory'] });
    },
  });
}

/**
 * Hook for fetching a user's loved places list.
 * Works for both the current user and any other user (for social features).
 * The backend respects privacy settings when viewerId !== userId.
 *
 * Response shape: { data: { places: LovedPlace[], count: number } }
 */
export function useLovedPlaces(userId?: string) {
  return useQuery({
    queryKey: ['social', 'loved-places', userId],
    queryFn: () =>
      apiClient
        .get(`/v1/social/loved-places/${userId}`)
        .then((r) => r.data?.data ?? r.data),
    enabled: !!userId,
    staleTime: 60_000,
  });
}

/**
 * Hook for removing a place from the user's loved places list.
 * Invalidates all loved-places queries on success so every consumer refreshes.
 */
export function useUnlovePlace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) =>
      apiClient.delete(`/v1/social/loved-places/${placeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social', 'loved-places'] });
    },
  });
}

/**
 * Hook for fetching enriched data for 2–4 places to display side-by-side
 * on the Comparison screen. The query is keyed on the sorted place ID list
 * so reordering the array does not cause a refetch.
 */
export function useComparePlaces(placeIds: string[]) {
  return useQuery({
    queryKey: ['places', 'compare', ...([...placeIds].sort())],
    queryFn: async () => {
      const res = await apiClient.post('/v1/places/compare', { place_ids: placeIds });
      return (res.data?.data?.places ?? []) as Place[];
    },
    enabled: placeIds.length >= 2,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}

/**
 * Hook for fetching a personalized "Why this?" explanation for a place.
 * Enabled lazily — only fires when the user taps "Why this?".
 * Caches for 5 minutes so repeated taps do not re-fetch.
 */
export function useWhyThis(placeId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['places', 'why', placeId],
    queryFn: async () => {
      const res = await apiClient.get(`/v1/places/${placeId}/why`);
      return res.data?.data ?? res.data;
    },
    enabled: !!placeId && enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry LLM-dependent endpoints
  });
}

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
