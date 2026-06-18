/**
 * NikSanté — ProfileScreen
 *
 * Onglet Profil : affiche les informations de l'utilisateur,
 * les statistiques détaillées et les actions de gestion du compte.
 */

import { useState, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  Switch,
  Share,
  Linking,
  AppState,
  AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';

import { useAuthStore }    from '@/store/authStore';
import { useGlucoseStore } from '@/store/glucoseStore';
import { useSettingsStore } from '@/store/settingsStore';
import { getGlucoseStatus, getStatusColor, formatGlucose, unitLabel } from '@/utils/glucoseHelper';
import { GLUCOSE_THRESHOLDS } from '@/utils/constants';
import { getTimeInRange, getConsistencyScore } from '@/utils/glucoseAnalysis';
import { ThemedText } from '@/components/themed-text';
import { s, fs, vs } from '@/utils/responsive';

// ---------------------------------------------------------------------------
// Rappels de mesure (in-app via AppState — compatible Expo Go)
// ---------------------------------------------------------------------------

type ReminderKey = 'morning' | 'afternoon' | 'evening';

const REMINDER_DEFS: Record<ReminderKey, { label: string; hour: number; minute: number; icon: string; desc: string }> = {
  morning:   { label: 'Matin',      hour: 8,  minute: 0, icon: '🌅', desc: '08h00 — Mesure à jeun'  },
  afternoon: { label: 'Après-midi', hour: 13, minute: 0, icon: '☀️', desc: '13h00 — Après le repas' },
  evening:   { label: 'Soir',       hour: 19, minute: 0, icon: '🌙', desc: '19h00 — Avant le dîner' },
};

const REMINDER_STORAGE_KEY = '@niksante_reminders';
const REMINDER_SHOWN_KEY   = '@niksante_reminders_shown';
const NOTIF_IDS_KEY        = '@niksante_notif_ids';
const REMINDER_TIMES_KEY   = '@niksante_reminder_times';
const NOTIF_CHANNEL_ID     = 'niksante-rappels';

// SDK 56+ : appOwnership est supprimé, utiliser executionEnvironment
const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// ---------------------------------------------------------------------------
// Setup notifications (production uniquement)
// ---------------------------------------------------------------------------

async function setupNotifications(): Promise<void> {
  if (IS_EXPO_GO) return;
  try {
    const Notifs = require('expo-notifications');
    Notifs.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge:  false,
      }),
    });
    await Notifs.setNotificationChannelAsync(NOTIF_CHANNEL_ID, {
      name:             'Rappels glycémie',
      importance:       Notifs.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor:       '#388E3C',
      sound:            true,
      enableVibrate:    true,
      showBadge:        false,
    });
  } catch (e) {
    console.error('[Notifs] Setup error:', e);
  }
}

async function scheduleReminder(key: ReminderKey, hour: number, minute: number): Promise<string | null> {
  if (IS_EXPO_GO) return null;
  const def = REMINDER_DEFS[key];
  try {
    const Notifs = require('expo-notifications');
    const id = await Notifs.scheduleNotificationAsync({
      content: {
        title: 'Rappel NikSanté',
        body:  `${def.label} — Pensez à mesurer votre glycémie !`,
        sound: true,
        data:  { key },
      },
      trigger: {
        type:      Notifs.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: NOTIF_CHANNEL_ID,
      },
    });
    console.log(`[Notifs] "${key}" programmé à ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} → ID: ${id}`);
    return id;
  } catch (e) {
    console.log(`[Notifs] Schedule unavailable pour "${key}":`, e);
    return null;
  }
}

async function cancelReminder(id: string): Promise<void> {
  if (IS_EXPO_GO) return;
  try {
    const Notifs = require('expo-notifications');
    await Notifs.cancelScheduledNotificationAsync(id);
    console.log(`[Notifs] Rappel annulé → ID: ${id}`);
  } catch (e) {
    console.log('[Notifs] Cancel unavailable:', e);
  }
}

// ---------------------------------------------------------------------------
// Textes légaux
// ---------------------------------------------------------------------------

const PRIVACY_POLICY = `Dernière mise à jour : 30 mai 2026

NikSanté (« l'Application ») est une application mobile de suivi du diabète développée par Nikiema Landry. Cette politique explique comment nous collectons, utilisons et protégeons vos données personnelles.

1. DONNÉES COLLECTÉES
Lors de l'utilisation de NikSanté, nous collectons les informations suivantes :

• Informations de compte : nom, adresse e-mail, mot de passe (chiffré)
• Données de santé : mesures de glycémie, date et heure des mesures, notes et contexte repas
• Données d'analyse alimentaire : photos ou descriptions d'aliments soumises au scanner IA

2. UTILISATION DES DONNÉES
Vos données sont utilisées exclusivement pour :

• Afficher votre historique de glycémie et vos statistiques personnelles
• Analyser vos aliments via l'intelligence artificielle (OpenAI)
• Vous fournir des alertes et conseils adaptés à votre situation

Vos données ne sont jamais vendues ni partagées avec des tiers à des fins commerciales.

3. STOCKAGE ET SÉCURITÉ
Vos données sont stockées sur une base de données PostgreSQL sécurisée hébergée sur Render (Union européenne — Francfort). Les mots de passe sont chiffrés avec bcrypt. Les communications sont chiffrées via HTTPS.

4. PARTAGE DES DONNÉES
Les seuls tiers qui peuvent accéder à vos données de façon limitée sont :

• OpenAI : les images d'aliments soumises au scanner sont analysées via l'API OpenAI. Ces données sont soumises à la politique de confidentialité d'OpenAI.
• Render : hébergeur du backend et de la base de données.

5. VOS DROITS
Conformément au RGPD et aux lois applicables, vous disposez des droits suivants :

• Accès : consulter toutes vos données depuis l'application
• Suppression : supprimer votre historique de glycémie depuis l'application
• Suppression du compte : contactez-nous à l'adresse ci-dessous pour supprimer définitivement votre compte et toutes vos données

6. AVERTISSEMENT MÉDICAL
NikSanté est un outil d'aide au suivi personnel et ne remplace en aucun cas l'avis d'un professionnel de santé. Ne prenez aucune décision médicale basée uniquement sur les informations fournies par l'application.

7. CONTACT
Pour toute question concernant cette politique ou pour exercer vos droits, contactez-nous à : nikiemalandry54@gmail.com`;

const TERMS_OF_USE = `Dernière mise à jour : juin 2026

En utilisant l'application NikSanté, vous acceptez les présentes conditions d'utilisation. Veuillez les lire attentivement.

1. DESCRIPTION DU SERVICE
NikSanté est une application mobile gratuite permettant aux personnes diabétiques ou souhaitant surveiller leur glycémie de :

• Enregistrer et visualiser leurs mesures de glycémie
• Scanner des aliments pour estimer leur impact glycémique via l'IA
• Suivre leur sommeil et obtenir des insights sur leur récupération
• Recevoir des alertes en cas de valeurs anormales

2. AVERTISSEMENT MÉDICAL IMPORTANT
NikSanté n'est pas un dispositif médical certifié. L'application est un outil d'aide à la gestion personnelle du diabète et ne remplace pas :

• L'avis ou le suivi d'un médecin ou professionnel de santé
• Un glucomètre médical homologué
• Un tensiomètre ou cardiofréquencemètre médical certifié
• Un traitement médical prescrit

En cas d'urgence médicale, contactez immédiatement les services d'urgence de votre pays.

3. CONDITIONS D'ACCÈS
Pour utiliser NikSanté, vous devez :

• Avoir au moins 13 ans (ou l'âge légal requis dans votre pays)
• Créer un compte avec des informations exactes
• Être responsable de la confidentialité de votre mot de passe

4. UTILISATION ACCEPTABLE
Vous vous engagez à ne pas :

• Utiliser l'application à des fins illégales
• Tenter d'accéder aux données d'autres utilisateurs
• Perturber le fonctionnement des serveurs ou de la base de données

5. SUIVI DU SOMMEIL
La fonctionnalité de suivi du sommeil vous permet d'enregistrer vos heures de coucher et de lever, d'évaluer la qualité de votre sommeil et de recevoir des insights personnalisés. Ces informations sont purement indicatives :

• Elles ne remplacent pas un avis médical professionnel
• La qualité du sommeil est auto-évaluée et subjective
• Ne pas l'utiliser pour diagnostiquer des troubles du sommeil
• En cas de troubles persistants du sommeil, consultez un médecin

6. DISPONIBILITÉ DU SERVICE
NikSanté est fourni "tel quel". Nous nous efforçons de maintenir le service disponible en permanence mais ne garantissons pas une disponibilité ininterrompue. Le service peut être suspendu pour maintenance ou mise à jour.

7. LIMITATION DE RESPONSABILITÉ
Dans les limites autorisées par la loi, Nikiema Landry ne pourra être tenu responsable des dommages directs ou indirects résultant de l'utilisation ou de l'impossibilité d'utiliser l'application, ni des décisions prises sur la base des informations fournies par l'application.

8. MODIFICATIONS
Nous nous réservons le droit de modifier ces conditions à tout moment. Les utilisateurs seront informés des changements importants via l'application.

9. CONTACT
Pour toute question : nikiemalandry54@gmail.com`;

export default function ProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // ── Modales ──────────────────────────────────────────────────────────────
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | null>(null);

  // ── Paramètres unité ─────────────────────────────────────────────────────
  const glucoseUnit    = useSettingsStore((s) => s.glucoseUnit);
  const setGlucoseUnit = useSettingsStore((s) => s.setGlucoseUnit);

  // ── Rappels ──────────────────────────────────────────────────────────────
  const [reminderModal, setReminderModal] = useState(false);
  const [reminders, setReminders] = useState<Record<ReminderKey, boolean>>({
    morning: false, afternoon: false, evening: false,
  });
  const [notifIds, setNotifIds] = useState<Record<ReminderKey, string | null>>({
    morning: null, afternoon: null, evening: null,
  });
  const [reminderTimes, setReminderTimes] = useState<Record<ReminderKey, { hour: number; minute: number }>>({
    morning:   { hour: 8,  minute: 0 },
    afternoon: { hour: 13, minute: 0 },
    evening:   { hour: 19, minute: 0 },
  });
  const shownTodayRef = useRef<Record<ReminderKey, string>>({
    morning: '', afternoon: '', evening: '',
  });

  useEffect(() => {
    setupNotifications();
    AsyncStorage.getItem(REMINDER_STORAGE_KEY).then((raw) => {
      if (raw) setReminders(JSON.parse(raw));
    });
    AsyncStorage.getItem(REMINDER_SHOWN_KEY).then((raw) => {
      if (raw) shownTodayRef.current = JSON.parse(raw);
    });
    AsyncStorage.getItem(NOTIF_IDS_KEY).then((raw) => {
      if (raw) setNotifIds(JSON.parse(raw));
    });
    AsyncStorage.getItem(REMINDER_TIMES_KEY).then((raw) => {
      if (raw) setReminderTimes(JSON.parse(raw));
    });
  }, []);

  // Ajuste l'heure d'un rappel et reprogramme si actif
  const adjustReminderTime = async (key: ReminderKey, field: 'hour' | 'minute', delta: number) => {
    const current = reminderTimes[key];
    const newVal  = field === 'hour'
      ? ((current.hour + delta + 24) % 24)
      : ((current.minute + delta + 60) % 60);
    const updated = { ...reminderTimes, [key]: { ...current, [field]: newVal } };
    setReminderTimes(updated);
    await AsyncStorage.setItem(REMINDER_TIMES_KEY, JSON.stringify(updated));

    // Reprogramme automatiquement si le rappel est actif
    if (reminders[key] && !IS_EXPO_GO) {
      const oldId = notifIds[key];
      if (oldId) await cancelReminder(oldId);
      const { hour, minute } = updated[key];
      const id = await scheduleReminder(key, hour, minute);
      if (id) {
        const updatedIds = { ...notifIds, [key]: id };
        setNotifIds(updatedIds);
        await AsyncStorage.setItem(NOTIF_IDS_KEY, JSON.stringify(updatedIds));
      }
    }
  };

  // ── Expo Go : alerte in-app (AppState + intervalle toutes les 60s) ──────
  const checkReminders = (
    enabled: Record<ReminderKey, boolean>,
    times: Record<ReminderKey, { hour: number; minute: number }>,
  ) => {
    if (!IS_EXPO_GO) return;
    const now    = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const today  = now.toDateString();
    for (const key of Object.keys(REMINDER_DEFS) as ReminderKey[]) {
      if (!enabled[key]) continue;
      if (shownTodayRef.current[key] === today) continue;
      const { hour, minute } = times[key];
      const diff = nowMin - (hour * 60 + minute);
      if (diff >= 0 && diff <= 30) {
        shownTodayRef.current[key] = today;
        AsyncStorage.setItem(REMINDER_SHOWN_KEY, JSON.stringify(shownTodayRef.current));
        const def = REMINDER_DEFS[key];
        const hh  = String(hour).padStart(2, '0');
        const mm  = String(minute).padStart(2, '0');
        Alert.alert(
          'Rappel glycémique',
          `${def.label} (${hh}:${mm}) — Pensez à mesurer votre glycémie !`,
          [{ text: 'OK' }],
        );
        return;
      }
    }
  };

  useEffect(() => {
    if (!IS_EXPO_GO) return;
    // Vérification immédiate au montage ou changement de rappels/heures
    checkReminders(reminders, reminderTimes);
    // Vérification au retour au premier plan
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') checkReminders(reminders, reminderTimes);
    });
    // Vérification toutes les 60s même si l'app est au premier plan
    const interval = setInterval(() => checkReminders(reminders, reminderTimes), 60_000);
    return () => { sub.remove(); clearInterval(interval); };
  }, [reminders, reminderTimes]);

  // ── Notifications système planifiées (production uniquement) ───────────
  const toggleReminder = async (key: ReminderKey) => {
    const isOn = reminders[key];

    if (!IS_EXPO_GO) {
      const Notifs = require('expo-notifications');
      if (!isOn) {
        const { status } = await Notifs.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Permission requise',
            'Activez les notifications dans Paramètres > Applications > NikSanté > Notifications.',
          );
          return;
        }
        const oldId = notifIds[key];
        if (oldId) await cancelReminder(oldId);
        const { hour, minute } = reminderTimes[key];
        const id = await scheduleReminder(key, hour, minute);
        if (id) {
          const updatedIds = { ...notifIds, [key]: id };
          setNotifIds(updatedIds);
          await AsyncStorage.setItem(NOTIF_IDS_KEY, JSON.stringify(updatedIds));
        }
      } else {
        const id = notifIds[key];
        if (id) await cancelReminder(id);
        const updatedIds = { ...notifIds, [key]: null };
        setNotifIds(updatedIds);
        await AsyncStorage.setItem(NOTIF_IDS_KEY, JSON.stringify(updatedIds));
      }
    }

    const updated = { ...reminders, [key]: !isOn };
    setReminders(updated);
    await AsyncStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(updated));
  };

  const user           = useAuthStore((state) => state.user);
  const logout          = useAuthStore((state) => state.logout);
  const glucoseHistory  = useGlucoseStore((state) => state.glucoseHistory);
  const clearHistory    = useGlucoseStore((state) => state.clearHistory);
  const resetLocalState = useGlucoseStore((state) => state.resetLocalState);
  const average        = useGlucoseStore((state) => state.getAverageGlucose)();

  // ── Stats calculées ──────────────────────────────────────────────────────

  const values  = glucoseHistory.map((e) => e.value);
  const minVal  = values.length > 0 ? Math.min(...values) : null;
  const maxVal  = values.length > 0 ? Math.max(...values) : null;

  const tir   = getTimeInRange(glucoseHistory);
  const score = getConsistencyScore(glucoseHistory);

  const hypoCount   = values.filter((v) => v <  GLUCOSE_THRESHOLDS.NORMAL_MIN).length;
  const hyperCount  = values.filter((v) => v >  GLUCOSE_THRESHOLDS.NORMAL_MAX).length;
  const normalCount = values.filter((v) => v >= GLUCOSE_THRESHOLDS.NORMAL_MIN && v <= GLUCOSE_THRESHOLDS.NORMAL_MAX).length;

  const todayCount = glucoseHistory.filter((e) => {
    const d = new Date(e.date);
    return d.toDateString() === new Date().toDateString();
  }).length;

  // ── Social handlers ──────────────────────────────────────────────────────

  const handleShare = async () => {
    await Share.share({
      message:
        '📱 NikSanté — Application gratuite de suivi du diabète.\n' +
        'Glycémie, scanner alimentaire IA, guide médical et plus.\n\n' +
        'Téléchargez-la sur le Play Store :\n' +
        'https://play.google.com/store/apps/details?id=com.niksante.app',
    });
  };

  const handleRate = async () => {
    const url = 'market://details?id=com.niksante.app';
    const fallback = 'https://play.google.com/store/apps/details?id=com.niksante.app';
    try {
      await Linking.openURL(url);
    } catch {
      await Linking.openURL(fallback);
    }
  };

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleClearHistory = () => {
    if (glucoseHistory.length === 0) {
      Alert.alert('Historique vide', 'Il n\'y a aucune mesure à supprimer.');
      return;
    }
    Alert.alert(
      'Vider l\'historique',
      `Supprimer les ${glucoseHistory.length} mesure(s) enregistrée(s) ? Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await clearHistory();
            Alert.alert('Historique effacé', 'Toutes les mesures ont été supprimées.');
          },
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnecter',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            await resetLocalState();
            await logout();
            router.replace('/login');
          },
        },
      ],
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Avatar + nom ── */}
        <View style={styles.heroSection}>
          <View style={styles.avatar}>
            <ThemedText style={styles.avatarText}>
              {user?.name?.charAt(0).toUpperCase() ?? '?'}
            </ThemedText>
          </View>
          <ThemedText style={styles.userName}>{user?.name ?? 'Utilisateur'}</ThemedText>
          <ThemedText style={styles.userEmail}>{user?.email ?? ''}</ThemedText>

          {/* Badge statut moyen */}
          {average > 0 && (
            <View style={[
              styles.avgBadge,
              { backgroundColor: getStatusColor(getGlucoseStatus(average)) + '20',
                borderColor: getStatusColor(getGlucoseStatus(average)) },
            ]}>
              <ThemedText style={[
                styles.avgBadgeText,
                { color: getStatusColor(getGlucoseStatus(average)) },
              ]}>
                Moyenne : {formatGlucose(average, glucoseUnit)} {unitLabel(glucoseUnit)}
              </ThemedText>
            </View>
          )}
        </View>

        {/* ── Statistiques ── */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Statistiques</ThemedText>

          <View style={styles.statsGrid}>
            <StatBox label="Total" value={String(glucoseHistory.length)} unit="mesures" />
            <StatBox label="Aujourd'hui" value={String(todayCount)} unit="mesures" />
            <StatBox
              label="Minimum"
              value={minVal !== null ? formatGlucose(minVal, glucoseUnit) : '—'}
              unit={unitLabel(glucoseUnit)}
              color={minVal !== null ? getStatusColor(getGlucoseStatus(minVal)) : '#aaa'}
            />
            <StatBox
              label="Maximum"
              value={maxVal !== null ? formatGlucose(maxVal, glucoseUnit) : '—'}
              unit={unitLabel(glucoseUnit)}
              color={maxVal !== null ? getStatusColor(getGlucoseStatus(maxVal)) : '#aaa'}
            />
          </View>
        </View>

        {/* ── Score TIR ── */}
        {glucoseHistory.length > 0 && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Contrôle glycémique</ThemedText>
            <View style={styles.card}>
              {/* Score badge + label */}
              <View style={styles.tirScoreRow}>
                <View>
                  <ThemedText style={styles.tirScoreLabel}>Score global</ThemedText>
                  <ThemedText style={[styles.tirScoreValue, { color: score.color }]}>
                    {score.score}%
                  </ThemedText>
                </View>
                <View style={[styles.tirScoreBadge, { backgroundColor: score.color + '20', borderColor: score.color }]}>
                  <ThemedText style={[styles.tirScoreBadgeText, { color: score.color }]}>
                    {score.label}
                  </ThemedText>
                </View>
              </View>

              {/* Barre TIR */}
              <View style={styles.tirBar}>
                {tir.below   > 0 && <View style={[styles.tirSeg, { flex: tir.below,   backgroundColor: '#1565C0' }]} />}
                {tir.inRange > 0 && <View style={[styles.tirSeg, { flex: tir.inRange, backgroundColor: '#388E3C' }]} />}
                {tir.above   > 0 && <View style={[styles.tirSeg, { flex: tir.above,   backgroundColor: '#F57C00' }]} />}
              </View>

              {/* Légende */}
              <View style={styles.tirLegendRow}>
                <TIRLegend color="#1565C0" label="Trop bas"  pct={tir.below}   />
                <TIRLegend color="#388E3C" label="Cible"     pct={tir.inRange} />
                <TIRLegend color="#F57C00" label="Trop haut" pct={tir.above}   />
              </View>
            </View>
          </View>
        )}

        {/* ── Répartition ── */}
        {glucoseHistory.length > 0 && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Répartition des mesures</ThemedText>
            <View style={styles.card}>
              <RepartitionRow
                label="Hypoglycémies"
                count={hypoCount}
                total={values.length}
                color="#B71C1C"
              />
              <RepartitionRow
                label="Normales"
                count={normalCount}
                total={values.length}
                color="#388E3C"
              />
              <RepartitionRow
                label="Hyperglycémies"
                count={hyperCount}
                total={values.length}
                color="#F57C00"
              />
            </View>
          </View>
        )}

        {/* ── Accès rapide ── */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Fonctionnalités</ThemedText>

          {[
            { icon: '🏅', label: 'Récompenses',      desc: 'Badges, points et niveaux',      route: '/gamification'    },
            { icon: '🧠', label: 'Bien-être mental', desc: 'Humeur, respiration & conseils', route: '/mental-health'   },
            { icon: '📚', label: 'Guide Diabète',    desc: 'Tout savoir sur le diabète',     route: '/diabetes-guide'  },
          ].map((item) => (
            <TouchableOpacity
              key={item.route}
              style={styles.actionRow}
              onPress={() => router.push(item.route as any)}
            >
              <ThemedText style={styles.actionIcon}>{item.icon}</ThemedText>
              <View style={styles.actionInfo}>
                <ThemedText style={styles.actionLabel}>{item.label}</ThemedText>
                <ThemedText style={styles.actionDesc}>{item.desc}</ThemedText>
              </View>
              <ThemedText style={styles.actionChevron}>›</ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Unité de mesure ── */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Unité de mesure</ThemedText>
          <View style={[styles.actionRow, styles.actionRowLast]}>
            <ThemedText style={styles.actionIcon}>📏</ThemedText>
            <View style={styles.actionInfo}>
              <ThemedText style={styles.actionLabel}>Unité glycémie</ThemedText>
              <ThemedText style={styles.actionDesc}>
                {glucoseUnit === 'mg_dl' ? 'mg/dL (actuel)' : 'mmol/L (actuel)'}
              </ThemedText>
            </View>
            <View style={styles.unitToggleRow}>
              <ThemedText style={[styles.unitToggleLabel, glucoseUnit === 'mg_dl' && styles.unitToggleActive]}>mg/dL</ThemedText>
              <Switch
                value={glucoseUnit === 'mmol_l'}
                onValueChange={(v) => setGlucoseUnit(v ? 'mmol_l' : 'mg_dl')}
                trackColor={{ false: '#A5D6A7', true: '#A5D6A7' }}
                thumbColor="#388E3C"
              />
              <ThemedText style={[styles.unitToggleLabel, glucoseUnit === 'mmol_l' && styles.unitToggleActive]}>mmol/L</ThemedText>
            </View>
          </View>
        </View>

        {/* ── Communauté ── */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Communauté</ThemedText>
          <TouchableOpacity style={styles.actionRow} onPress={handleShare}>
            <ThemedText style={styles.actionIcon}>📤</ThemedText>
            <View style={styles.actionInfo}>
              <ThemedText style={styles.actionLabel}>Partager avec des amis</ThemedText>
              <ThemedText style={styles.actionDesc}>Recommandez NikSanté à vos proches</ThemedText>
            </View>
            <ThemedText style={styles.actionChevron}>›</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionRow, styles.actionRowLast]} onPress={handleRate}>
            <ThemedText style={styles.actionIcon}>⭐</ThemedText>
            <View style={styles.actionInfo}>
              <ThemedText style={styles.actionLabel}>Noter l'application</ThemedText>
              <ThemedText style={styles.actionDesc}>Laissez un avis sur le Play Store</ThemedText>
            </View>
            <ThemedText style={styles.actionChevron}>›</ThemedText>
          </TouchableOpacity>
        </View>

        {/* ── Légal ── */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Informations légales</ThemedText>
          <TouchableOpacity style={styles.actionRow} onPress={() => setLegalModal('privacy')}>
            <ThemedText style={styles.actionIcon}>🔒</ThemedText>
            <View style={styles.actionInfo}>
              <ThemedText style={styles.actionLabel}>Politique de confidentialité</ThemedText>
              <ThemedText style={styles.actionDesc}>Gestion de vos données personnelles</ThemedText>
            </View>
            <ThemedText style={styles.actionChevron}>›</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionRow, styles.actionRowLast]} onPress={() => setLegalModal('terms')}>
            <ThemedText style={styles.actionIcon}>📄</ThemedText>
            <View style={styles.actionInfo}>
              <ThemedText style={styles.actionLabel}>Conditions d'utilisation</ThemedText>
              <ThemedText style={styles.actionDesc}>Termes et conditions du service</ThemedText>
            </View>
            <ThemedText style={styles.actionChevron}>›</ThemedText>
          </TouchableOpacity>
        </View>

        {/* ── Actions ── */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Gestion du compte</ThemedText>

          <TouchableOpacity style={styles.actionRow} onPress={handleClearHistory}>
            <ThemedText style={styles.actionIcon}>🗑️</ThemedText>
            <View style={styles.actionInfo}>
              <ThemedText style={styles.actionLabel}>Vider l'historique</ThemedText>
              <ThemedText style={styles.actionDesc}>
                Supprime toutes les mesures enregistrées
              </ThemedText>
            </View>
            <ThemedText style={styles.actionChevron}>›</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionRow, styles.actionRowLast]} onPress={() => setReminderModal(true)}>
            <ThemedText style={styles.actionIcon}>🔔</ThemedText>
            <View style={styles.actionInfo}>
              <ThemedText style={styles.actionLabel}>Rappels de mesure</ThemedText>
              <ThemedText style={styles.actionDesc}>
                {Object.values(reminders).filter(Boolean).length === 0
                  ? 'Aucun rappel actif'
                  : `${Object.values(reminders).filter(Boolean).length} rappel(s) actif(s)`}
              </ThemedText>
            </View>
            <ThemedText style={styles.actionChevron}>›</ThemedText>
          </TouchableOpacity>
        </View>

        {/* ── Soutenir le développeur ── */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Soutenir le développeur</ThemedText>
          <View style={styles.supportCard}>
            <ThemedText style={styles.supportTitle}>Récompenser ou soutenir</ThemedText>
            <ThemedText style={styles.supportDesc}>
              NikSanté est développé bénévolement. Si l'application vous est utile, vous pouvez soutenir le développeur.
            </ThemedText>
            <TouchableOpacity
              style={styles.supportRow}
              onPress={() => Linking.openURL('mailto:nikiemalandry54@gmail.com')}
            >
              <ThemedText style={styles.supportIcon}>✉️</ThemedText>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.supportContactLabel}>Email</ThemedText>
                <ThemedText style={styles.supportContactValue}>nikiemalandry54@gmail.com</ThemedText>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.supportRow, { borderTopWidth: 1, borderTopColor: '#f0f0f0' }]}
              onPress={() => Linking.openURL('tel:+22654851415')}
            >
              <ThemedText style={styles.supportIcon}>📞</ThemedText>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.supportContactLabel}>Téléphone / WhatsApp</ThemedText>
                <ThemedText style={styles.supportContactValue}>+226 54 85 14 15</ThemedText>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Déconnexion ── */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={handleLogout}
            disabled={loading}
          >
            <ThemedText style={styles.logoutText}>
              {loading ? 'Déconnexion…' : 'Se déconnecter'}
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* ── Version ── */}
        <View style={styles.versionSection}>
          <ThemedText style={styles.versionText}>NikSanté v{Constants.expoConfig?.version ?? '1.0.0'}</ThemedText>
          <ThemedText style={styles.versionSub}>
            Application de suivi du diabète
          </ThemedText>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Modal légal ── */}
      <Modal
        visible={legalModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setLegalModal(null)}
      >
        <TouchableOpacity
          style={modalStyles.backdrop}
          activeOpacity={1}
          onPress={() => setLegalModal(null)}
        />
        <View style={[modalStyles.sheet, { maxHeight: '80%' }]}>
          <View style={modalStyles.handle} />
          <ThemedText style={modalStyles.title}>
            {legalModal === 'privacy' ? '🔒  Politique de confidentialité' : '📄  Conditions d\'utilisation'}
          </ThemedText>
          <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: vs(8) }}>
            {legalModal === 'privacy' ? (
              <ThemedText style={modalStyles.legalText}>{PRIVACY_POLICY}</ThemedText>
            ) : (
              <ThemedText style={modalStyles.legalText}>{TERMS_OF_USE}</ThemedText>
            )}
            <View style={{ height: vs(20) }} />
          </ScrollView>
          <TouchableOpacity style={modalStyles.closeBtn} onPress={() => setLegalModal(null)}>
            <ThemedText style={modalStyles.closeBtnText}>Fermer</ThemedText>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Modal rappels ── */}
      <Modal
        visible={reminderModal}
        transparent
        animationType="slide"
        onRequestClose={() => setReminderModal(false)}
      >
        <TouchableOpacity
          style={modalStyles.backdrop}
          activeOpacity={1}
          onPress={() => setReminderModal(false)}
        />
        <View style={[modalStyles.sheet, { maxHeight: '90%' }]}>
          <View style={modalStyles.handle} />
          <ThemedText style={modalStyles.title}>🔔  Rappels de mesure</ThemedText>
          <ThemedText style={modalStyles.subtitle}>
            Activez des rappels journaliers pour ne jamais oublier de mesurer votre glycémie.
          </ThemedText>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
          {(Object.keys(REMINDER_DEFS) as ReminderKey[]).map((key) => {
            const def  = REMINDER_DEFS[key];
            const isOn = reminders[key];
            const { hour, minute } = reminderTimes[key];
            const hh = String(hour).padStart(2, '0');
            const mm = String(minute).padStart(2, '0');
            return (
              <View key={key} style={modalStyles.reminderBlock}>
                {/* Ligne principale : icône + label + switch */}
                <View style={modalStyles.row}>
                  <ThemedText style={modalStyles.rowIcon}>{def.icon}</ThemedText>
                  <View style={modalStyles.rowInfo}>
                    <ThemedText style={modalStyles.rowLabel}>{def.label}</ThemedText>
                    <ThemedText style={[modalStyles.rowDesc, isOn && { color: '#388E3C', fontWeight: '700' }]}>
                      {isOn ? `Actif — chaque jour à ${hh}:${mm}` : 'Inactif'}
                    </ThemedText>
                  </View>
                  <Switch
                    value={isOn}
                    onValueChange={() => toggleReminder(key)}
                    trackColor={{ false: '#ddd', true: '#A5D6A7' }}
                    thumbColor={isOn ? '#388E3C' : '#f4f3f4'}
                  />
                </View>
                {/* Sélecteur d'heure */}
                <View style={modalStyles.timePicker}>
                  {/* Heures */}
                  <View style={modalStyles.timeCol}>
                    <TouchableOpacity style={modalStyles.timeBtn} onPress={() => adjustReminderTime(key, 'hour', 1)}>
                      <ThemedText style={modalStyles.timeArrow}>▲</ThemedText>
                    </TouchableOpacity>
                    <View style={modalStyles.timeDisplay}>
                      <ThemedText style={modalStyles.timeDigit}>{hh}</ThemedText>
                    </View>
                    <TouchableOpacity style={modalStyles.timeBtn} onPress={() => adjustReminderTime(key, 'hour', -1)}>
                      <ThemedText style={modalStyles.timeArrow}>▼</ThemedText>
                    </TouchableOpacity>
                  </View>
                  <ThemedText style={modalStyles.timeColon}>:</ThemedText>
                  {/* Minutes */}
                  <View style={modalStyles.timeCol}>
                    <TouchableOpacity style={modalStyles.timeBtn} onPress={() => adjustReminderTime(key, 'minute', 5)}>
                      <ThemedText style={modalStyles.timeArrow}>▲</ThemedText>
                    </TouchableOpacity>
                    <View style={modalStyles.timeDisplay}>
                      <ThemedText style={modalStyles.timeDigit}>{mm}</ThemedText>
                    </View>
                    <TouchableOpacity style={modalStyles.timeBtn} onPress={() => adjustReminderTime(key, 'minute', -5)}>
                      <ThemedText style={modalStyles.timeArrow}>▼</ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
          </ScrollView>

          <TouchableOpacity style={modalStyles.closeBtn} onPress={() => setReminderModal(false)}>
            <ThemedText style={modalStyles.closeBtnText}>Fermer</ThemedText>
          </TouchableOpacity>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Sous-composants
// ---------------------------------------------------------------------------

function StatBox({
  label, value, unit, color = '#388E3C',
}: {
  label: string; value: string; unit: string; color?: string;
}) {
  return (
    <View style={statStyles.box}>
      <ThemedText style={statStyles.label}>{label}</ThemedText>
      <ThemedText style={[statStyles.value, { color }]}>{value}</ThemedText>
      <ThemedText style={statStyles.unit}>{unit}</ThemedText>
    </View>
  );
}

function TIRLegend({ color, label, pct }: { color: string; label: string; pct: number }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: s(10), height: s(10), borderRadius: 5, backgroundColor: color, marginBottom: vs(3) }} />
      <ThemedText style={{ fontSize: fs(10), color: '#888', fontWeight: '600' }}>{label}</ThemedText>
      <ThemedText style={{ fontSize: fs(12), color, fontWeight: 'bold' }}>{pct}%</ThemedText>
    </View>
  );
}

function RepartitionRow({
  label, count, total, color,
}: {
  label: string; count: number; total: number; color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <View style={repStyles.row}>
      <View style={[repStyles.dot, { backgroundColor: color }]} />
      <ThemedText style={repStyles.label}>{label}</ThemedText>
      <View style={repStyles.barBg}>
        <View style={[repStyles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <ThemedText style={[repStyles.pct, { color }]}>{pct}%</ThemedText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  heroSection: {
    alignItems:      'center',
    paddingVertical: vs(32),
    paddingHorizontal: s(20),
    backgroundColor: '#fff',
    marginBottom:    vs(12),
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  avatar: {
    width:           s(80),
    height:          s(80),
    borderRadius:    s(40),
    backgroundColor: '#388E3C',
    justifyContent:  'center',
    alignItems:      'center',
    marginBottom:    vs(12),
    elevation:       4,
    shadowColor:     '#388E3C',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.3,
    shadowRadius:    6,
  },
  avatarText: {
    fontSize:   fs(36),
    fontWeight: 'bold',
    color:      '#fff',
  },
  userName: {
    fontSize:     fs(22),
    fontWeight:   'bold',
    color:        '#1a1a1a',
    marginBottom: vs(4),
  },
  userEmail: {
    fontSize:     fs(14),
    color:        '#999',
    marginBottom: vs(14),
  },
  avgBadge: {
    borderRadius:      20,
    borderWidth:       1,
    paddingVertical:   vs(6),
    paddingHorizontal: s(14),
  },
  avgBadgeText: {
    fontSize:   fs(13),
    fontWeight: '700',
  },
  section: {
    marginBottom: vs(12),
  },
  sectionTitle: {
    fontSize:        fs(12),
    fontWeight:      '700',
    color:           '#999',
    letterSpacing:   0.6,
    marginHorizontal: s(20),
    marginBottom:    vs(8),
  },
  statsGrid: {
    flexDirection:    'row',
    flexWrap:         'wrap',
    marginHorizontal: s(16),
    gap:              s(8),
  },
  card: {
    backgroundColor:  '#fff',
    marginHorizontal: s(20),
    borderRadius:     14,
    padding:          s(16),
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  // TIR
  tirScoreRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: vs(12),
  },
  tirScoreLabel: { fontSize: fs(11), color: '#aaa', fontWeight: '700', marginBottom: vs(4) },
  tirScoreValue: { fontSize: fs(28), fontWeight: 'bold' },
  tirScoreBadge: {
    borderRadius: 20, borderWidth: 1,
    paddingVertical: vs(6), paddingHorizontal: s(14),
  },
  tirScoreBadgeText: { fontSize: fs(14), fontWeight: '700' },
  tirBar: {
    flexDirection: 'row', height: vs(12), borderRadius: 6,
    overflow: 'hidden', marginBottom: vs(12),
  },
  tirSeg: { height: vs(12) },
  tirLegendRow: { flexDirection: 'row', justifyContent: 'space-around' },

  // Actions
  actionRow: {
    flexDirection:    'row',
    alignItems:       'center',
    backgroundColor:  '#fff',
    marginHorizontal: s(20),
    paddingHorizontal: s(16),
    paddingVertical:  vs(14),
    borderTopWidth:   1,
    borderTopColor:   '#f5f5f5',
    gap:              s(12),
  },
  actionRowLast: {
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    borderRadius: 14,
  },
  actionIcon: {
    fontSize: fs(20),
  },
  actionInfo: {
    flex: 1,
  },
  actionLabel: {
    fontSize:   fs(15),
    fontWeight: '600',
    color:      '#222',
  },
  actionDesc: {
    fontSize:  fs(12),
    color:     '#aaa',
    marginTop: vs(2),
  },
  actionChevron: {
    fontSize: fs(22),
    color:    '#ccc',
    fontWeight: '300',
  },
  soonBadge: {
    backgroundColor: '#E8F5E9',
    borderRadius:    10,
    paddingVertical: vs(3),
    paddingHorizontal: s(8),
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  soonBadgeText: {
    fontSize:   fs(10),
    color:      '#388E3C',
    fontWeight: '700',
  },
  logoutBtn: {
    marginHorizontal: s(20),
    backgroundColor:  '#FFF3F3',
    borderRadius:     14,
    paddingVertical:  vs(16),
    alignItems:       'center',
    borderWidth:      1,
    borderColor:      '#FFCDD2',
  },
  logoutText: {
    color:      '#C62828',
    fontWeight: 'bold',
    fontSize:   fs(15),
  },
  unitToggleRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           s(6),
  },
  unitToggleLabel: {
    fontSize:   fs(12),
    color:      '#bbb',
    fontWeight: '600',
  },
  unitToggleActive: {
    color:      '#388E3C',
    fontWeight: 'bold',
  },
  supportCard: {
    marginHorizontal: s(20),
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: s(16),
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  supportTitle: {
    fontSize: fs(15),
    fontWeight: '700',
    color: '#222',
    marginBottom: vs(6),
  },
  supportDesc: {
    fontSize: fs(12),
    color: '#888',
    lineHeight: vs(18),
    marginBottom: vs(14),
  },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: vs(12),
    gap: s(12),
  },
  supportIcon: { fontSize: fs(22) },
  supportContactLabel: { fontSize: fs(11), color: '#aaa', fontWeight: '600', marginBottom: vs(2) },
  supportContactValue: { fontSize: fs(14), color: '#388E3C', fontWeight: '700' },

  versionSection: {
    alignItems:   'center',
    paddingTop:   vs(8),
    paddingBottom: vs(12),
  },
  versionText: {
    fontSize: fs(12),
    color:    '#ccc',
  },
  versionSub: {
    fontSize:  fs(11),
    color:     '#ddd',
    marginTop: vs(2),
  },
});

const statStyles = StyleSheet.create({
  box: {
    width:           '47%',
    backgroundColor: '#fff',
    borderRadius:    14,
    padding:         s(14),
    alignItems:      'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  label: {
    fontSize:      fs(10),
    color:         '#aaa',
    fontWeight:    '700',
    letterSpacing: 0.4,
    marginBottom:  vs(6),
  },
  value: {
    fontSize:   fs(26),
    fontWeight: 'bold',
    color:      '#388E3C',
  },
  unit: {
    fontSize:  fs(10),
    color:     '#bbb',
    marginTop: vs(2),
  },
});

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: s(24),
    paddingBottom: vs(36),
    paddingTop: vs(12),
  },
  handle: {
    width: s(40), height: vs(4), borderRadius: 2,
    backgroundColor: '#ddd', alignSelf: 'center', marginBottom: vs(20),
  },
  title: {
    fontSize: fs(18), fontWeight: 'bold', color: '#1a1a1a', marginBottom: vs(8),
  },
  subtitle: {
    fontSize: fs(13), color: '#888', lineHeight: vs(20), marginBottom: vs(24),
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: vs(14),
    borderTopWidth: 1, borderTopColor: '#f5f5f5',
    gap: s(14),
  },
  rowIcon:  { fontSize: fs(22) },
  rowInfo:  { flex: 1 },
  rowLabel: { fontSize: fs(15), fontWeight: '600', color: '#222', marginBottom: vs(2) },
  rowDesc:  { fontSize: fs(12), color: '#aaa' },
  closeBtn: {
    marginTop: vs(16),
    backgroundColor: '#388E3C',
    borderRadius: 14,
    paddingVertical: vs(14),
    alignItems: 'center',
  },
  closeBtnText: { color: '#fff', fontWeight: 'bold', fontSize: fs(15) },
  legalText: { fontSize: fs(13), color: '#444', lineHeight: vs(22) },

  reminderBlock: {
    borderTopWidth: 1, borderTopColor: '#f5f5f5', paddingTop: vs(10), marginBottom: vs(4),
  },
  timePicker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: s(6), paddingVertical: vs(8),
    backgroundColor: '#f8f8f8', borderRadius: 12, marginBottom: vs(6),
  },
  timeCol:     { alignItems: 'center', gap: vs(4) },
  timeBtn:     { width: s(36), height: vs(24), alignItems: 'center', justifyContent: 'center', backgroundColor: '#eee', borderRadius: 6 },
  timeArrow:   { fontSize: fs(12), color: '#388E3C', fontWeight: 'bold' },
  timeDisplay: { width: s(48), height: vs(38), alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 8, borderWidth: 1.5, borderColor: '#e0e0e0' },
  timeDigit:   { fontSize: fs(20), fontWeight: 'bold', color: '#1a1a1a' },
  timeColon:   { fontSize: fs(20), fontWeight: 'bold', color: '#1a1a1a', marginBottom: vs(2) },
});

const repStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  vs(12),
    gap:           s(8),
  },
  dot: {
    width:        s(10),
    height:       s(10),
    borderRadius: 5,
  },
  label: {
    fontSize: fs(13),
    color:    '#555',
    width:    s(130),
  },
  barBg: {
    flex:            1,
    height:          vs(8),
    backgroundColor: '#f0f0f0',
    borderRadius:    4,
    overflow:        'hidden',
  },
  barFill: {
    height:       vs(8),
    borderRadius: 4,
  },
  pct: {
    fontSize:   fs(12),
    fontWeight: '700',
    width:      s(34),
    textAlign:  'right',
  },
});
