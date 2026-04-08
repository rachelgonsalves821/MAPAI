/**
 * Mapai — useChatHistory hook
 *
 * Fetches the user's chat session history using React Query.
 * Returns sessions from the last 30 days, newest first.
 */

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/api/client';

export interface HistorySession {
  id: string;
  title?: string;
  summary?: string;
  message_count?: number;
  created_at: string;
  updated_at: string;
}

export function useChatHistory() {
  return useQuery({
    queryKey: ['chat', 'history'],
    queryFn: async (): Promise<HistorySession[]> => {
      const { data: json } = await apiClient.get('/v1/chat/history/sessions', {
        params: { limit: 50 },
      });
      const data = json.data ?? json;
      return data.sessions ?? data ?? [];
    },
    staleTime: 30_000, // re-fetch after 30 seconds
  });
}
