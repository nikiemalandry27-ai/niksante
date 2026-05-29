/**
 * NikSanté — FoodScanScreen
 *
 * Scanne un aliment avec la caméra → détection IA → infos nutritionnelles
 * + impact glycémique estimé pour les patients diabétiques.
 *
 * Flux :
 *  1. Demande de permission caméra
 *  2. Prévisualisation caméra + bouton capture
 *  3. Animation "Analyse en cours…"
 *  4. Résultats : aliment détecté + nutrition + conseils
 */

import { useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { foodService, DetectedFood } from '@/services/api';
import { ThemedText } from '@/components/themed-text';
import { s, fs, vs } from '@/utils/responsive';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = 'camera' | 'analyzing' | 'result';

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export default function FoodScanScreen() {
  const router     = useRouter();
  const cameraRef  = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [phase,    setPhase]   = useState<Phase>('camera');
  const [result,   setResult]  = useState<DetectedFood | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [errMsg,   setErrMsg]  = useState<string | null>(null);

  // ── Capture + détection ─────────────────────────────────────────────────

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    setErrMsg(null);
    setPhase('analyzing');

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality:  0.5,
        base64:   true,
      });

      setPhotoUri(photo.uri);

      if (!photo.base64) throw new Error('Base64 manquant');

      const detected = await foodService.detect(photo.base64);
      setResult(detected);
      setPhase('result');
    } catch (e: any) {
      setErrMsg('Détection impossible. Vérifiez votre connexion et réessayez.');
      setPhase('camera');
    }
  };

  const handleReset = () => {
    setPhase('camera');
    setResult(null);
    setPhotoUri(null);
    setErrMsg(null);
  };

  // ── Permission non accordée ─────────────────────────────────────────────

  if (!permission) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color="#388E3C" />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.centered}>
        <ThemedText style={styles.permEmoji}>📷</ThemedText>
        <ThemedText style={styles.permTitle}>Accès caméra requis</ThemedText>
        <ThemedText style={styles.permSub}>
          NikSanté a besoin de la caméra pour analyser vos aliments.
        </ThemedText>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <ThemedText style={styles.permBtnText}>Autoriser la caméra</ThemedText>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Analyse en cours ────────────────────────────────────────────────────

  if (phase === 'analyzing') {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: '#1a1a1a' }]}>
        {photoUri && (
          <Image source={{ uri: photoUri }} style={styles.analyzePhoto} blurRadius={3} />
        )}
        <View style={styles.analyzeOverlay}>
          <ActivityIndicator size="large" color="#388E3C" />
          <ThemedText style={styles.analyzeText}>Analyse en cours…</ThemedText>
          <ThemedText style={styles.analyzeSubText}>
            Identification de l'aliment et calcul de l'impact glycémique
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  // ── Résultats ────────────────────────────────────────────────────────────

  if (phase === 'result' && result) {
    const estimatedRiseMin = Math.round(result.carbs * 2.5);
    const estimatedRiseMax = Math.round(result.carbs * 4.5);

    return (
      <SafeAreaView style={styles.container}>
        {/* Miniature photo */}
        {photoUri && (
          <Image source={{ uri: photoUri }} style={styles.resultPhoto} />
        )}

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Aliment détecté */}
          <View style={[styles.detectedCard, { borderLeftColor: result.impactColor }]}>
            <View style={styles.detectedHeader}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.detectedLabel}>ALIMENT DÉTECTÉ</ThemedText>
                <ThemedText style={styles.detectedName}>{result.name}</ThemedText>
              </View>
              <View style={[styles.confidenceBadge, { backgroundColor: result.impactColor + '20', borderColor: result.impactColor }]}>
                <ThemedText style={[styles.confidenceText, { color: result.impactColor }]}>
                  {Math.round(result.confidence * 100)}%
                </ThemedText>
              </View>
            </View>

          </View>

          {/* Impact glycémique */}
          <View style={[styles.impactCard, { borderLeftColor: result.impactColor }]}>
            <ThemedText style={styles.impactLabel}>IMPACT GLYCÉMIQUE ESTIMÉ</ThemedText>
            <View style={styles.impactRow}>
              <ThemedText style={[styles.impactValue, { color: result.impactColor }]}>
                {result.carbs === 0 ? 'Nul' : `+${estimatedRiseMin}–${estimatedRiseMax} mg/dL`}
              </ThemedText>
              <View style={[styles.impactBadge, { backgroundColor: result.impactColor + '20', borderColor: result.impactColor }]}>
                <ThemedText style={[styles.impactBadgeText, { color: result.impactColor }]}>
                  {result.impact}
                </ThemedText>
              </View>
            </View>
            <ThemedText style={styles.impactTips}>💡 {result.tips}</ThemedText>
          </View>

          {/* Valeurs nutritionnelles */}
          <View style={styles.nutriCard}>
            <ThemedText style={styles.nutriTitle}>Valeurs nutritionnelles (portion standard)</ThemedText>
            <View style={styles.nutriGrid}>
              <NutriBox label="Glucides"  value={`${result.carbs}g`}    color="#F57C00" />
              <NutriBox label="Calories"  value={`${result.calories} kcal`} color="#7B1FA2" />
              <NutriBox label="Protéines" value={`${result.proteins}g`}  color="#1565C0" />
              <NutriBox label="Lipides"   value={`${result.fats}g`}      color="#388E3C" />
            </View>

            {result.gi > 0 && (
              <View style={styles.giRow}>
                <ThemedText style={styles.giLabel}>Index glycémique</ThemedText>
                <View style={styles.giBar}>
                  <View style={[
                    styles.giFill,
                    {
                      width: `${result.gi}%` as any,
                      backgroundColor: result.gi < 40 ? '#388E3C' : result.gi < 70 ? '#F57C00' : '#B71C1C',
                    }
                  ]} />
                </View>
                <ThemedText style={styles.giValue}>{result.gi}/100</ThemedText>
              </View>
            )}
          </View>

          {/* Boutons */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.scanAgainBtn} onPress={handleReset}>
              <ThemedText style={styles.scanAgainText}>📷  Scanner un autre aliment</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Caméra ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.cameraContainer}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" />

      {/* Cadre de visée */}
      <View style={styles.aimFrame}>
        <View style={[styles.corner, styles.cornerTL]} />
        <View style={[styles.corner, styles.cornerTR]} />
        <View style={[styles.corner, styles.cornerBL]} />
        <View style={[styles.corner, styles.cornerBR]} />
        <ThemedText style={styles.aimText}>Pointez vers un aliment</ThemedText>
      </View>

      {/* Message d'erreur */}
      {errMsg && (
        <View style={styles.errorBanner}>
          <ThemedText style={styles.errorText}>{errMsg}</ThemedText>
        </View>
      )}

      {/* Bouton capture */}
      <View style={styles.captureBar}>
        <TouchableOpacity style={styles.captureBtn} onPress={handleCapture}>
          <View style={styles.captureBtnInner} />
        </TouchableOpacity>
        <ThemedText style={styles.captureHint}>Appuyez pour analyser</ThemedText>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sous-composant NutriBox
// ---------------------------------------------------------------------------

function NutriBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[nutriStyles.box, { borderTopColor: color }]}>
      <ThemedText style={[nutriStyles.value, { color }]}>{value}</ThemedText>
      <ThemedText style={nutriStyles.label}>{label}</ThemedText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },

  // Permission
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: s(32), backgroundColor: '#f5f5f5' },
  permEmoji: { fontSize: fs(64), marginBottom: vs(20) },
  permTitle: { fontSize: fs(20), fontWeight: 'bold', color: '#1a1a1a', marginBottom: vs(10), textAlign: 'center' },
  permSub:   { fontSize: fs(14), color: '#888', textAlign: 'center', lineHeight: vs(22), marginBottom: vs(28) },
  permBtn:   { backgroundColor: '#388E3C', borderRadius: 12, paddingVertical: vs(15), paddingHorizontal: s(32) },
  permBtnText: { color: '#fff', fontWeight: 'bold', fontSize: fs(16) },

  // Analyse
  analyzePhoto: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.4 },
  analyzeOverlay: { alignItems: 'center', gap: vs(16) },
  analyzeText:    { color: '#fff', fontSize: fs(20), fontWeight: 'bold', marginTop: vs(16) },
  analyzeSubText: { color: '#aaa', fontSize: fs(13), textAlign: 'center', lineHeight: vs(20), maxWidth: s(260) },

  // Caméra
  cameraContainer: { flex: 1 },
  camera:          { flex: 1 },

  aimFrame: {
    position: 'absolute', top: '25%', left: '15%', right: '15%', bottom: '35%',
    alignItems: 'center', justifyContent: 'center',
  },
  corner:   { position: 'absolute', width: s(30), height: s(30), borderColor: '#fff', borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0 },
  cornerTR: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0 },
  aimText:  { color: 'rgba(255,255,255,0.8)', fontSize: fs(13), fontWeight: '600', marginTop: vs(100) },

  errorBanner: {
    position: 'absolute', top: vs(60), left: s(20), right: s(20),
    backgroundColor: 'rgba(183,28,28,0.9)', borderRadius: 10, padding: s(12),
  },
  errorText: { color: '#fff', fontSize: fs(13), textAlign: 'center' },

  captureBar: { position: 'absolute', bottom: vs(48), alignSelf: 'center', alignItems: 'center', gap: vs(10) },
  captureBtn: {
    width: s(76), height: s(76), borderRadius: s(38),
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  captureBtnInner: { width: s(54), height: s(54), borderRadius: s(27), backgroundColor: '#fff' },
  captureHint: { color: 'rgba(255,255,255,0.8)', fontSize: fs(12), fontWeight: '600' },

  // Résultats
  resultPhoto:  { width: '100%', height: vs(200) },

  detectedCard: {
    margin: s(16), backgroundColor: '#fff', borderRadius: 16, padding: s(16), borderLeftWidth: 5,
    elevation: 3, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  detectedHeader:  { flexDirection: 'row', alignItems: 'center' },
  detectedLabel:   { fontSize: fs(10), color: '#aaa', fontWeight: '700', letterSpacing: 0.8, marginBottom: vs(4) },
  detectedName:    { fontSize: fs(24), fontWeight: 'bold', color: '#1a1a1a' },
  confidenceBadge: { borderRadius: 20, borderWidth: 1, paddingVertical: vs(6), paddingHorizontal: s(12) },
  confidenceText:  { fontSize: fs(16), fontWeight: 'bold' },
  impactCard: {
    marginHorizontal: s(16), marginBottom: vs(12), backgroundColor: '#fff', borderRadius: 16,
    padding: s(16), borderLeftWidth: 5,
    elevation: 2, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  impactLabel:     { fontSize: fs(10), color: '#aaa', fontWeight: '700', letterSpacing: 0.8, marginBottom: vs(8) },
  impactRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: vs(10) },
  impactValue:     { fontSize: fs(22), fontWeight: 'bold' },
  impactBadge:     { borderRadius: 20, borderWidth: 1, paddingVertical: vs(4), paddingHorizontal: s(10) },
  impactBadgeText: { fontSize: fs(12), fontWeight: '700' },
  impactTips:      { fontSize: fs(12), color: '#555', lineHeight: vs(18) },

  nutriCard: {
    marginHorizontal: s(16), marginBottom: vs(12), backgroundColor: '#fff', borderRadius: 16, padding: s(16),
    elevation: 2, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  nutriTitle: { fontSize: fs(12), fontWeight: '700', color: '#555', marginBottom: vs(14) },
  nutriGrid:  { flexDirection: 'row', gap: s(10), marginBottom: vs(14) },
  giRow:      { flexDirection: 'row', alignItems: 'center', gap: s(10) },
  giLabel:    { fontSize: fs(12), color: '#888', width: s(110) },
  giBar:      { flex: 1, height: vs(8), backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden' },
  giFill:     { height: vs(8), borderRadius: 4 },
  giValue:    { fontSize: fs(12), fontWeight: '700', color: '#555', width: s(40), textAlign: 'right' },

  actions:       { paddingHorizontal: s(16) },
  scanAgainBtn:  { backgroundColor: '#388E3C', borderRadius: 12, paddingVertical: vs(16), alignItems: 'center' },
  scanAgainText: { color: '#fff', fontWeight: 'bold', fontSize: fs(15) },
});

const nutriStyles = StyleSheet.create({
  box: {
    flex: 1, backgroundColor: '#f9f9f9', borderRadius: 10,
    padding: s(12), alignItems: 'center', borderTopWidth: 3,
  },
  value: { fontSize: fs(16), fontWeight: 'bold', marginBottom: vs(4) },
  label: { fontSize: fs(10), color: '#aaa', fontWeight: '600' },
});
