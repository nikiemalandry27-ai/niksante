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

// ---------------------------------------------------------------------------
// Insulin Service
// ---------------------------------------------------------------------------

export type InsulinType = 'rapide' | 'lente' | 'premixte';

export interface InsulinEntry {
  id:             string;
  userId:         string;
  doseUnits:      number;
  type:           InsulinType;
  administeredAt: Date;
  note?:          string;
  productName?:   string;
  createdAt:      Date;
}

export const insulinService = {
  getAll: async (days = 30): Promise<InsulinEntry[]> => {
    const { data } = await api.get<InsulinEntry[]>(`/insulin?days=${days}`);
    return data;
  },

  add: async (
    doseUnits:      number,
    type:           InsulinType,
    administeredAt: Date,
    note?:          string,
    productName?:   string,
  ): Promise<InsulinEntry> => {
    const { data } = await api.post<InsulinEntry>('/insulin', {
      dose_units: doseUnits, type, administered_at: administeredAt, note,
      product_name: productName,
    });
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/insulin/${id}`);
  },
};

// ---------------------------------------------------------------------------
// Glycemic Analysis Service
// ---------------------------------------------------------------------------

export interface GlycemicResult {
  food:                  string;
  category_resolved:     string;
  category_description:  string;
  glycemic_index:        number;
  carbs_used:            number;
  glycemic_load:         number;
  label_carbs_per_100g:  number | null;
  label_sugars_per_100g: number | null;
  carbs_source:          'label_ocr' | 'category_db';
  extraction_source:     'label' | 'partial' | 'no_label';
  impact_mg_dl:          { min: number; max: number };
  impact_level:          'None' | 'Low' | 'Moderate' | 'High';
  confidence_score:      number;
  advice:                string;
}

export const glycemicService = {
  analyzeImage: async (
    imageBase64:        string,
    quantity_grams      = 150,
    diabetic            = true,
    insulin_sensitivity = 'normal',
  ): Promise<GlycemicResult> => {
    const { data } = await api.post<GlycemicResult>('/glycemic/analyze-image', {
      imageBase64,
      quantity_grams,
      diabetic,
      insulin_sensitivity,
    });
    return data;
  },
};

export default api;
