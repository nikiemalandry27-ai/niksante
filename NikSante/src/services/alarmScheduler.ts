import { NativeModules, Platform } from 'react-native';

const { AlarmScheduler } = NativeModules;

export const ALARM_IDS = {
  morning:   1001,
  afternoon: 1002,
  evening:   1003,
} as const;

export type AlarmKey = keyof typeof ALARM_IDS;

export const alarmScheduler = {
  scheduleDaily: (id: number, hour: number, minute: number, title: string, body: string): Promise<number> => {
    if (Platform.OS !== 'android' || !AlarmScheduler) return Promise.resolve(id);
    return AlarmScheduler.scheduleDaily(id, hour, minute, title, body);
  },

  cancelAlarm: (id: number): Promise<void> => {
    if (Platform.OS !== 'android' || !AlarmScheduler) return Promise.resolve();
    return AlarmScheduler.cancelAlarm(id);
  },

  canScheduleExactAlarms: (): Promise<boolean> => {
    if (Platform.OS !== 'android' || !AlarmScheduler) return Promise.resolve(true);
    return AlarmScheduler.canScheduleExactAlarms();
  },
};
