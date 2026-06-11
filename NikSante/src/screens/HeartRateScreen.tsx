/**
 * NikSanté — HeartRateScreen
 *
 * Mesure PPG réelle via react-native-vision-camera frame processors.
 * La caméra arrière + flash analysent la luminosité au doigt à ~30fps.
 *
 * ⚠️ ESTIMATION INDICATIVE — PAS UN DISPOSITIF MÉDICAL.
 */

import { useRef, useState, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Animated,
  Linking,
  Alert,
} from 'react-native';
// Imports natifs conditionnels — Expo Go ne supporte pas ces modules
//
// On sépare volontairement l'import de base (Camera + permission) de l'import
// worklets, afin que le hook de permission reste fonctionnel même si
// react-native-worklets-core échoue à charger.
let Camera: any             = null;
let useCameraDevice: any    = () => null;
let useCameraPermission: any = () => ({ hasPermission: false, requestPermission: async () => false });
let useFrameProcessor: any  = () => undefined;
let runOnJS: any            = (fn: any) => fn;
let nativeAvailable         = false;

// Étape 1 : caméra de base (ne dépend pas des worklets)
let cameraModuleLoaded = false;
try {
  const vc        = require('react-native-vision-camera');
  Camera              = vc.Camera;
  useCameraDevice     = vc.useCameraDevice;
  useCameraPermission = vc.useCameraPermission;
  cameraModuleLoaded  = true;
} catch { /* Expo Go */ }

// Étape 2 : worklets + frame processor (requis pour le PPG)
if (cameraModuleLoaded) {
  try {
    const vc        = require('react-native-vision-camera');
    const wc        = require('react-native-worklets-core');
    useFrameProcessor = vc.useFrameProcessor;
    runOnJS           = wc.runOnJS;
    nativeAvailable   = true;
  } catch { /* worklets indisponibles */ }
}
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { s, fs, vs } from '@/utils/responsive';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = 'disclaimer' | 'instruction' | 'measuring' | 'processing' | 'result' | 'error';

interface Sample {
  value:     number;  // average pixel brightness (Y channel)
  timestamp: number;
}

// ---------------------------------------------------------------------------
// PPG algorithm
// ---------------------------------------------------------------------------

function movingAverage(arr: number[], window: number): number[] {
  return arr.map((_, i) => {
    const start = Math.max(0, i - Math.floor(window / 2));
    const end   = Math.min(arr.length - 1, i + Math.floor(window / 2));
    const slice = arr.slice(start, end + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

function analyzePPG(samples: Sample[]): {
  bpm:        number | null;
  confidence: number;
  fps:        number;
  message:    string;
} {
  if (samples.length < 30) {
    return { bpm: null, confidence: 0, fps: 0, message: 'Pas assez de données — gardez le doigt immobile sur la caméra' };
  }

  const values     = samples.map((s) => s.value);
  const timestamps = samples.map((s) => s.timestamp);

  // Actual FPS
  const durationSec = (timestamps[timestamps.length - 1] - timestamps[0]) / 1000;
  const fps = Math.round(samples.length / durationSec);

  // Signal quality check
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std  = Math.sqrt(values.map((v) => (v - mean) ** 2).reduce((a, b) => a + b, 0) / values.length);

  if (std / (mean || 1) < 0.002) {
    return { bpm: null, confidence: 0, fps, message: 'Doigt non détecté — couvrez bien la caméra et le flash' };
  }

  // Normalize and smooth
  const normalized = values.map((v) => (v - mean) / (std || 1));
  const smoothed   = movingAverage(normalized, 5);

  // Peak detection
  const threshold = 0.15;
  const minDist   = Math.max(3, Math.floor(fps * 0.35)); // min 350ms between peaks
  const peaks: number[] = [];

  for (let i = 1; i < smoothed.length - 1; i++) {
    if (
      smoothed[i] > threshold &&
      smoothed[i] >= smoothed[i - 1] &&
      smoothed[i] >= smoothed[i + 1]
    ) {
      if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minDist) {
        peaks.push(i);
      }
    }
  }

  if (peaks.length < 4) {
    return {
      bpm:        null,
      confidence: 0,
      fps,
      message:    'Signal insuffisant — restez immobile, appuyez doucement sur la caméra',
    };
  }

  // RR intervals using actual timestamps
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    const dt = (timestamps[peaks[i]] - timestamps[peaks[i - 1]]) / 1000;
    if (dt > 0.25 && dt < 2.5) intervals.push(dt);
  }

  if (intervals.length < 3) {
    return { bpm: null, confidence: 0, fps, message: 'Intervalles irréguliers — réessayez en restant immobile' };
  }

  // Median RR interval
  const sorted   = [...intervals].sort((a, b) => a - b);
  const medianRR = sorted[Math.floor(sorted.length / 2)];
  const bpm      = Math.round(60 / medianRR);

  if (bpm < 40 || bpm > 200) {
    return { bpm: null, confidence: 0, fps, message: 'Résultat hors plage physiologique — réessayez' };
  }

  // RMSSD-based confidence
  const diffs = intervals.map((v, i, arr) => i > 0 ? Math.abs(v - arr[i - 1]) : 0).slice(1);
  const rmssd = Math.sqrt(diffs.map((d) => d ** 2).reduce((a, b) => a + b, 0) / (diffs.length || 1));
  const variabilityPenalty = Math.min(40, Math.round(rmssd * 200));
  const confidence = Math.min(97, 55 + peaks.length * 4 - variabilityPenalty);

  return { bpm, confidence, fps, message: 'Mesure effectuée' };
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export default function HeartRateScreen() {
  const router = useRouter();
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();

  const [phase,       setPhase]       = useState<Phase>('disclaimer');
  const [countdown,   setCountdown]   = useState(15);
  const [bpm,         setBpm]         = useState<number | null>(null);
  const [confidence,  setConfidence]  = useState(0);
  const [fps,         setFps]         = useState(0);
  const [errorMsg,    setErrorMsg]    = useState('');
  const [sampleCount, setSampleCount] = useState(0);

  const samplesRef   = useRef<Sample[]>([]);
  const measuringRef = useRef(false);
  const countdownRef = useRef<NodeJS.Timeout>();
  const heartAnim    = useRef(new Animated.Value(1)).current;

  // ── Heartbeat animation ───────────────────────────────────────────────────

  const startHeartbeat = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(heartAnim, { toValue: 1.2,  duration: 350, useNativeDriver: true }),
        Animated.timing(heartAnim, { toValue: 1.0,  duration: 650, useNativeDriver: true }),
      ])
    ).start();
  }, [heartAnim]);

  // ── Frame callback (called from worklet via runOnJS) ──────────────────────

  const onFrame = useCallback((brightness: number) => {
    if (!measuringRef.current) return;
    samplesRef.current.push({ value: brightness, timestamp: Date.now() });
    if (samplesRef.current.length % 10 === 0) {
      setSampleCount(samplesRef.current.length);
    }
  }, []);

  // ── Frame processor — runs at camera FPS (~30fps) ─────────────────────────

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    try {
      const buffer = frame.toArrayBuffer();
      const data   = new Uint8Array(buffer);

      // Sample Y channel (luminance) uniformly — YUV_420: Y plane = first w*h bytes
      const totalPixels = frame.width * frame.height;
      const step        = Math.max(1, Math.floor(totalPixels / 400));

      let sum   = 0;
      let count = 0;
      for (let i = 0; i < totalPixels; i += step) {
        sum += data[i];
        count++;
      }

      runOnJS(onFrame)(count > 0 ? sum / count : 0);
    } catch {
      // skip frame on read error
    }
  }, [onFrame]);

  // ── Start measurement ─────────────────────────────────────────────────────

  const startMeasurement = useCallback(async () => {
    if (!hasPermission) {
      await requestPermission();
      return;
    }

    samplesRef.current   = [];
    measuringRef.current = true;
    setSampleCount(0);
    setPhase('measuring');
    setCountdown(15);
    startHeartbeat();

    let remaining = 15;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownRef.current);
        measuringRef.current = false;
        heartAnim.stopAnimation();
        setPhase('processing');

        setTimeout(() => {
          const result = analyzePPG(samplesRef.current);
          if (result.bpm !== null) {
            setBpm(result.bpm);
            setConfidence(result.confidence);
            setFps(result.fps);
            setPhase('result');
          } else {
            setErrorMsg(result.message);
            setPhase('error');
          }
        }, 400);
      }
    }, 1000);
  }, [hasPermission, requestPermission, startHeartbeat, heartAnim]);

  const handleRetry = useCallback(() => {
    clearInterval(countdownRef.current);
    measuringRef.current = false;
    heartAnim.stopAnimation();
    heartAnim.setValue(1);
    setBpm(null);
    setErrorMsg('');
    setPhase('instruction');
  }, [heartAnim]);

  // ── Permission ────────────────────────────────────────────────────────────

  const handleRequestPermission = useCallback(async () => {
    const result = await requestPermission();
    // result peut être boolean (v4) ou PermissionStatus string (selon la version)
    const granted = result === true || result === 'granted' || result === 'authorized';
    if (!granted) {
      Alert.alert(
        'Permission caméra refusée',
        "Autorisez l'accès à la caméra dans les paramètres de l'application pour utiliser la mesure de fréquence cardiaque.",
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Ouvrir les paramètres', onPress: () => Linking.openSettings() },
        ]
      );
    }
  }, [requestPermission]);

  // Expo Go ou worklets indisponibles — afficher AVANT le check permission
  // pour éviter que le mock permission hook rende le bouton inactif
  if (!nativeAvailable) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ThemedText style={styles.backText}>← Retour</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Fréquence cardiaque</ThemedText>
          <View style={{ width: s(60) }} />
        </View>
        <View style={styles.centered}>
          <ThemedText style={{ fontSize: fs(48), marginBottom: vs(16) }}>📱</ThemedText>
          <ThemedText style={[styles.permTitle, { textAlign: 'center' }]}>
            Disponible dans le build complet
          </ThemedText>
          <ThemedText style={[styles.permSub, { textAlign: 'center' }]}>
            Cette fonctionnalité utilise la caméra en temps réel et nécessite un build natif (EAS Build). Elle n'est pas disponible dans Expo Go.
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.centered}>
        <ThemedText style={styles.bigEmoji}>📷</ThemedText>
        <ThemedText style={styles.permTitle}>Accès caméra requis</ThemedText>
        <ThemedText style={styles.permSub}>
          La mesure de fréquence cardiaque nécessite l'accès à la caméra arrière.
        </ThemedText>
        <TouchableOpacity style={styles.primaryBtn} onPress={handleRequestPermission}>
          <ThemedText style={styles.primaryBtnText}>Autoriser la caméra</ThemedText>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color="#E53935" />
        <ThemedText style={styles.processingText}>Caméra non disponible</ThemedText>
      </SafeAreaView>
    );
  }

  // ── Disclaimer ────────────────────────────────────────────────────────────

  if (phase === 'disclaimer') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ThemedText style={styles.backText}>← Retour</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Fréquence cardiaque</ThemedText>
          <View style={{ width: s(60) }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText style={styles.bigEmoji}>❤️</ThemedText>
          <ThemedText style={styles.pageTitle}>Avant de commencer</ThemedText>

          <View style={styles.warningBox}>
            <ThemedText style={styles.warningTitle}>⚠️ Avertissement important</ThemedText>
            <ThemedText style={styles.warningText}>
              Cette fonctionnalité fournit une estimation de la fréquence cardiaque à titre informatif uniquement.{'\n\n'}
              Elle ne constitue pas un dispositif médical certifié et ne doit pas être utilisée pour prendre des décisions médicales.{'\n\n'}
              Consultez un professionnel de santé pour tout suivi cardiaque.
            </ThemedText>
          </View>

          <View style={styles.infoCard}>
            <ThemedText style={styles.infoTitle}>Comment ça fonctionne</ThemedText>
            <ThemedText style={styles.infoText}>
              La caméra arrière et le flash analysent en temps réel les variations de luminosité dues aux pulsations sanguines (photopléthysmographie — PPG). La mesure dure 15 secondes à ~30 images/seconde.
            </ThemedText>
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={() => setPhase('instruction')}>
            <ThemedText style={styles.primaryBtnText}>J'ai compris — Continuer</ThemedText>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Instruction ───────────────────────────────────────────────────────────

  if (phase === 'instruction') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ThemedText style={styles.backText}>← Retour</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Fréquence cardiaque</ThemedText>
          <View style={{ width: s(60) }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>

          {/* Illustration */}
          <View style={styles.illustrationBox}>
            <ThemedText style={styles.illustrationEmoji}>📱</ThemedText>
            <ThemedText style={styles.illustrationArrow}>←</ThemedText>
            <ThemedText style={styles.illustrationEmoji}>👆</ThemedText>
          </View>
          <ThemedText style={styles.pageTitle}>Comment mesurer</ThemedText>
          <ThemedText style={styles.pageSubtitle}>
            Placez votre doigt sur la caméra arrière pour démarrer
          </ThemedText>

          {/* Étapes */}
          {[
            { step: '1', icon: '👆', text: 'Posez le bout de votre index sur la caméra arrière', sub: 'La caméra se trouve au dos du téléphone' },
            { step: '2', icon: '💡', text: 'Couvrez entièrement la caméra ET le flash', sub: 'Le flash doit être caché sous votre doigt' },
            { step: '3', icon: '🤏', text: 'Appuyez doucement sans serrer', sub: 'Trop de pression bloque la circulation sanguine' },
            { step: '4', icon: '🧘', text: 'Restez immobile pendant 15 secondes', sub: 'Tout mouvement fausse la mesure' },
          ].map((item) => (
            <View key={item.step} style={styles.stepCard}>
              <View style={styles.stepBadge}>
                <ThemedText style={styles.stepNum}>{item.step}</ThemedText>
              </View>
              <View style={styles.stepBody}>
                <ThemedText style={styles.stepIcon}>{item.icon}</ThemedText>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.stepText}>{item.text}</ThemedText>
                  <ThemedText style={styles.stepSub}>{item.sub}</ThemedText>
                </View>
              </View>
            </View>
          ))}

          {/* Note importante */}
          <View style={styles.noteBox}>
            <ThemedText style={styles.noteTitle}>💡 Conseils pour un bon résultat</ThemedText>
            <ThemedText style={styles.noteText}>
              • Posez le téléphone sur une table pour éviter les tremblements{'\n'}
              • Asseyez-vous et restez calme quelques secondes avant de mesurer{'\n'}
              • Évitez de parler pendant la mesure{'\n'}
              • Si le résultat semble incorrect, attendez 1 minute et réessayez
            </ThemedText>
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={startMeasurement}>
            <ThemedText style={styles.primaryBtnText}>▶  Démarrer la mesure (15 s)</ThemedText>
          </TouchableOpacity>

          <View style={{ height: vs(8) }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Measuring ─────────────────────────────────────────────────────────────

  if (phase === 'measuring') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#0d0000' }]}>
        {/* Camera active — frame processor running */}
        <View style={StyleSheet.absoluteFillObject}>
          <Camera
            style={StyleSheet.absoluteFillObject}
            device={device}
            isActive
            torch="on"
            pixelFormat="yuv"
            frameProcessor={frameProcessor}
          />
          {/* Dark overlay so UI is readable */}
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.88)' }]} />
        </View>

        <View style={styles.measuringContent}>
          <Animated.Text style={[styles.heartIcon, { transform: [{ scale: heartAnim }] }]}>
            ❤️
          </Animated.Text>

          <ThemedText style={styles.countdownText}>{countdown}</ThemedText>
          <ThemedText style={styles.countdownLabel}>secondes restantes</ThemedText>

          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${((15 - countdown) / 15) * 100}%` as any }]} />
          </View>

          <ThemedText style={styles.measuringHint}>{sampleCount} trames analysées</ThemedText>
          <ThemedText style={styles.measuringHint}>Gardez le doigt immobile sur la caméra</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  // ── Processing ────────────────────────────────────────────────────────────

  if (phase === 'processing') {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: '#f5f5f5' }]}>
        <ActivityIndicator size="large" color="#E53935" />
        <ThemedText style={styles.processingText}>Analyse du signal PPG…</ThemedText>
        <ThemedText style={styles.processingSubText}>{sampleCount} échantillons traités</ThemedText>
      </SafeAreaView>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (phase === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ThemedText style={styles.backText}>← Retour</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Résultat</ThemedText>
          <View style={{ width: s(60) }} />
        </View>
        <ScrollView contentContainerStyle={styles.resultContent}>
          <ThemedText style={styles.bigEmoji}>😕</ThemedText>
          <ThemedText style={styles.errorTitle}>Mesure impossible</ThemedText>
          <ThemedText style={styles.errorMsg}>{errorMsg}</ThemedText>
          <View style={styles.infoCard}>
            <ThemedText style={styles.infoTitle}>Conseils pour mieux mesurer</ThemedText>
            <ThemedText style={styles.infoText}>
              • Couvrez entièrement la caméra et le flash{'\n'}
              • Appuyez légèrement (trop fort peut bloquer la circulation){'\n'}
              • Restez dans une pièce éclairée normalement{'\n'}
              • Évitez tout mouvement du téléphone et du doigt
            </ThemedText>
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleRetry}>
            <ThemedText style={styles.primaryBtnText}>🔄  Réessayer</ThemedText>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Result ────────────────────────────────────────────────────────────────

  const bpmColor = bpm
    ? bpm < 60 ? '#1565C0' : bpm > 100 ? '#F57C00' : '#388E3C'
    : '#aaa';

  const bpmLabel = bpm
    ? bpm < 60 ? 'Bradycardie' : bpm > 100 ? 'Tachycardie' : 'Normal'
    : '';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ThemedText style={styles.backText}>← Retour</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Résultat</ThemedText>
        <View style={{ width: s(60) }} />
      </View>

      <ScrollView contentContainerStyle={styles.resultContent}>
        <View style={[styles.bpmCard, { borderColor: bpmColor }]}>
          <ThemedText style={styles.bpmLabel}>FRÉQUENCE CARDIAQUE ESTIMÉE</ThemedText>
          <ThemedText style={[styles.bpmValue, { color: bpmColor }]}>{bpm}</ThemedText>
          <ThemedText style={[styles.bpmUnit, { color: bpmColor }]}>BPM</ThemedText>
          <View style={[styles.bpmBadge, { backgroundColor: bpmColor + '18', borderColor: bpmColor }]}>
            <ThemedText style={[styles.bpmBadgeText, { color: bpmColor }]}>{bpmLabel}</ThemedText>
          </View>
          <ThemedText style={styles.confidenceText}>
            Confiance : {confidence}%  ·  {sampleCount} trames  ·  ~{fps} fps
          </ThemedText>
        </View>

        <View style={styles.warningBox}>
          <ThemedText style={styles.warningText}>
            ⚠️ Cette estimation est fournie à titre informatif uniquement. Elle ne constitue pas un dispositif médical.
          </ThemedText>
        </View>

        <View style={styles.infoCard}>
          <ThemedText style={styles.infoTitle}>Plages de référence indicatives</ThemedText>
          {[
            { label: 'Bradycardie',  range: '< 60 bpm',    color: '#1565C0' },
            { label: 'Normal',       range: '60–100 bpm',  color: '#388E3C' },
            { label: 'Tachycardie',  range: '> 100 bpm',   color: '#F57C00' },
          ].map((row) => (
            <View key={row.label} style={styles.refRow}>
              <View style={[styles.refDot, { backgroundColor: row.color }]} />
              <ThemedText style={styles.refLabel}>{row.label}</ThemedText>
              <ThemedText style={[styles.refRange, { color: row.color }]}>{row.range}</ThemedText>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={handleRetry}>
          <ThemedText style={styles.primaryBtnText}>🔄  Nouvelle mesure</ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: s(32), backgroundColor: '#f5f5f5' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: s(20), paddingTop: vs(16), paddingBottom: vs(12),
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backBtn:     { padding: 4 },
  backText:    { color: '#E53935', fontWeight: '600', fontSize: fs(15) },
  headerTitle: { fontSize: fs(17), fontWeight: 'bold', color: '#1a1a1a' },

  scrollContent: {
    alignItems: 'center', paddingHorizontal: s(24), paddingVertical: vs(24), gap: vs(16),
  },

  bigEmoji:  { fontSize: fs(56) },
  pageTitle: { fontSize: fs(22), fontWeight: 'bold', color: '#1a1a1a', textAlign: 'center' },

  warningBox: {
    width: '100%', backgroundColor: '#FFF8E1', borderRadius: 14,
    padding: s(16), borderLeftWidth: 4, borderLeftColor: '#F57C00',
  },
  warningTitle: { fontSize: fs(14), fontWeight: 'bold', color: '#E65100', marginBottom: vs(8) },
  warningText:  { fontSize: fs(13), color: '#5D4037', lineHeight: vs(20) },

  infoCard: {
    width: '100%', backgroundColor: '#fff', borderRadius: 14, padding: s(16),
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3,
  },
  infoTitle: { fontSize: fs(13), fontWeight: '700', color: '#555', marginBottom: vs(8) },
  infoText:  { fontSize: fs(13), color: '#555', lineHeight: vs(20) },

  // Illustration
  illustrationBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: s(12), marginBottom: vs(4),
  },
  illustrationEmoji: { fontSize: fs(48) },
  illustrationArrow: { fontSize: fs(28), color: '#E53935', fontWeight: 'bold' },
  pageSubtitle: { fontSize: fs(14), color: '#888', textAlign: 'center', marginTop: vs(-8) },

  // Steps
  stepCard: {
    width: '100%', backgroundColor: '#fff', borderRadius: 14, padding: s(14),
    flexDirection: 'row', alignItems: 'flex-start', gap: s(12),
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3,
  },
  stepRow: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: s(14),
    backgroundColor: '#fff', borderRadius: 12, padding: s(14),
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 2,
  },
  stepBadge: {
    width: s(30), height: s(30), borderRadius: s(15), marginTop: vs(2),
    backgroundColor: '#E53935', alignItems: 'center', justifyContent: 'center',
  },
  stepBody: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: s(10) },
  stepIcon: { fontSize: fs(20), marginTop: vs(1) },
  stepNum:  { color: '#fff', fontWeight: 'bold', fontSize: fs(13) },
  stepText: { fontSize: fs(14), color: '#222', fontWeight: '600', lineHeight: vs(20), marginBottom: vs(2) },
  stepSub:  { fontSize: fs(12), color: '#888', lineHeight: vs(17) },

  // Note box
  noteBox: {
    width: '100%', backgroundColor: '#E8F5E9', borderRadius: 14,
    padding: s(16), borderLeftWidth: 4, borderLeftColor: '#388E3C',
  },
  noteTitle: { fontSize: fs(13), fontWeight: '700', color: '#2E7D32', marginBottom: vs(8) },
  noteText:  { fontSize: fs(13), color: '#388E3C', lineHeight: vs(22) },

  primaryBtn: {
    width: '100%', backgroundColor: '#E53935', borderRadius: 14,
    paddingVertical: vs(16), alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: 'bold', fontSize: fs(15) },

  permTitle: { fontSize: fs(20), fontWeight: 'bold', color: '#1a1a1a', marginBottom: vs(10), textAlign: 'center' },
  permSub:   { fontSize: fs(14), color: '#888', textAlign: 'center', lineHeight: vs(22), marginBottom: vs(24) },

  // Measuring
  measuringContent: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: s(32),
  },
  heartIcon:      { fontSize: fs(80), marginBottom: vs(20) },
  countdownText:  { fontSize: fs(72), fontWeight: 'bold', color: '#E53935' },
  countdownLabel: { fontSize: fs(14), color: 'rgba(255,255,255,0.65)', marginBottom: vs(24) },
  progressBar: {
    width: '100%', height: vs(8), backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 4, overflow: 'hidden', marginBottom: vs(20),
  },
  progressFill:  { height: vs(8), backgroundColor: '#E53935', borderRadius: 4 },
  measuringHint: { fontSize: fs(13), color: 'rgba(255,255,255,0.55)', textAlign: 'center', marginTop: vs(4) },

  // Processing
  processingText:    { fontSize: fs(16), color: '#555', marginTop: vs(16) },
  processingSubText: { fontSize: fs(13), color: '#aaa', marginTop: vs(6) },

  // Result
  resultContent: {
    alignItems: 'center', paddingHorizontal: s(24), paddingVertical: vs(24), gap: vs(16),
  },
  bpmCard: {
    width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: s(24),
    alignItems: 'center', borderWidth: 2,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 6,
  },
  bpmLabel:     { fontSize: fs(11), color: '#aaa', fontWeight: '700', letterSpacing: 0.8, marginBottom: vs(6) },
  bpmValue:     { fontSize: fs(72), fontWeight: 'bold', lineHeight: vs(76) },
  bpmUnit:      { fontSize: fs(18), fontWeight: '600', marginBottom: vs(10) },
  bpmBadge: {
    borderRadius: 20, borderWidth: 1.5,
    paddingVertical: vs(5), paddingHorizontal: s(14), marginBottom: vs(10),
  },
  bpmBadgeText:   { fontSize: fs(14), fontWeight: '700' },
  confidenceText: { fontSize: fs(11), color: '#aaa', textAlign: 'center' },

  refRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: vs(6), gap: s(10) },
  refDot:   { width: s(10), height: s(10), borderRadius: 5 },
  refLabel: { flex: 1, fontSize: fs(13), color: '#555' },
  refRange: { fontSize: fs(13), fontWeight: '700' },

  // Error
  errorTitle: { fontSize: fs(20), fontWeight: 'bold', color: '#B71C1C', textAlign: 'center', marginBottom: vs(4) },
  errorMsg:   { fontSize: fs(14), color: '#555', textAlign: 'center', lineHeight: vs(22) },
});
