import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type GlucoseUnit = 'mg_dl' | 'mmol_l';

interface SettingsState {
  glucoseUnit:    GlucoseUnit;
  initSettings:   () => Promise<void>;
  setGlucoseUnit: (unit: GlucoseUnit) => Promise<void>;
}

const SETTINGS_KEY = '@niksante_settings';

export const useSettingsStore = create<SettingsState>((set) => ({
  glucoseUnit: 'mg_dl',

  initSettings: async () => {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.glucoseUnit) set({ glucoseUnit: saved.glucoseUnit });
      }
    } catch {}
  },

  setGlucoseUnit: async (unit: GlucoseUnit) => {
    set({ glucoseUnit: unit });
    try {
      const current = await AsyncStorage.getItem(SETTINGS_KEY);
      const parsed  = current ? JSON.parse(current) : {};
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...parsed, glucoseUnit: unit }));
    } catch {}
  },
}));
