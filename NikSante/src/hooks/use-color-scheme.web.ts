import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { useSettingsStore } from '@/store/settingsStore';

export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);
  const colorTheme  = useSettingsStore((s) => s.colorTheme);
  const colorScheme = useRNColorScheme();

  useEffect(() => { setHasHydrated(true); }, []);

  if (colorTheme !== 'system') return colorTheme;
  if (hasHydrated) return colorScheme ?? 'light';
  return 'light';
}
