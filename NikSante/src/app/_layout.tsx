/**
 * NikSanté — Root Layout
 *
 * Responsabilités :
 *  1. Initialise la session auth (initAuth) au démarrage de l'app
 *  2. Fournit le ThemeProvider (clair / sombre)
 *  3. Protège les routes (tabs) : redirige vers /login si non authentifié
 *
 * Pattern Expo Router :  _layout → Slot (rendu des routes enfants)
 */

import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ThemeProvider, DefaultTheme, DarkTheme } from 'expo-router';
import { useColorScheme, View, ActivityIndicator } from 'react-native';

import { useAuthStore }     from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router      = useRouter();
  const segments    = useSegments();

  const { isAuthenticated, isLoading, initAuth } = useAuthStore();
  const initSettings = useSettingsStore((s) => s.initSettings);

  // ── 1. Restaurer la session et les préférences au démarrage ──
  useEffect(() => {
    initAuth();
    initSettings();
  }, []);

  // ── 2. Garde de navigation ──
  // Dès que isLoading passe à false on sait si l'utilisateur est connecté.
  // Si non connecté et qu'il essaie d'accéder aux tabs → login.
  useEffect(() => {
    if (isLoading) return; // on attend la fin de l'init

    const inTabsGroup = segments[0] === '(tabs)';

    if (!isAuthenticated && inTabsGroup) {
      // Utilisateur non authentifié sur une route protégée
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, segments]);

  // ── 3. Écran de chargement pendant initAuth ──
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
        <ActivityIndicator size="large" color="#388E3C" />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
