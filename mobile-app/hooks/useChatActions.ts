/**
 * Mapai — useChatActions hook
 *
 * Centralizes chat send logic, session management, and persistence.
 *
 * Persistence strategy (after backend fix):
 *   - The backend (POST /v1/chat/message) is the authoritative persistence layer.
 *     It creates a session if needed and saves both the user message AND the
 *     assistant response to chat_messages before returning.
 *   - The frontend no longer duplicates those persist calls. The only frontend
 *     responsibility is:
 *       1. Optimistically update local state for instant UI feedback.
 *       2. Pass the session_id to the backend so it uses the same session.
 *       3. Store the session_id returned by the backend (it may have created one).
 *
 * Session creation:
 *   - We no longer create a session ourselves with a pre-flight POST. Instead we
 *     send null as session_id on the first message and the backend creates the
 *     session atomically as part of the chat call. The returned session_id is
 *     stored in chatStore immediately so subsequent messages reuse it.
 *
 * Stale session:
 *   - If the last message in the current session is >30 min old, clear local
 *     state so the next send starts a fresh session (backend creates it).
 */

import { useCallback } from 'react';
import { useChatStore, ChatMessage } from '../store/chatStore';
import { useLocationStore } from '../store/locationStore';
import apiClient from '../services/api/client';
import { BACKEND_URL } from '@/constants/api';
const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export function useChatActions() {
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const store = useChatStore.getState();

    // Check if current session is stale (30 min since last message) and reset if so
    const lastMsg = store.messages[store.messages.length - 1];
    const isStale =
      lastMsg?.created_at &&
      Date.now() - new Date(lastMsg.created_at).getTime() > STALE_THRESHOLD_MS;

    if (isStale) {
      store.clearChat();
    }

    // Resolve current session_id (may be null — backend will create one)
    const sessionId = useChatStore.getState().currentSessionId;

    // 1. Optimistic local update
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    useChatStore.getState().addMessage(userMsg);
    useChatStore.getState().setLoading(true);

    try {
      // 2. Call AI endpoint
      //    The backend will:
      //      a. Create a session if session_id is null
      //      b. Persist the user message
      //      c. Call the LLM with full conversation history
      //      d. Persist the assistant response
      //      e. Return the response + the resolved session_id
      const location = useLocationStore.getState().coords;

      const res = await apiClient.post('/v1/chat/message', {
        message: trimmed,
        session_id: sessionId ?? undefined,
        location: {
          lat: location.latitude,
          lng: location.longitude,
        },
      });

      const data = res.data?.data ?? res.data;

      // 3. Store the session_id returned by the backend (may be newly created)
      const resolvedSessionId: string | null = data.session_id ?? sessionId;
      if (resolvedSessionId && resolvedSessionId !== sessionId) {
        useChatStore.getState().setCurrentSession(resolvedSessionId);
      }

      // 4. Parse and add AI response to local state
      const aiContent = data.reply ?? data.text ?? data.message ?? '(no response)';
      const places = Array.isArray(data.places) ? data.places.slice(0, 5) : [];

      const aiMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: aiContent,
        metadata: data.intent ? { intent: data.intent } : {},
        created_at: new Date().toISOString(),
        places,
      };
      useChatStore.getState().addMessage(aiMsg);

      return { text: aiContent, places, sessionId: resolvedSessionId };
    } catch (err: any) {
      const isNet =
        err.message?.includes('Network request failed') ||
        err.message?.includes('fetch failed');

      const errorMsg: ChatMessage = {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: isNet
          ? `Can't reach the backend.\n\nCheck that:\n• Backend is running (npm run dev)\n• EXPO_PUBLIC_BACKEND_URL is set\n• Current: ${BACKEND_URL}`
          : `Error: ${err.message}`,
        created_at: new Date().toISOString(),
      };
      useChatStore.getState().addMessage(errorMsg);

      console.warn('[Chat] sendMessage failed:', err.message);
      return null;
    } finally {
      useChatStore.getState().setLoading(false);
    }
  }, []);

  const startNewChat = useCallback(() => {
    useChatStore.getState().clearChat();
  }, []);

  /**
   * Load a past session from the backend and set it as the active session.
   * Called from chat-history.tsx when the user taps a session row.
   */
  const loadSession = useCallback(async (sessionId: string) => {
    try {
      const res = await apiClient.get(`/v1/chat/history/sessions/${sessionId}`);
      const data = res.data?.data ?? res.data;
      const messages: ChatMessage[] = (data.messages ?? []).map((m: any) => ({
        id: m.id || `msg-${Date.now()}-${Math.random()}`,
        role: m.role,
        content: m.content,
        metadata: m.metadata,
        created_at: m.created_at || new Date().toISOString(),
      }));

      useChatStore.getState().setCurrentSession(sessionId);
      useChatStore.getState().setMessages(messages);
    } catch (err) {
      console.warn('[Chat] Failed to load session:', err);
    }
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await apiClient.delete(`/v1/chat/history/sessions/${sessionId}`);
      // If the deleted session is the current one, clear chat
      if (useChatStore.getState().currentSessionId === sessionId) {
        useChatStore.getState().clearChat();
      }
    } catch (err) {
      console.warn('[Chat] Failed to delete session:', err);
    }
  }, []);

  return { sendMessage, startNewChat, loadSession, deleteSession };
}
