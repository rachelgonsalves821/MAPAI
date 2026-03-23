/**
 * Mapai — Centralized API Service
 * Communicates with the Mapai Backend (Express/Fastify).
 * Handles authentication, chat, discovery, and navigation.
 */

import { ChatMessage, Place, LatLng } from '../types';
import apiClient from './api/client';

export interface ChatResponse {
    text: string;
    searchQuery?: string;
    discoveryIntent?: any;
    places?: Place[];
}

export const MapaiAPI = {
    /**
     * Sends a message to the AI Orchestrator on the backend.
     */
    async sendMessage(
        text: string,
        sessionId: string,
        userId: string,
        location?: LatLng
    ): Promise<ChatResponse> {
        try {
            const response = await apiClient.post<ChatResponse>('/v1/chat/message', {
                message: text,
                session_id: sessionId,
                user_id: userId,
                location,
            });
            return response.data;
        } catch (error) {
            console.error('API Error (sendMessage):', error);
            return { text: "I'm having trouble connecting to the brain. Please check your connection." };
        }
    },

    /**
     * Fetches places based on search or discovery intent.
     */
    async searchPlaces(query: string, location?: LatLng): Promise<Place[]> {
        try {
            const response = await apiClient.post<{ places: Place[] }>('/v1/places/search', { 
                query, 
                location 
            });
            return response.data.places || [];
        } catch (error) {
            console.error('API Error (searchPlaces):', error);
            return [];
        }
    },

    /**
     * Calculates routes between two points.
     */
    /**
     * Calculates multi-modal routes between two points.
     */
    async getRoutes(
        origin: LatLng,
        destination: LatLng,
        placeId: string
    ) {
        try {
            const response = await apiClient.get('/v1/navigation/routes', {
                params: {
                    origin_lat: origin.latitude,
                    origin_lng: origin.longitude,
                    dest_lat: destination.latitude,
                    dest_lng: destination.longitude,
                    place_id: placeId
                }
            });
            return response.data.data?.routes || [];
        } catch (error) {
            console.error('API Error (getRoutes):', error);
            return [];
        }
    },

    /**
     * Submits survey feedback for a visit.
     */
    async submitSurvey(visitId: string, rating: number, comment: string) {
        try {
            const response = await apiClient.post('/v1/user/survey', { 
                visitId, 
                rating, 
                comment 
            });
            return response.status === 200 || response.status === 201;
        } catch (error) {
            console.error('API Error (submitSurvey):', error);
            return false;
        }
    }
};
