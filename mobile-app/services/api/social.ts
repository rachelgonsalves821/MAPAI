/**
 * Mapai — Social API Hooks
 * React Query hooks for all friend / social operations.
 *
 * Endpoint contracts (verified against backend source):
 *   GET  /v1/social/search?q=       → { data: { users: User[] } }
 *   POST /v1/social/request          body: { to_user_id }  (UUID)
 *   GET  /v1/social/requests         → { data: { incoming: Request[], outgoing: Request[] } }
 *   PUT  /v1/social/request/:id      body: { status: 'accepted' | 'rejected' }
 *   GET  /v1/social/friends          → { data: { friends: Friend[], count: number } }
 *   GET  /v1/social/status/:targetId → { data: { status: FriendshipStatus } }
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from './client';

// ─── Types ──────────────────────────────────────────────────────────────────

export type FriendshipStatus =
  | 'none'
  | 'friends'
  | 'pending_outgoing'
  | 'pending_incoming'
  | 'blocked'
  | 'self';

export interface SocialUser {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

export interface FriendRequest {
  id: string;
  status: string;
  created_at: string;
  /** Present on incoming requests */
  from_user?: SocialUser;
  /** Present on outgoing requests */
  to_user?: SocialUser;
}

export interface FriendEntry {
  friend_id: string;
  created_at: string;
  friend: SocialUser;
}

// ─── Search users ────────────────────────────────────────────────────────────

/**
 * Search for users by display name or username.
 * Uses /v1/social/search which returns { users: SocialUser[] }.
 * Only fires when query has 2+ characters.
 */
export function useSearchUsers(query: string) {
  return useQuery<SocialUser[]>({
    queryKey: ['social', 'search', query],
    queryFn: async () => {
      const res = await apiClient.get('/v1/social/search', {
        params: { q: query.trim() },
      });
      // Response envelope: { data: { users: [...] } }
      return (res.data?.data?.users ?? []) as SocialUser[];
    },
    enabled: query.trim().length >= 2,
    staleTime: 30_000,
    retry: 1,
  });
}

// ─── Friendship status ────────────────────────────────────────────────────────

/**
 * Get the friendship status between the current user and a target.
 * Possible values: 'none' | 'friends' | 'pending_outgoing' | 'pending_incoming' | 'blocked' | 'self'
 */
export function useFriendshipStatus(targetId: string) {
  return useQuery<FriendshipStatus>({
    queryKey: ['social', 'status', targetId],
    queryFn: async () => {
      const res = await apiClient.get(`/v1/social/status/${targetId}`);
      return (res.data?.data?.status ?? 'none') as FriendshipStatus;
    },
    enabled: !!targetId,
    staleTime: 30_000,
    retry: 1,
  });
}

// ─── Send friend request ──────────────────────────────────────────────────────

/**
 * Send a friend request to another user.
 * Body: { to_user_id: string }  — backend validates this is a UUID.
 */
export function useSendFriendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (toUserId: string) =>
      apiClient.post('/v1/social/request', { to_user_id: toUserId }),
    onSuccess: (_data, toUserId) => {
      // Invalidate requests list and the specific status for this user
      queryClient.invalidateQueries({ queryKey: ['social', 'requests'] });
      queryClient.invalidateQueries({ queryKey: ['social', 'status', toUserId] });
      // Optimistically set status to pending_outgoing so the UI updates immediately
      queryClient.setQueryData<FriendshipStatus>(
        ['social', 'status', toUserId],
        'pending_outgoing'
      );
    },
  });
}

// ─── Friend requests list ────────────────────────────────────────────────────

/**
 * Fetch all pending friend requests for the current user.
 * Returns { incoming: FriendRequest[], outgoing: FriendRequest[] }.
 */
export function useFriendRequests() {
  return useQuery<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>({
    queryKey: ['social', 'requests'],
    queryFn: async () => {
      const res = await apiClient.get('/v1/social/requests');
      const data = res.data?.data ?? {};
      return {
        incoming: (data.incoming ?? []) as FriendRequest[],
        outgoing: (data.outgoing ?? []) as FriendRequest[],
      };
    },
    staleTime: 30_000,
    retry: 1,
  });
}

// ─── Respond to friend request ────────────────────────────────────────────────

/**
 * Accept or reject a pending friend request.
 * Body: { status: 'accepted' | 'rejected' }
 */
export function useRespondToFriendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      status,
    }: {
      requestId: string;
      status: 'accepted' | 'rejected';
    }) => apiClient.put(`/v1/social/request/${requestId}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social', 'requests'] });
      queryClient.invalidateQueries({ queryKey: ['social', 'friends'] });
    },
  });
}

// ─── Friends list ────────────────────────────────────────────────────────────

/**
 * Fetch the current user's friends list.
 */
export function useFriends() {
  return useQuery<FriendEntry[]>({
    queryKey: ['social', 'friends'],
    queryFn: async () => {
      const res = await apiClient.get('/v1/social/friends');
      return (res.data?.data?.friends ?? []) as FriendEntry[];
    },
    staleTime: 60_000,
    retry: 1,
  });
}
