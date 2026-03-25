import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3001';

const apiClient: AxiosInstance = axios.create({
  baseURL: BACKEND_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Set the auth token for all API requests.
 * Called from AuthContext when Clerk provides a token.
 */
let _authToken: string | null = null;
export function setApiAuthToken(token: string | null) {
  _authToken = token;
}

// Request interceptor: inject auth token
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      // Use Clerk token if set
      if (_authToken) {
        config.headers.Authorization = `Bearer ${_authToken}`;
        return config;
      }

      // Fallback: stored token (dev mode / guest)
      const token = await AsyncStorage.getItem('auth_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error retrieving auth token:', error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: global error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response ? error.response.status : null;

    if (status === 401) {
      console.warn('Unauthorized access - token may be invalid or expired');
    } else if (status === 404) {
      console.error('Resource not found:', error.config?.url);
    } else if (status && status >= 500) {
      console.error('Server error reported by Mapai Backend');
    }

    return Promise.reject(error);
  }
);

export default apiClient;
