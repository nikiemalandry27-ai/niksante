import * as Device from 'expo-device';
import { Platform, Linking, Alert } from 'react-native';
import Constants from 'expo-constants';
import api from './api';

const EXPO_PROJECT_ID =
  Constants.expoConfig?.extra?.eas?.projectId ?? '5433c0d6-40a8-4b81-9dd1-8d74ed9df387';
const PLAY_STORE_URL  = 'market://details?id=com.niksante.app';
const PLAY_STORE_WEB  = 'https://play.google.com/store/apps/details?id=com.niksante.app';

// appOwnership === 'expo' est le seul check fiable pour Expo Go en SDK 53+
// ExecutionEnvironment.StoreClient ne fonctionne plus correctement
const IS_EXPO_GO = Constants.appOwnership === 'expo';

let Notifications: any = null;
if (!IS_EXPO_GO) {
  try {
    Notifications = require('expo-notifications');
    // Configure le comportement en premier plan (foreground)
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge:  false,
      }),
    });
  } catch {
    // Silencieux — module indisponible
  }
}

// ── Enregistrement du token ───────────────────────────────────────────────────

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Notifications || !Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('updates', {
      name:             'Mises à jour',
      description:      'Nouvelles versions de NikSanté',
      importance:       Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound:            'default',
    });
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID });
    return data;
  } catch (e) {
    console.error('[Notifs] getExpoPushTokenAsync:', e);
    return null;
  }
}

export async function sendTokenToBackend(token: string): Promise<void> {
  try {
    await api.post('/notifications/register', { token });
  } catch (e) {
    console.error('[Notifs] sendTokenToBackend:', e);
  }
}

// ── Abonnements aux événements ────────────────────────────────────────────────

export function addNotificationReceivedListener(
  handler: (n: any) => void
): { remove: () => void } | null {
  if (!Notifications) return null;
  return Notifications.addNotificationReceivedListener(handler);
}

export function addNotificationResponseReceivedListener(
  handler: (r: any) => void
): { remove: () => void } | null {
  if (!Notifications) return null;
  return Notifications.addNotificationResponseReceivedListener(handler);
}

// ── Gestion des notifications reçues ─────────────────────────────────────────

export function handleUpdateNotification(notification: any) {
  const data = notification?.request?.content?.data as {
    type?:      string;
    version?:   string;
    changelog?: string;
  };

  if (data?.type !== 'update') return;

  Alert.alert(
    `🆕 NikSanté ${data.version ?? ''} disponible !`,
    data.changelog ||
      'Une nouvelle version est disponible. Mettez à jour pour profiter des dernières améliorations.',
    [
      { text: 'Plus tard', style: 'cancel' },
      {
        text: '⬇️ Mettre à jour',
        onPress: () =>
          Linking.openURL(PLAY_STORE_URL).catch(() => Linking.openURL(PLAY_STORE_WEB)),
      },
    ]
  );
}

export function handleNotificationResponse(response: any) {
  const data = response?.notification?.request?.content?.data as { type?: string };
  if (data?.type === 'update') {
    Linking.openURL(PLAY_STORE_URL).catch(() => Linking.openURL(PLAY_STORE_WEB));
  }
}

// Récupère la notification qui a ouvert l'app depuis l'état fermé
export async function getLastNotificationResponse(): Promise<any> {
  if (!Notifications) return null;
  try {
    return await Notifications.getLastNotificationResponseAsync();
  } catch {
    return null;
  }
}
