/**
 * NikSanté — Glucose Store (Zustand + AsyncStorage + API)
 *
 * Stratégie "local-first avec sync backend" :
 *  - initGlucose    : API en priorité → fallback AsyncStorage si réseau KO
 *  - addGlucose     : màj locale immédiate + sync API en arrière-plan
 *  - deleteGlucose  : màj locale immédiate + sync API en arrière-plan
 *  - clearHistory   : vide API + AsyncStorage (demande explicite de l'utilisateur)
 *  - resetLocalState: vide uniquement le state local + AsyncStorage (pour logout)
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { glucoseService } from '@/services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MealContext =
  | 'before_meal'
  | 'after_meal'
  | 'fasting'
  | 'bedtime'
  | 'sport'
  | null;

export const MEAL_CONTEXT_META: Record<
  NonNullable<MealContext>,
  { label: string; icon: string }
> = {
  before_meal: { label: 'Avant repas', icon: '🍽️' },
  after_meal:  { label: 'Après repas', icon: '✅' },
  fasting:     { label: 'À jeun',      icon: '💤' },
  bedtime:     { label: 'Coucher',     icon: '🌙' },
  sport:       { label: 'Sport',       icon: '🏃' },
};

export interface GlucoseEntry {
  id: string;
  value: number;
  date: Date;
  note?: string;
  mealContext?: MealContext;
}

interface GlucoseState {
  glucoseHistory:   GlucoseEntry[];
  latestGlucose:    GlucoseEntry | null;
  isLoadingHistory: boolean;

  initGlucose:     () => Promise<void>;
  addGlucose:      (value: number, date: Date, note?: string, mealContext?: MealContext) => Promise<void>;
  deleteGlucose:   (id: string) => void;
  clearHistory:    () => Promise<void>;
  resetLocalState: () => Promise<void>;
  getAverageGlucose: () => number;
}

// ---------------------------------------------------------------------------
// AsyncStorage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'niksante_glucose_history';

function serialize(history: GlucoseEntry[]): string {
  return JSON.stringify(history);
}

function deserialize(raw: string): GlucoseEntry[] {
  return (JSON.parse(raw) as Array<Omit<GlucoseEntry, 'date'> & { date: string }>)
    .map((e) => ({ ...e, date: new Date(e.date) }));
}

function normalizeEntry(e: GlucoseEntry & { date: Date | string }): GlucoseEntry {
  return { ...e, date: new Date(e.date) };
}

function persistAsync(history: GlucoseEntry[]) {
  AsyncStorage.setItem(STORAGE_KEY, serialize(history)).catch((err) =>
    console.warn('[GlucoseStore] Erreur AsyncStorage :', err)
  );
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useGlucoseStore = create<GlucoseState>((set, get) => ({
  glucoseHistory:   [],
  latestGlucose:    null,
  isLoadingHistory: false,

  // ── initGlucose ────────────────────────────────────────────────────────────
  // 1. Essaie de charger depuis l'API (source de vérité)
  // 2. Si réseau KO → charge depuis AsyncStorage (cache local)

  initGlucose: async () => {
    set({ isLoadingHistory: true });
    try {
      const raw = await glucoseService.getAll();
      const history = raw.map(normalizeEntry);
      set({ glucoseHistory: history, latestGlucose: history[0] ?? null });
      persistAsync(history);
    } catch {
      // Réseau indisponible → fallback cache local
      try {
        const cached = await AsyncStorage.getItem(STORAGE_KEY);
        if (cached) {
          const history = deserialize(cached);
          set({ glucoseHistory: history, latestGlucose: history[0] ?? null });
        }
      } catch (e) {
        console.warn('[GlucoseStore] Erreur chargement local :', e);
      }
    } finally {
      set({ isLoadingHistory: false });
    }
  },

  // ── addGlucose ─────────────────────────────────────────────────────────────
  // Mise à jour optimiste immédiate + sync backend en arrière-plan

  addGlucose: async (value, date, note, mealContext) => {
    const tempId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const optimistic: GlucoseEntry = {
      id:          tempId,
      value,
      date,
      note:        note?.trim() || undefined,
      mealContext: mealContext ?? null,
    };

    // Mise à jour immédiate dans le state
    set((state) => {
      const newHistory = [optimistic, ...state.glucoseHistory];
      persistAsync(newHistory);
      return { glucoseHistory: newHistory, latestGlucose: optimistic };
    });

    // Sync API : remplace l'entrée temporaire par celle du backend (avec le vrai id)
    try {
      const saved = await glucoseService.add(value, date, note, mealContext ?? null);
      const savedEntry = normalizeEntry(saved as GlucoseEntry & { date: Date | string });
      set((state) => {
        const newHistory = state.glucoseHistory.map((e) =>
          e.id === tempId ? savedEntry : e
        );
        persistAsync(newHistory);
        return { glucoseHistory: newHistory, latestGlucose: newHistory[0] ?? null };
      });
    } catch {
      console.warn('[GlucoseStore] Sync API échouée — données conservées localement');
    }
  },

  // ── deleteGlucose ──────────────────────────────────────────────────────────
  // Suppression locale immédiate + sync API en arrière-plan

  deleteGlucose: (id: string) => {
    set((state) => {
      const newHistory = state.glucoseHistory.filter((e) => e.id !== id);
      persistAsync(newHistory);
      return {
        glucoseHistory: newHistory,
        latestGlucose:  newHistory[0] ?? null,
      };
    });
    glucoseService.delete(id).catch(() =>
      console.warn('[GlucoseStore] Sync suppression API échouée')
    );
  },

  // ── clearHistory ───────────────────────────────────────────────────────────
  // Supprime les données sur le serveur ET en local.
  // À appeler uniquement quand l'utilisateur demande explicitement à vider son historique.

  clearHistory: async () => {
    try {
      await glucoseService.clearAll();
    } catch {
      console.warn('[GlucoseStore] Sync clearAll API échouée');
    }
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('[GlucoseStore] Erreur suppression AsyncStorage :', e);
    }
    set({ glucoseHistory: [], latestGlucose: null });
  },

  // ── resetLocalState ────────────────────────────────────────────────────────
  // Vide uniquement le state local et le cache AsyncStorage.
  // N'appelle PAS le serveur — les données restent en base.
  // À appeler lors de la déconnexion.

  resetLocalState: async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('[GlucoseStore] Erreur suppression AsyncStorage :', e);
    }
    set({ glucoseHistory: [], latestGlucose: null });
  },

  // ── getAverageGlucose ──────────────────────────────────────────────────────

  getAverageGlucose: () => {
    const { glucoseHistory } = get();
    if (glucoseHistory.length === 0) return 0;
    const sum = glucoseHistory.reduce((acc, e) => acc + e.value, 0);
    return Math.round(sum / glucoseHistory.length);
  },
}));
