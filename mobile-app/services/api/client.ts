import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3001';

const apiClient: AxiosInstance = axios.create({
  baseURL: BACKEND_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const setAuthToken = async (token: string) => {
  await AsyncStorage.setItem('auth_token', token);
};

// Request Interceptor: prefer Supabase session token (auto-refreshed), fallback to stored token
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
      } else {
        const token = await AsyncStorage.getItem('auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
    } catch (error) {
      console.error('Error retrieving auth token:', error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Global Error Handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response ? error.response.status : null;

    if (status === 401) {
      console.warn('Unauthorized access - token may be invalid or expired');
      // Potential trigger for logout or token refresh logic
    } else if (status === 404) {
      console.error('Resource not found:', error.config?.url);
    } else if (status && status >= 500) {
      console.error('Server error reported by Mapai Backend');
    }

    return Promise.reject(error);
  }
);

export default apiClient;
