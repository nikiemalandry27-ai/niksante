import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type GlucoseUnit  = 'mg_dl' | 'mmol_l';
export type ColorTheme   = 'light' | 'dark' | 'system';

interface SettingsState {
  glucoseUnit:    GlucoseUnit;
  colorTheme:     ColorTheme;
  initSettings:   () => Promise<void>;
  setGlucoseUnit: (unit: GlucoseUnit) => Promise<void>;
  setColorTheme:  (theme: ColorTheme) => Promise<void>;
}

const SETTINGS_KEY = '@niksante_settings';

export const useSettingsStore = create<SettingsState>((set) => ({
  glucoseUnit: 'mg_dl',
  colorTheme:  'system',

  initSettings: async () => {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.glucoseUnit) set({ glucoseUnit: saved.glucoseUnit });
        if (saved.colorTheme)  set({ colorTheme:  saved.colorTheme  });
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

  setColorTheme: async (theme: ColorTheme) => {
    set({ colorTheme: theme });
    try {
      const current = await AsyncStorage.getItem(SETTINGS_KEY);
      const parsed  = current ? JSON.parse(current) : {};
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...parsed, colorTheme: theme }));
    } catch {}
  },
}));
