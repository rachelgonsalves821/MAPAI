import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, any>;
  created_at: string;
  places?: any[];
}

export interface ChatSession {
  id: string;
  title: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

interface ChatStore {
  currentSessionId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  sessions: ChatSession[];

  setCurrentSession: (id: string | null) => void;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  setLoading: (loading: boolean) => void;
  setSessions: (sessions: ChatSession[]) => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  currentSessionId: null,
  messages: [],
  isLoading: false,
  sessions: [],

  setCurrentSession: (id) => set({ currentSessionId: id }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message],
  })),
  setLoading: (isLoading) => set({ isLoading }),
  setSessions: (sessions) => set({ sessions }),
  clearChat: () => set({ currentSessionId: null, messages: [], isLoading: false }),
}));
