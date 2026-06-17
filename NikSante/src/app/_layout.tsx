import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ThemeProvider, DefaultTheme, DarkTheme } from 'expo-router';
import {
  useColorScheme, View, Text, Animated,
  StyleSheet, Dimensions,
} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { useAuthStore }     from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useSleepStore }    from '@/store/sleepStore';
import {
  registerForPushNotifications,
  sendTokenToBackend,
  handleUpdateNotification,
  handleNotificationResponse,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  getLastNotificationResponse,
} from '@/services/notificationService';

// Empêche le splash natif de disparaître avant qu'on soit prêt
SplashScreen.preventAutoHideAsync().catch(() => {});

type Subscription = { remove: () => void } | null;

const SCREEN_W      = Dimensions.get('window').width;
const BAR_PADDING   = 48; // marge gauche + droite
const SPLASH_DURATION = 2600; // durée de la barre en ms

// ---------------------------------------------------------------------------
// Splash custom (remplace le splash natif avec une barre animée)
// ---------------------------------------------------------------------------

function AppSplash({ onDone }: { onDone: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Masquer le splash natif → notre splash custom prend le relais
    SplashScreen.hideAsync().catch(() => {});

    Animated.timing(progress, {
      toValue:         1,
      duration:        SPLASH_DURATION,
      useNativeDriver: false, // width ne supporte pas le native driver
    }).start(({ finished }) => {
      if (finished) onDone();
    });
  }, []);

  const barWidth = progress.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, SCREEN_W - BAR_PADDING * 2],
  });

  return (
    <View style={ss.container}>
      <Text style={ss.title}>NikSanté</Text>
      <Text style={ss.subtitle}>Suivi du diabète</Text>

      {/* Barre de chargement */}
      <View style={ss.barTrack}>
        <Animated.View style={[ss.barFill, { width: barWidth }]} />
      </View>
    </View>
  );
}

const ss = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#388E3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 52,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 10,
    fontWeight: '400',
  },
  barTrack: {
    position:        'absolute',
    bottom:          72,
    left:            BAR_PADDING,
    right:           BAR_PADDING,
    height:          4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius:    2,
    overflow:        'hidden',
  },
  barFill: {
    height:          4,
    backgroundColor: '#fff',
    borderRadius:    2,
  },
});

// ---------------------------------------------------------------------------
// Layout principal
// ---------------------------------------------------------------------------

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router      = useRouter();
  const segments    = useSegments();

  const { isAuthenticated, isLoading, initAuth } = useAuthStore();
  const initSettings = useSettingsStore((s) => s.initSettings);
  const initSleep    = useSleepStore((s) => s.initSleep);

  // Splash visible tant que l'animation ET l'auth ne sont pas terminées
  const [animDone, setAnimDone] = useState(false);
  const [authDone, setAuthDone] = useState(false);
  const showSplash = !animDone || !authDone;

  const notifListenerRef = useRef<Subscription>(null);
  const notifResponseRef = useRef<Subscription>(null);

  // ── 1. Init session + préférences ────────────────────────────────────────
  useEffect(() => {
    initAuth();
    initSettings();
    initSleep();
    // App ouverte depuis une notification (état fermé) → redirection Play Store
    getLastNotificationResponse().then((response) => {
      if (response) handleNotificationResponse(response);
    });
  }, []);

  // ── 2. Marquer auth terminée ──────────────────────────────────────────────
  useEffect(() => {
    if (!isLoading) setAuthDone(true);
  }, [isLoading]);

  // ── 3. Notifications push ────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    registerForPushNotifications().then((token) => {
      if (token) sendTokenToBackend(token);
    });

    notifListenerRef.current = addNotificationReceivedListener(handleUpdateNotification);
    notifResponseRef.current = addNotificationResponseReceivedListener(handleNotificationResponse);

    return () => {
      notifListenerRef.current?.remove();
      notifResponseRef.current?.remove();
    };
  }, [isAuthenticated]);

  // ── 4. Garde de navigation (après splash) ────────────────────────────────
  useEffect(() => {
    if (showSplash) return;

    const inTabsGroup = segments[0] === '(tabs)';
    if (!isAuthenticated && inTabsGroup) {
      router.replace('/login');
    }
  }, [isAuthenticated, showSplash, segments]);

  // ── 5. Splash custom ──────────────────────────────────────────────────────
  if (showSplash) {
    return <AppSplash onDone={() => setAnimDone(true)} />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
