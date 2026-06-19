import { NativeModules, Platform } from 'react-native';

const { AlarmScheduler } = NativeModules;

export const ALARM_IDS = {
  morning:   1001,
  afternoon: 1002,
  evening:   1003,
} as const;

export type AlarmKey = keyof typeof ALARM_IDS;

export const alarmScheduler = {
  scheduleDaily: async (id: number, hour: number, minute: number, title: string, body: string): Promise<number> => {
    if (Platform.OS !== 'android') return id;
    if (!AlarmScheduler) throw new Error('Module AlarmScheduler introuvable — build EAS requis.');
    return AlarmScheduler.scheduleDaily(id, hour, minute, title, body);
  },

  cancelAlarm: async (id: number): Promise<void> => {
    if (Platform.OS !== 'android' || !AlarmScheduler) return;
    return AlarmScheduler.cancelAlarm(id);
  },

  canScheduleExactAlarms: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    if (!AlarmScheduler) throw new Error('Module AlarmScheduler introuvable — build EAS requis.');
    return AlarmScheduler.canScheduleExactAlarms();
  },
};
