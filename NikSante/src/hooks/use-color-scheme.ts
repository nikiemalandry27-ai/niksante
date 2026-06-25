import { useColorScheme as useSystemColorScheme } from 'react-native';
import { useSettingsStore } from '@/store/settingsStore';

export function useColorScheme() {
  const colorTheme   = useSettingsStore((s) => s.colorTheme);
  const systemScheme = useSystemColorScheme();

  if (colorTheme === 'system') return systemScheme ?? 'light';
  return colorTheme;
}
