import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type MoodLevel = 1 | 2 | 3 | 4 | 5;

export const MOOD_META: Record<MoodLevel, { emoji: string; label: string; color: string }> = {
  1: { emoji: '😩', label: 'Très mal',  color: '#B71C1C' },
  2: { emoji: '😔', label: 'Pas bien',  color: '#F57C00' },
  3: { emoji: '😐', label: 'Neutre',    color: '#FBC02D' },
  4: { emoji: '😊', label: 'Bien',      color: '#66BB6A' },
  5: { emoji: '😄', label: 'Très bien', color: '#388E3C' },
};

export interface MoodEntry {
  id:    string;
  date:  string;
  mood:  MoodLevel;
  note?: string;
}

interface MoodState {
  entries:      MoodEntry[];
  initMood:     () => Promise<void>;
  addMood:      (mood: MoodLevel, note?: string) => void;
  getTodayMood: () => MoodEntry | null;
}

const STORAGE_KEY = 'niksante_mood_history';

export const useMoodStore = create<MoodState>((set, get) => ({
  entries: [],

  initMood: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) set({ entries: JSON.parse(raw) as MoodEntry[] });
    } catch (e) {
      console.warn('[MoodStore] Erreur chargement :', e);
    }
  },

  addMood: (mood, note) => {
    const today = new Date().toDateString();
    const entry: MoodEntry = {
      id:   String(Date.now()),
      date: new Date().toISOString(),
      mood,
      note: note?.trim() || undefined,
    };
    set((state) => {
      // Une seule entrée par jour — remplace si elle existe déjà
      const filtered = state.entries.filter(
        (e) => new Date(e.date).toDateString() !== today
      );
      const newEntries = [entry, ...filtered];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newEntries)).catch(() => {});
      return { entries: newEntries };
    });
  },

  getTodayMood: () => {
    const today = new Date().toDateString();
    return get().entries.find((e) => new Date(e.date).toDateString() === today) ?? null;
  },
}));
