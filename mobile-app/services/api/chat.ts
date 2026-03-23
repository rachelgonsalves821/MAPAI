import apiClient from './client';
import { Place, LatLng } from '../../types';

export interface ChatRequest {
  message: string;
  session_id: string;
  user_id: string;
  location?: LatLng;
}

export interface ChatResponse {
  data: {
    text: string;
    searchQuery?: string;
    discoveryIntent?: any;
    places?: Place[];
  };
}

export const chatApi = {
  /**
   * Sends a message to the AI Orchestrator.
   */
  async sendMessage(payload: ChatRequest): Promise<ChatResponse['data']> {
    const response = await apiClient.post<ChatResponse>('/v1/chat/message', payload);
    return response.data.data;
  },
};
