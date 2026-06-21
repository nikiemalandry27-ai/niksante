import { create } from 'zustand';
import { insulinService, InsulinEntry, InsulinType } from '@/services/api';

interface InsulinState {
  history:     InsulinEntry[];
  isLoading:   boolean;

  fetchHistory: (days?: number) => Promise<void>;
  addEntry:    (dose: number, type: InsulinType, date: Date, note?: string) => Promise<InsulinEntry>;
  deleteEntry: (id: string) => Promise<void>;

  getTodayTotals: () => Record<InsulinType, number>;
}

export const useInsulinStore = create<InsulinState>((set, get) => ({
  history:   [],
  isLoading: false,

  fetchHistory: async (days = 30) => {
    set({ isLoading: true });
    try {
      const data = await insulinService.getAll(days);
      set({ history: data });
    } catch {
      // silencieux si réseau KO
    } finally {
      set({ isLoading: false });
    }
  },

  addEntry: async (dose, type, date, note) => {
    const entry = await insulinService.add(dose, type, date, note);
    set(s => ({ history: [entry, ...s.history] }));
    return entry;
  },

  deleteEntry: async (id) => {
    await insulinService.delete(id);
    set(s => ({ history: s.history.filter(e => e.id !== id) }));
  },

  getTodayTotals: () => {
    const today = new Date().toISOString().split('T')[0];
    const totals: Record<InsulinType, number> = { rapide: 0, lente: 0, premixte: 0 };
    get().history.forEach(e => {
      if (new Date(e.administeredAt).toISOString().split('T')[0] === today) {
        totals[e.type] = (totals[e.type] ?? 0) + e.doseUnits;
      }
    });
    return totals;
  },
}));
