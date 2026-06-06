/**
 * NikSanté — Service API (Axios)
 *
 * Couche de service centralisée pour toutes les requêtes réseau.
 *
 * Structure :
 *  - api            : instance Axios configurée (base URL, timeout, headers)
 *  - authService    : login, register, logout
 *  - glucoseService : CRUD mesures de glycémie
 *  - foodService    : détection alimentaire IA
 */

import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { AuthUser, useAuthStore } from '@/store/authStore';
import { GlucoseEntry } from '@/store/glucoseStore';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api';

// ---------------------------------------------------------------------------
// Instance Axios
// ---------------------------------------------------------------------------

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Intercepteur : injecte le Bearer token dans chaque requête
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Intercepteur : gestion des erreurs réseau
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;

    if (status === 401) {
      // Ne pas déconnecter sur /auth/login ou /auth/register (401 = mauvais identifiants)
      const url = (error?.config?.url ?? '') as string;
      const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register');
      if (!isAuthEndpoint) {
        await useAuthStore.getState().logout();
      }
    }

    console.warn('[API] Erreur :', status, error?.message);
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// Auth Service
// ---------------------------------------------------------------------------

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export const authService = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const { data } = await api.post<LoginResponse>('/auth/login', { email, password });
    return data;
  },

  register: async (
    name: string,
    email: string,
    password: string,
  ): Promise<LoginResponse> => {
    const { data } = await api.post<LoginResponse>('/auth/register', { name, email, password });
    return data;
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },
};

// ---------------------------------------------------------------------------
// Glucose Service
// ---------------------------------------------------------------------------

export const glucoseService = {
  getAll: async (): Promise<GlucoseEntry[]> => {
    const { data } = await api.get<GlucoseEntry[]>('/glucose');
    return data;
  },

  add: async (
    value:        number,
    date:         Date,
    note?:        string,
    mealContext?: string | null,
  ): Promise<GlucoseEntry> => {
    const { data } = await api.post<GlucoseEntry>('/glucose', { value, date, note, mealContext });
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/glucose/${id}`);
  },

  clearAll: async (): Promise<void> => {
    await api.delete('/glucose');
  },
};

// ---------------------------------------------------------------------------
// Food Detection Service
// ---------------------------------------------------------------------------

export interface DetectedFood {
  name:        string;
  carbs:       number;
  gi:          number;
  calories:    number;
  proteins:    number;
  fats:        number;
  impact:      string;
  impactColor: string;
  tips:        string;
  confidence:  number;
  simulated:   boolean;
}

export const foodService = {
  detect: async (imageBase64: string): Promise<DetectedFood> => {
    const { data } = await api.post<DetectedFood>('/food/detect', { imageBase64 });
    return data;
  },
};

export default api;
