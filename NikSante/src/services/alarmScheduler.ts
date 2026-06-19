import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type AlarmSchedulerNative = {
  scheduleDaily(id: number, hour: number, minute: number, title: string, body: string): Promise<number>;
  cancelAlarm(id: number): Promise<void>;
  canScheduleExactAlarms(): Promise<boolean>;
  openExactAlarmSettings(): Promise<void>;
  isBatteryOptimizationIgnored(): Promise<boolean>;
  openBatteryOptimizationSettings(): Promise<void>;
};

const Native = requireOptionalNativeModule<AlarmSchedulerNative>('AlarmScheduler');

export const ALARM_IDS = {
  morning:   1001,
  afternoon: 1002,
  evening:   1003,
} as const;

export type AlarmKey = keyof typeof ALARM_IDS;

export const alarmScheduler = {
  scheduleDaily: async (id: number, hour: number, minute: number, title: string, body: string): Promise<number> => {
    if (Platform.OS !== 'android') return id;
    if (!Native) throw new Error('Module AlarmScheduler introuvable — build EAS requis.');
    return Native.scheduleDaily(id, hour, minute, title, body);
  },

  cancelAlarm: async (id: number): Promise<void> => {
    if (Platform.OS !== 'android' || !Native) return;
    return Native.cancelAlarm(id);
  },

  canScheduleExactAlarms: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    if (!Native) throw new Error('Module AlarmScheduler introuvable — build EAS requis.');
    return Native.canScheduleExactAlarms();
  },

  openExactAlarmSettings: async (): Promise<void> => {
    if (Platform.OS !== 'android' || !Native) return;
    return Native.openExactAlarmSettings();
  },

  isBatteryOptimizationIgnored: async (): Promise<boolean> => {
    if (Platform.OS !== 'android' || !Native) return true;
    return Native.isBatteryOptimizationIgnored();
  },

  openBatteryOptimizationSettings: async (): Promise<void> => {
    if (Platform.OS !== 'android' || !Native) return;
    return Native.openBatteryOptimizationSettings();
  },
};
