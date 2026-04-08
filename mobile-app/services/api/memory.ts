import apiClient from './client';

export interface MemoryFact {
  dimension: string;
  value: string;
  confidence: number;
  source: string;
  createdAt: string;
  lastUpdated: string;
  decayWeight: number;
}

export interface UserMemoryContext {
  cuisineLikes: string[];
  cuisineDislikes: string[];
  priceRange: { min: number; max: number };
  speedSensitivity: 'relaxed' | 'moderate' | 'fast';
  ambiancePreferences: string[];
  dietaryRestrictions: string[];
}

export interface UserMemoryResponse {
  preferences: UserMemoryContext;
  facts: MemoryFact[];
  fact_count: number;
}

export const memoryApi = {
  async getMemory(): Promise<UserMemoryResponse> {
    const response = await apiClient.get<{ data: UserMemoryResponse }>('/v1/user/memory');
    return response.data.data;
  },

  async getPreferences(): Promise<Array<{ dimension: string; value: string; confidence: number; last_updated: string }>> {
    const response = await apiClient.get<{ data: { preferences: Array<{ dimension: string; value: string; confidence: number; last_updated: string }> } }>('/v1/user/preferences');
    return response.data.data.preferences;
  },

  async deletePreference(dimension: string): Promise<void> {
    await apiClient.delete(`/v1/user/preferences/${encodeURIComponent(dimension)}`);
  },

  async updatePreference(dimension: string, value: string, confidence?: number): Promise<void> {
    await apiClient.post('/v1/user/preferences', {
      dimension,
      value,
      confidence: confidence ?? 0.7,
    });
  },
};
