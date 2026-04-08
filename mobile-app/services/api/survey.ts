/**
 * Mapai — Survey & Check-In API Hooks
 * PRD §loyalty: QR check-in triggers a survey; responses feed
 * the AI preference engine and award loyalty points.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from './client';

// ─── Types ────────────────────────────────────────────────────

export interface SurveyQuestion {
  id: string;
  text: string;
  options: string[];
}

export interface Survey {
  id: string;
  placeId: string;
  placeName: string;
  pointsAwarded: number;
  questions: SurveyQuestion[];
}

export interface CheckInResult {
  success: boolean;
  pointsAwarded: number;
  newBalance: number;
  survey: Survey | null;
}

export interface SurveyResponse {
  questionId: string;
  answer: string;
}

// ─── Hooks ────────────────────────────────────────────────────

/**
 * Check in at a place.
 * Sends the raw QR string to the backend for HMAC signature validation.
 * On success the backend returns points awarded and an optional survey
 * to show the user. Invalidates loyalty queries so the balance card refreshes.
 */
export function useCheckIn() {
  const queryClient = useQueryClient();
  return useMutation<CheckInResult, Error, { placeId: string; qrData: string }>({
    mutationFn: ({ placeId, qrData }: { placeId: string; qrData: string }) =>
      apiClient
        .post(`/v1/loyalty/check-in/${placeId}`, { qr_data: qrData })
        .then((r) => r.data?.data ?? r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty'] });
    },
  });
}

/**
 * Fetch any pending survey that was not completed on a previous session.
 * Polled once on app foreground (30 s staleTime keeps it cheap).
 */
export function usePendingSurvey() {
  return useQuery<Survey | null>({
    queryKey: ['survey', 'pending'],
    queryFn: () =>
      apiClient
        .get('/v1/surveys/pending')
        .then((r) => r.data?.data?.survey ?? null),
    staleTime: 30_000,
    // Do not throw on 404 — simply return null
    retry: false,
  });
}

/**
 * Fetch aggregated survey stats for a place.
 * Used by the Community Insights card on the place detail screen.
 * staleTime of 60 s keeps it cheap — stats change slowly.
 */
export function usePlaceSurveyStats(placeId: string | undefined) {
  return useQuery({
    queryKey: ['survey-stats', placeId],
    queryFn: async () => {
      const res = await apiClient.get(`/v1/surveys/place/${placeId}/stats`);
      return res.data?.data ?? null;
    },
    enabled: !!placeId,
    staleTime: 60_000,
  });
}

/**
 * Submit survey responses.
 * Invalidates the pending-survey query (clears the banner) and loyalty
 * queries (balance may have increased after completion bonus).
 */
export function useSubmitSurvey() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { surveyId: string; responses: SurveyResponse[] }>({
    mutationFn: ({ surveyId, responses }) =>
      apiClient
        .post(`/v1/surveys/${surveyId}/submit`, { responses })
        .then(() => undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['survey', 'pending'] });
      queryClient.invalidateQueries({ queryKey: ['loyalty'] });
    },
  });
}
