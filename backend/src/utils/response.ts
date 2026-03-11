/**
 * Mapai Backend — Response Envelope Helpers
 * Standard API response format per PRD §7.
 */

import { v4 as uuid } from 'uuid';

export interface ApiResponse<T> {
    data: T;
    meta: {
        request_id: string;
        timestamp: string;
    };
}

export interface ApiError {
    error: {
        type: string;
        title: string;
        status: number;
        detail?: string;
    };
    meta: {
        request_id: string;
        timestamp: string;
    };
}

/**
 * Wrap data in the standard Mapai API response envelope.
 */
export function envelope<T>(data: T): ApiResponse<T> {
    return {
        data,
        meta: {
            request_id: uuid(),
            timestamp: new Date().toISOString(),
        },
    };
}

/**
 * Create a standard error response.
 */
export function errorResponse(
    status: number,
    title: string,
    type: string = 'Error',
    detail?: string
): ApiError {
    return {
        error: { type, title, status, detail },
        meta: {
            request_id: uuid(),
            timestamp: new Date().toISOString(),
        },
    };
}
