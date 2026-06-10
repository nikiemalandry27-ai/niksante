/**
 * NikSanté — HeartRateScreen
 *
 * Estimation indicative de la fréquence cardiaque via la caméra (PPG passif).
 * L'utilisateur place son doigt sur la caméra arrière avec le flash activé.
 * La variation de luminosité entre les images est analysée pour détecter les pulsations.
 *
 * ⚠️ FONCTIONNALITÉ INDICATIVE UNIQUEMENT — PAS UN DISPOSITIF MÉDICAL.
 */

import { useRef, useState, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Animated,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { s, fs, vs } from '@/utils/responsive';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = 'disclaimer' | 'instruction' | 'measuring' | 'processing' | 'result' | 'error';

interface Sample {
  size:      number;
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
  message:    string;
} {
  if (samples.length < 15) {
    return { bpm: null, confidence: 0, message: 'Pas assez de données — gardez le doigt sur la caméra' };
  }

  const sizes      = samples.map((s) => s.size);
  const timestamps = samples.map((s) => s.timestamp);

  // Check signal presence: std must be significant
  const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  const std  = Math.sqrt(sizes.map((v) => (v - mean) ** 2).reduce((a, b) => a + b, 0) / sizes.length);

  if (mean === 0 || std / mean < 0.005) {
    return { bpm: null, confidence: 0, message: 'Doigt non détecté — posez bien votre doigt sur la caméra arrière' };
  }

  // Normalize
  const normalized = sizes.map((v) => (v - mean) / (std || 1));

  // Smooth (window 3)
  const smoothed = movingAverage(normalized, 3);

  // Peak detection: local maxima above threshold with min distance
  const threshold    = 0.2;
  const minDist      = Math.max(2, Math.floor(samples.length / 20));
  const peaks: number[] = [];

  for (let i = 1; i < smoothed.length - 1; i++) {
    if (
      smoothed[i] > threshold &&
      smoothed[i] > smoothed[i - 1] &&
      smoothed[i] > smoothed[i + 1]
    ) {
      if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minDist) {
        peaks.push(i);
      }
    }
  }

  if (peaks.length < 3) {
    return {
      bpm:        null,
      confidence: 0,
      message:    'Signal insuffisant — restez immobile, éclairez bien le doigt',
    };
  }

  // RR intervals using actual timestamps
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    const dt = (timestamps[peaks[i]] - timestamps[peaks[i - 1]]) / 1000; // seconds
    if (dt > 0.2 && dt < 3.0) intervals.push(dt);
  }

  if (intervals.length < 2) {
    return { bpm: null, confidence: 0, message: 'Intervalles irréguliers — réessayez en restant immobile' };
  }

  // Median RR interval (robust to outliers)
  const sorted = [...intervals].sort((a, b) => a - b);
  const medianRR = sorted[Math.floor(sorted.length / 2)];
  const bpm      = Math.round(60 / medianRR);

  if (bpm < 40 || bpm > 200) {
    return { bpm: null, confidence: 0, message: 'Résultat hors plage physiologique — réessayez' };
  }

  // Confidence based on peak count and signal quality
  const confidence = Math.min(95, peaks.length * 12 + Math.round(std / mean * 500));

  return { bpm, confidence, message: 'Mesure effectuée' };
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export default function HeartRateScreen() {
  const router    = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [phase,       setPhase]       = useState<Phase>('disclaimer');
  const [countdown,   setCountdown]   = useState(15);
  const [bpm,         setBpm]         = useState<number | null>(null);
  const [confidence,  setConfidence]  = useState(0);
  const [errorMsg,    setErrorMsg]    = useState('');
  const [cameraReady, setCameraReady] = useState(false);

  const samplesRef      = useRef<Sample[]>([]);
  const measuringRef    = useRef(false);
  const countdownRef    = useRef<NodeJS.Timeout>();
  const heartbeatAnim   = useRef(new Animated.Value(1)).current;

  // ── Animation battement ──────────────────────────────────────────────────

  const startHeartbeat = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(heartbeatAnim, { toValue: 1.18, duration: 400, useNativeDriver: true }),
        Animated.timing(heartbeatAnim, { toValue: 1.0,  duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [heartbeatAnim]);

  // ── Capture loop ─────────────────────────────────────────────────────────

  const captureFrame = useCallback(async () => {
    if (!measuringRef.current || !cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality:         0.05,
        skipProcessing:  true,
      });

      const info = await FileSystem.getInfoAsync(photo.uri);
      const size = (info as any).size ?? 0;

      samplesRef.current.push({ size, timestamp: Date.now() });

      // Clean up the temporary file
      await FileSystem.deleteAsync(photo.uri, { idempotent: true });
    } catch {}

    if (measuringRef.current) {
      setTimeout(captureFrame, 280);
    }
  }, []);

  // ── Start measurement ────────────────────────────────────────────────────

  const startMeasurement = useCallback(async () => {
    if (!permission?.granted) {
      await requestPermission();
      return;
    }

    samplesRef.current  = [];
    measuringRef.current = true;
    setPhase('measuring');
    setCountdown(15);
    startHeartbeat();

    // Start capture loop
    captureFrame();

    // Countdown tick
    let remaining = 15;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownRef.current);
        measuringRef.current = false;
        heartbeatAnim.stopAnimation();
        setPhase('processing');

        // Analyze after a short delay for last frames
        setTimeout(() => {
          const result = analyzePPG(samplesRef.current);
          if (result.bpm !== null) {
            setBpm(result.bpm);
            setConfidence(result.confidence);
            setPhase('result');
          } else {
            setErrorMsg(result.message);
            setPhase('error');
          }
        }, 600);
      }
    }, 1000);
  }, [permission, captureFrame, startHeartbeat, heartbeatAnim, requestPermission]);

  const handleRetry = () => {
    clearInterval(countdownRef.current);
    measuringRef.current = false;
    heartbeatAnim.stopAnimation();
    heartbeatAnim.setValue(1);
    setBpm(null);
    setErrorMsg('');
    setPhase('instruction');
  };

  // ── Permission requise ────────────────────────────────────────────────────

  if (!permission) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color="#E53935" />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.centered}>
        <ThemedText style={styles.bigEmoji}>📷</ThemedText>
        <ThemedText style={styles.permTitle}>Accès caméra requis</ThemedText>
        <ThemedText style={styles.permSub}>
          La mesure de fréquence cardiaque nécessite l'accès à la caméra.
        </ThemedText>
        <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
          <ThemedText style={styles.primaryBtnText}>Autoriser la caméra</ThemedText>
        </TouchableOpacity>
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
        <ScrollView contentContainerStyle={styles.disclaimerContent}>
          <ThemedText style={styles.bigEmoji}>❤️</ThemedText>
          <ThemedText style={styles.disclaimerTitle}>Avant de commencer</ThemedText>

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
              La caméra arrière et le flash détectent les variations de luminosité dues aux pulsations sanguines (PPG). La précision dépend de la stabilité du doigt et des conditions d'éclairage.
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
        <ScrollView contentContainerStyle={styles.disclaimerContent}>
          <ThemedText style={styles.bigEmoji}>👆</ThemedText>
          <ThemedText style={styles.disclaimerTitle}>Instructions</ThemedText>

          {[
            { step: '1', text: 'Placez le bout de votre index sur la caméra arrière' },
            { step: '2', text: 'Couvrez complètement la caméra et le flash' },
            { step: '3', text: 'Appuyez doucement — ne bloquez pas le flash' },
            { step: '4', text: 'Restez immobile pendant 15 secondes' },
          ].map((item) => (
            <View key={item.step} style={styles.stepRow}>
              <View style={styles.stepBadge}>
                <ThemedText style={styles.stepNum}>{item.step}</ThemedText>
              </View>
              <ThemedText style={styles.stepText}>{item.text}</ThemedText>
            </View>
          ))}

          <TouchableOpacity
            style={[styles.primaryBtn, !cameraReady && { opacity: 0.5 }]}
            onPress={startMeasurement}
            disabled={!cameraReady}
          >
            <ThemedText style={styles.primaryBtnText}>
              {cameraReady ? '▶  Démarrer la mesure (15 s)' : 'Caméra en initialisation…'}
            </ThemedText>
          </TouchableOpacity>

          {/* Hidden camera to warm up */}
          <View style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}>
            <CameraView
              ref={cameraRef}
              style={{ width: 1, height: 1 }}
              facing="back"
              enableTorch
              onCameraReady={() => setCameraReady(true)}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Measuring ─────────────────────────────────────────────────────────────

  if (phase === 'measuring') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#1a0000' }]}>
        {/* Hidden camera running */}
        <View style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}>
          <CameraView
            ref={cameraRef}
            style={{ width: 1, height: 1 }}
            facing="back"
            enableTorch
          />
        </View>

        <View style={styles.measuringContent}>
          <Animated.Text style={[styles.heartIcon, { transform: [{ scale: heartbeatAnim }] }]}>
            ❤️
          </Animated.Text>

          <ThemedText style={styles.countdownText}>{countdown}</ThemedText>
          <ThemedText style={styles.countdownLabel}>secondes restantes</ThemedText>

          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${((15 - countdown) / 15) * 100}%` }]} />
          </View>

          <ThemedText style={styles.measuringHint}>
            {samplesRef.current.length} échantillons capturés
          </ThemedText>
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
        <ThemedText style={styles.processingText}>Analyse du signal…</ThemedText>
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
        <View style={styles.resultContent}>
          <ThemedText style={styles.bigEmoji}>😕</ThemedText>
          <ThemedText style={styles.errorTitle}>Mesure impossible</ThemedText>
          <ThemedText style={styles.errorMsg}>{errorMsg}</ThemedText>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleRetry}>
            <ThemedText style={styles.primaryBtnText}>🔄  Réessayer</ThemedText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Result ────────────────────────────────────────────────────────────────

  const bpmColor = bpm
    ? bpm < 60 ? '#1565C0' : bpm > 100 ? '#F57C00' : '#388E3C'
    : '#aaa';

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
          <View style={[styles.bpmBadge, { backgroundColor: bpmColor + '20', borderColor: bpmColor }]}>
            <ThemedText style={[styles.bpmBadgeText, { color: bpmColor }]}>
              {bpm! < 60 ? 'Bradycardie' : bpm! > 100 ? 'Tachycardie' : 'Normal'}
            </ThemedText>
          </View>
          <ThemedText style={styles.confidenceText}>
            Confiance : {confidence}% — {samplesRef.current.length} échantillons
          </ThemedText>
        </View>

        <View style={styles.warningBox}>
          <ThemedText style={styles.warningText}>
            ⚠️ Cette fonctionnalité fournit une estimation de la fréquence cardiaque à titre informatif uniquement. Elle ne constitue pas un dispositif médical.
          </ThemedText>
        </View>

        <View style={styles.infoCard}>
          <ThemedText style={styles.infoTitle}>Plages de référence indicatives</ThemedText>
          {[
            { label: 'Bradycardie',  range: '< 60 bpm',     color: '#1565C0' },
            { label: 'Normal',       range: '60–100 bpm',   color: '#388E3C' },
            { label: 'Tachycardie',  range: '> 100 bpm',    color: '#F57C00' },
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

  disclaimerContent: { alignItems: 'center', paddingHorizontal: s(24), paddingVertical: vs(24), gap: vs(16) },

  bigEmoji:       { fontSize: fs(56), marginBottom: vs(4) },
  disclaimerTitle:{ fontSize: fs(22), fontWeight: 'bold', color: '#1a1a1a', textAlign: 'center' },

  warningBox: {
    width: '100%', backgroundColor: '#FFF8E1', borderRadius: 14,
    padding: s(16), borderLeftWidth: 4, borderLeftColor: '#F57C00',
  },
  warningTitle: { fontSize: fs(14), fontWeight: 'bold', color: '#E65100', marginBottom: vs(8) },
  warningText:  { fontSize: fs(13), color: '#5D4037', lineHeight: vs(20) },

  infoCard: {
    width: '100%', backgroundColor: '#fff', borderRadius: 14, padding: s(16),
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  infoTitle: { fontSize: fs(13), fontWeight: '700', color: '#555', marginBottom: vs(8) },
  infoText:  { fontSize: fs(13), color: '#555', lineHeight: vs(20) },

  stepRow: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: s(14),
    backgroundColor: '#fff', borderRadius: 12, padding: s(14),
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2,
  },
  stepBadge: {
    width: s(32), height: s(32), borderRadius: s(16),
    backgroundColor: '#E53935', alignItems: 'center', justifyContent: 'center',
  },
  stepNum:  { color: '#fff', fontWeight: 'bold', fontSize: fs(14) },
  stepText: { flex: 1, fontSize: fs(14), color: '#333', lineHeight: vs(20) },

  primaryBtn: {
    width: '100%', backgroundColor: '#E53935', borderRadius: 14,
    paddingVertical: vs(16), alignItems: 'center', marginTop: vs(8),
  },
  primaryBtnText: { color: '#fff', fontWeight: 'bold', fontSize: fs(15) },

  permTitle: { fontSize: fs(20), fontWeight: 'bold', color: '#1a1a1a', marginBottom: vs(10), textAlign: 'center' },
  permSub:   { fontSize: fs(14), color: '#888', textAlign: 'center', lineHeight: vs(22), marginBottom: vs(24) },

  // Measuring
  measuringContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: s(32) },
  heartIcon:        { fontSize: fs(80), marginBottom: vs(24) },
  countdownText:    { fontSize: fs(72), fontWeight: 'bold', color: '#E53935' },
  countdownLabel:   { fontSize: fs(14), color: 'rgba(255,255,255,0.7)', marginBottom: vs(24) },
  progressBar: {
    width: '100%', height: vs(8), backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4, overflow: 'hidden', marginBottom: vs(20),
  },
  progressFill:   { height: vs(8), backgroundColor: '#E53935', borderRadius: 4 },
  measuringHint:  { fontSize: fs(13), color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: vs(4) },

  // Processing
  processingText: { fontSize: fs(16), color: '#555', marginTop: vs(16) },

  // Result
  resultContent: { alignItems: 'center', paddingHorizontal: s(24), paddingVertical: vs(24), gap: vs(16) },

  bpmCard: {
    width: '100%', backgroundColor: '#fff', borderRadius: 20,
    padding: s(24), alignItems: 'center', borderWidth: 2,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6,
  },
  bpmLabel:     { fontSize: fs(11), color: '#aaa', fontWeight: '700', letterSpacing: 0.8, marginBottom: vs(8) },
  bpmValue:     { fontSize: fs(72), fontWeight: 'bold', lineHeight: vs(76) },
  bpmUnit:      { fontSize: fs(18), fontWeight: '600', marginBottom: vs(12) },
  bpmBadge: {
    borderRadius: 20, borderWidth: 1.5,
    paddingVertical: vs(6), paddingHorizontal: s(16), marginBottom: vs(12),
  },
  bpmBadgeText:   { fontSize: fs(14), fontWeight: '700' },
  confidenceText: { fontSize: fs(11), color: '#aaa' },

  refRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: vs(6), gap: s(10) },
  refDot: { width: s(10), height: s(10), borderRadius: 5 },
  refLabel: { flex: 1, fontSize: fs(13), color: '#555' },
  refRange: { fontSize: fs(13), fontWeight: '700' },

  // Error
  errorTitle: { fontSize: fs(20), fontWeight: 'bold', color: '#B71C1C', textAlign: 'center', marginBottom: vs(12) },
  errorMsg:   { fontSize: fs(14), color: '#555', textAlign: 'center', lineHeight: vs(22), marginBottom: vs(24) },
});
