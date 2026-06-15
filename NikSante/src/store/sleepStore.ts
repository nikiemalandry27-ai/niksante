import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SleepQuality = 1 | 2 | 3 | 4 | 5;

export const SLEEP_QUALITY_META: Record<SleepQuality, { label: string; emoji: string; color: string }> = {
  1: { label: 'Mauvais',   emoji: '😴', color: '#B71C1C' },
  2: { label: 'Passable',  emoji: '😐', color: '#F57C00' },
  3: { label: 'Correct',   emoji: '😊', color: '#FBC02D' },
  4: { label: 'Bon',       emoji: '😄', color: '#388E3C' },
  5: { label: 'Excellent', emoji: '🌟', color: '#1565C0' },
};

export type WakeFeeling = 1 | 2 | 3 | 4 | 5;

export const WAKE_FEELING_META: Record<WakeFeeling, { label: string; emoji: string; color: string }> = {
  1: { label: 'Épuisé',    emoji: '😵', color: '#B71C1C' },
  2: { label: 'Fatigué',   emoji: '😞', color: '#F57C00' },
  3: { label: 'Normal',    emoji: '😐', color: '#FBC02D' },
  4: { label: 'Reposé',    emoji: '🙂', color: '#388E3C' },
  5: { label: 'Top forme', emoji: '🤩', color: '#1565C0' },
};

export interface SleepEntry {
  id:           string;
  date:         string;    // YYYY-MM-DD
  bedTime:      string;    // HH:MM (24h)
  wakeTime:     string;    // HH:MM (24h)
  duration:     number;    // heures (calculé)
  quality:      SleepQuality;
  wakeFeeling?: WakeFeeling; // énergie ressentie au réveil
  notes?:       string;
}

interface SleepState {
  entries: SleepEntry[];

  initSleep:          () => Promise<void>;
  addSleep:           (entry: Omit<SleepEntry, 'id'>) => Promise<void>;
  deleteSleep:        (id: string) => Promise<void>;
  getTodaySleep:      () => SleepEntry | null;
  getRecentEntries:   (days: number) => SleepEntry[];
  getAverageDuration: () => number;
  getSleepRegularity: () => number; // 0–100 (100 = très régulier)
  resetLocalState:    () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'niksante_sleep_history';

function persistAsync(entries: SleepEntry[]) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries)).catch(() => {});
}

export function computeSleepDuration(bedTime: string, wakeTime: string): number {
  const [bH, bM] = bedTime.split(':').map(Number);
  const [wH, wM] = wakeTime.split(':').map(Number);
  let bed  = bH * 60 + bM;
  let wake = wH * 60 + wM;
  if (wake <= bed) wake += 24 * 60; // nuit franchissant minuit
  return Math.round((wake - bed) / 60 * 10) / 10;
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSleepStore = create<SleepState>((set, get) => ({
  entries: [],

  initSleep: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) set({ entries: JSON.parse(raw) as SleepEntry[] });
    } catch (e) {
      console.warn('[SleepStore] Erreur chargement :', e);
    }
  },

  addSleep: async (entry) => {
    const newEntry: SleepEntry = { ...entry, id: `sleep_${Date.now()}` };
    set((state) => {
      // Une seule entrée par jour — on remplace si elle existe
      const filtered  = state.entries.filter(e => e.date !== entry.date);
      const newEntries = [newEntry, ...filtered].slice(0, 90); // 90 jours max
      persistAsync(newEntries);
      return { entries: newEntries };
    });
  },

  deleteSleep: async (id) => {
    set((state) => {
      const newEntries = state.entries.filter(e => e.id !== id);
      persistAsync(newEntries);
      return { entries: newEntries };
    });
  },

  getTodaySleep: () => {
    const today = todayStr();
    return get().entries.find(e => e.date === today) ?? null;
  },

  getRecentEntries: (days) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    return get().entries.filter(e => e.date >= cutoffStr);
  },

  getAverageDuration: () => {
    const recent = get().getRecentEntries(7);
    if (recent.length === 0) return 0;
    const sum = recent.reduce((a, b) => a + b.duration, 0);
    return Math.round((sum / recent.length) * 10) / 10;
  },

  getSleepRegularity: () => {
    const recent = get().getRecentEntries(7);
    if (recent.length < 2) return 100;
    const bedMinutes = recent.map(e => {
      const [h, m] = e.bedTime.split(':').map(Number);
      return h * 60 + m;
    });
    const mean     = bedMinutes.reduce((a, b) => a + b, 0) / bedMinutes.length;
    const variance = bedMinutes.reduce((s, v) => s + (v - mean) ** 2, 0) / bedMinutes.length;
    const std      = Math.sqrt(variance);
    return Math.round(Math.max(0, 100 - (std / 120) * 100));
  },

  resetLocalState: async () => {
    try { await AsyncStorage.removeItem(STORAGE_KEY); } catch {}
    set({ entries: [] });
  },
}));
