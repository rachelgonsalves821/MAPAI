import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { placesApi } from './places';
import { chatApi, ChatRequest } from './chat';
import { navigationApi } from './navigation';
import { memoryApi, UserMemoryResponse } from './memory';
import { showApiError, apiErrorEvents } from './errorHandler';
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

// ─── Recently Viewed Places ───────────────────────────────────────────────────

export interface RecentPlace {
  id: string;
  user_id: string;
  place_id: string;
  place_name?: string;
  latitude?: number;
  longitude?: number;
  category?: string;
  view_count: number;
  first_viewed_at: string;
  last_viewed_at: string;
}

/**
 * Fetches the current user's recently viewed places (up to 50, ordered by
 * recency). Used to populate the "Recently Viewed" section in the Social tab.
 */
export function useRecentPlacesViewed(limit = 20) {
  return useQuery<RecentPlace[]>({
    queryKey: ['social', 'recent-views', limit],
    queryFn: async () => {
      const res = await apiClient.get('/v1/social/recent-views', { params: { limit } });
      return (res.data?.data?.places ?? []) as RecentPlace[];
    },
    staleTime: 30_000,
    retry: 1,
  });
}

/**
 * Silently records that the current user viewed a place detail screen.
 * Returns a fire-and-forget mutation — errors are swallowed so they never
 * interrupt the user experience.
 */
export function useTrackPlaceView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      place_id: string;
      place_name?: string;
      latitude?: number;
      longitude?: number;
      category?: string;
    }) => apiClient.post('/v1/social/track-view', params),
    onSuccess: () => {
      // Invalidate so the "Recently Viewed" list refreshes on next render
      queryClient.invalidateQueries({ queryKey: ['social', 'recent-views'] });
    },
    onError: () => {
      // Silently swallow — view tracking is non-critical
    },
  });
}

// ─── Efficient Loved-Place Check ─────────────────────────────────────────────

/**
 * Checks whether the current user has loved a specific place.
 * Uses the dedicated /loved-places/check/:placeId endpoint which is a single
 * COUNT query — much faster than fetching the entire loved list.
 */
export function useIsPlaceLoved(placeId: string | undefined) {
  return useQuery<boolean>({
    queryKey: ['social', 'loved-check', placeId],
    queryFn: async () => {
      const res = await apiClient.get(`/v1/social/loved-places/check/${placeId}`);
      return (res.data?.data?.loved ?? false) as boolean;
    },
    enabled: !!placeId,
    staleTime: 60_000,
  });
}

/**
 * Toggle hook — loves or unloves a place and invalidates all related queries.
 * Accepts the full place metadata so it can be stored in user_loved_places.
 */
export function useLovePlaceToggle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      place_id: string;
      place_name?: string;
      currently_loved: boolean;
      rating?: number;
      one_line_review?: string;
      visibility?: 'public' | 'friends' | 'private';
      latitude?: number;
      longitude?: number;
    }) => {
      if (params.currently_loved) {
        return apiClient.delete(`/v1/social/loved-places/${params.place_id}`);
      }
      return apiClient.post('/v1/social/loved-places', {
        place_id: params.place_id,
        place_name: params.place_name,
        rating: params.rating,
        one_line_review: params.one_line_review,
        visibility: params.visibility ?? 'friends',
        location: params.latitude != null
          ? { latitude: params.latitude, longitude: params.longitude }
          : undefined,
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['social', 'loved-check', variables.place_id] });
      queryClient.invalidateQueries({ queryKey: ['social', 'loved-places'] });
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.error?.title
        ?? error?.message
        ?? 'Could not save loved place. Please try again.';
      console.error('[useLovePlaceToggle] mutation failed:', msg);
      // Emit a toast so the user sees the error
      apiErrorEvents.emit('toast', { message: msg, type: 'error' });
    },
  });
}

// ─── Friend Activity Feed ─────────────────────────────────────────────────────

export interface FeedItem {
  id: string;
  actor_id: string;
  actor_name?: string | null;
  actor_username?: string | null;
  actor_avatar_url?: string | null;
  activity_type: 'place_loved' | 'place_visited' | 'review_posted' | 'place_shared';
  place_id: string;
  place_name?: string;
  metadata?: {
    one_line_review?: string;
    rating?: number;
    [key: string]: unknown;
  };
  created_at: string;
}

export interface FeedPage {
  items: FeedItem[];
  count: number;
  next_cursor: string | null;
}

/**
 * Fetches the first page of the enriched friend activity feed.
 * The feed includes actor display names and avatar URLs in a single request.
 */
export function useFriendFeed(limit = 20) {
  return useQuery<FeedPage>({
    queryKey: ['social', 'feed', limit],
    queryFn: async () => {
      const res = await apiClient.get('/v1/social/feed', { params: { limit } });
      const d = res.data?.data ?? {};
      return {
        items: (d.items ?? []) as FeedItem[],
        count: d.count ?? 0,
        next_cursor: d.next_cursor ?? null,
      };
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function useLoyaltyBalance() {
  const { user } = useAuth();
  return useQuery<number>({
    queryKey: ['loyalty', 'balance', user?.id],
    queryFn: async () => {
      const res = await apiClient.get('/v1/loyalty/balance');
      return res.data?.data?.balance ?? 0;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
    retry: 1,
  });
}
