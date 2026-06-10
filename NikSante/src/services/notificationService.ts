import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, Linking, Alert } from 'react-native';
import api from './api';

const EXPO_PROJECT_ID  = '7cc85ca2-aca8-433c-bf36-47d4c258706c';
const PLAY_STORE_URL   = 'market://details?id=com.niksante.app';
const PLAY_STORE_WEB   = 'https://play.google.com/store/apps/details?id=com.niksante.app';

// Comportement quand une notif arrive en premier plan
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  false,
  }),
});

// ── Enregistrement du token ────────────────────────────────────────────────────

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null; // simulateur : pas de push

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  // Canal Android pour les mises à jour
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('updates', {
      name:              'Mises à jour',
      description:       'Nouvelles versions de NikSanté',
      importance:        Notifications.AndroidImportance.HIGH,
      vibrationPattern:  [0, 250, 250, 250],
      sound:             'default',
    });
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    });
    return data;
  } catch {
    return null;
  }
}

export async function sendTokenToBackend(token: string): Promise<void> {
  try {
    await api.post('/notifications/register', { token });
  } catch {
    // silencieux — ne pas bloquer l'utilisateur si ça échoue
  }
}

// ── Gestion des notifications reçues ─────────────────────────────────────────

export function handleUpdateNotification(
  notification: Notifications.Notification
) {
  const data = notification.request.content.data as {
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
          Linking.openURL(PLAY_STORE_URL).catch(() =>
            Linking.openURL(PLAY_STORE_WEB)
          ),
      },
    ]
  );
}

// Appelé quand l'utilisateur appuie sur la notif depuis la barre système
export function handleNotificationResponse(
  response: Notifications.NotificationResponse
) {
  const data = response.notification.request.content.data as {
    type?: string;
  };

  if (data?.type === 'update') {
    Linking.openURL(PLAY_STORE_URL).catch(() =>
      Linking.openURL(PLAY_STORE_WEB)
    );
  }
}
