import { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ThemeProvider, DefaultTheme, DarkTheme } from 'expo-router';
import { useColorScheme, View, ActivityIndicator } from 'react-native';

import { useAuthStore }     from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import {
  registerForPushNotifications,
  sendTokenToBackend,
  handleUpdateNotification,
  handleNotificationResponse,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
} from '@/services/notificationService';

type Subscription = { remove: () => void } | null;

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router      = useRouter();
  const segments    = useSegments();

  const { isAuthenticated, isLoading, initAuth } = useAuthStore();
  const initSettings = useSettingsStore((s) => s.initSettings);

  const notifListenerRef  = useRef<Subscription>(null);
  const notifResponseRef  = useRef<Subscription>(null);

  // ── 1. Init session + préférences ────────────────────────────────────────
  useEffect(() => {
    initAuth();
    initSettings();
  }, []);

  // ── 2. Notifications push (désactivé dans Expo Go) ───────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    registerForPushNotifications().then((token) => {
      if (token) sendTokenToBackend(token);
    });

    notifListenerRef.current  = addNotificationReceivedListener(handleUpdateNotification);
    notifResponseRef.current  = addNotificationResponseReceivedListener(handleNotificationResponse);

    return () => {
      notifListenerRef.current?.remove();
      notifResponseRef.current?.remove();
    };
  }, [isAuthenticated]);

  // ── 3. Garde de navigation ───────────────────────────────────────────────
  useEffect(() => {
    if (isLoading) return;

    const inTabsGroup = segments[0] === '(tabs)';
    if (!isAuthenticated && inTabsGroup) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, segments]);

  // ── 4. Écran de chargement ───────────────────────────────────────────────
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
