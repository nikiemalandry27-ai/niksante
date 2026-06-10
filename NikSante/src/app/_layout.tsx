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

import { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ThemeProvider, DefaultTheme, DarkTheme } from 'expo-router';
import { useColorScheme, View, ActivityIndicator } from 'react-native';
import * as Notifications from 'expo-notifications';

import { useAuthStore }     from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import {
  registerForPushNotifications,
  sendTokenToBackend,
  handleUpdateNotification,
  handleNotificationResponse,
} from '@/services/notificationService';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router      = useRouter();
  const segments    = useSegments();

  const { isAuthenticated, isLoading, initAuth } = useAuthStore();
  const initSettings = useSettingsStore((s) => s.initSettings);

  const notifListenerRef    = useRef<Notifications.Subscription | null>(null);
  const notifResponseRef    = useRef<Notifications.Subscription | null>(null);

  // ── 1. Restaurer la session et les préférences au démarrage ──
  useEffect(() => {
    initAuth();
    initSettings();
  }, []);

  // ── 2. Notifications push ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    // Enregistre le token et l'envoie au backend
    registerForPushNotifications().then((token) => {
      if (token) sendTokenToBackend(token);
    });

    // Notif reçue en premier plan (app ouverte)
    notifListenerRef.current = Notifications.addNotificationReceivedListener(
      handleUpdateNotification
    );

    // Tap sur une notif depuis la barre système
    notifResponseRef.current = Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse
    );

    return () => {
      notifListenerRef.current?.remove();
      notifResponseRef.current?.remove();
    };
  }, [isAuthenticated]);

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
