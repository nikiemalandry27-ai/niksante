/**
 * NikSanté — HeartRateScreen
 *
 * Mesure PPG réelle via react-native-vision-camera frame processors.
 * La caméra arrière + flash analysent la luminosité au doigt à ~30fps.
 *
 * ⚠️ ESTIMATION INDICATIVE — PAS UN DISPOSITIF MÉDICAL.
 */

import { useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Animated,
  Linking,
  Alert,
  Vibration,
  NativeModules,
} from 'react-native';

// Module natif de verrouillage caméra (absent en Expo Go — dégradé silencieux)
const CameraLockModule = (NativeModules as any).CameraLockModule as {
  lockForPPG:   () => Promise<boolean>;
  unlockCamera: () => Promise<boolean>;
} | null;

// runOnJS de react-native-reanimated ne fonctionne PAS dans le runtime
// react-native-worklets-core utilisé par VisionCamera v4.
// On utilise useRunOnJS (worklets-core v1.6.3) à la place.
let Camera: any              = null;
let useCameraDevice: any     = () => null;
let useCameraPermission: any = () => ({ hasPermission: false, requestPermission: async () => false });
let useFrameProcessor: any   = () => undefined;
let useRunOnJS: any          = (_fn: any, _deps: any[]) => null;
let VisionCameraProxy: any   = null;
let nativeAvailable          = false;
let frameProcessorsAvailable = false;
let _nativeLoadError         = '';

try {
  const vc = require('react-native-vision-camera');
  Camera              = vc.Camera;
  useCameraDevice     = vc.useCameraDevice;
  useCameraPermission = vc.useCameraPermission;
  VisionCameraProxy   = vc.VisionCameraProxy ?? null;
  nativeAvailable     = true;

  if (typeof vc.useFrameProcessor === 'function') {
    useFrameProcessor        = vc.useFrameProcessor;
    frameProcessorsAvailable = true;
  }

  // useRunOnJS : hook officiel worklets-core pour appeler du JS depuis un frame processor
  try {
    useRunOnJS = require('react-native-worklets-core').useRunOnJS;
  } catch (_) {}
} catch (e: any) {
  _nativeLoadError = String(e?.message ?? e ?? 'unknown error');
}
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { s, fs, vs } from '@/utils/responsive';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = 'disclaimer' | 'instruction' | 'waiting' | 'measuring' | 'processing' | 'result' | 'error';

interface Sample {
  r:         number;  // canal rouge  (détection doigt ET signal PPG — pénétration maximale sous flash)
  g:         number;  // canal vert   (ratio couleur uniquement — R est le signal PPG principal)
  b:         number;  // canal bleu   (ratio couleur uniquement)
  timestamp: number;
}

interface HRVData {
  rmssdMs:   number;
  sdnnMs:    number;
  recovery:  number;   // 0–100
  stress:    number;   // 0–100
  advice:    string;
}

// ---------------------------------------------------------------------------
// HRV helpers
// ---------------------------------------------------------------------------

function getHRVAdvice(recovery: number): string {
  if (recovery >= 80) return 'Excellente récupération — votre système nerveux est en parfait équilibre. Idéal pour un effort physique intense aujourd\'hui.';
  if (recovery >= 65) return 'Bonne récupération. Une activité modérée à soutenue est envisageable — votre organisme est bien reposé.';
  if (recovery >= 50) return 'Récupération modérée. Privilégiez une activité légère et veillez à bien dormir ce soir.';
  if (recovery >= 35) return 'Votre HRV suggère un niveau de stress élevé ou une fatigue accumulée. Privilégiez le repos et des activités apaisantes aujourd\'hui.';
  return 'Votre HRV indique un état de fatigue marqué. Reposez-vous et évitez tout effort intense — consultez votre médecin si cela persiste.';
}

function hrvRecoveryColor(score: number): string {
  if (score >= 70) return '#388E3C';
  if (score >= 50) return '#F57C00';
  return '#E53935';
}

function hrvStressColor(score: number): string {
  if (score >= 65) return '#E53935';
  if (score >= 40) return '#F57C00';
  return '#388E3C';
}

// ---------------------------------------------------------------------------
// PPG algorithm
// ---------------------------------------------------------------------------

function movingAvg(arr: number[], win: number): number[] {
  const half = Math.floor(win / 2);
  return arr.map((_, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(arr.length - 1, i + half);
    let s = 0;
    for (let j = lo; j <= hi; j++) s += arr[j];
    return s / (hi - lo + 1);
  });
}

// DFT ciblée 0.8–3 Hz (48–180 BPM) — second estimateur fréquentiel.
// Utilise les timestamps réels pour être robuste au jitter de FPS.
// Complexité : O(F × N) avec F ≈ 110 fréquences et N ≈ 450 échantillons ≈ 50 k ops.
function computeDFT(signal: number[], timestamps: number[]): { bpm: number; snr: number } {
  const fMin = 0.8, fMax = 3.0;
  const N    = signal.length;
  const mean = signal.reduce((a, b) => a + b, 0) / N;
  const x    = signal.map(v => v - mean);

  const dur  = (timestamps[N - 1] - timestamps[0]) / 1000;
  // Pas de fréquence : interpolation ×2 (résolution réelle limitée à 1/dur)
  const step = Math.max(0.02, 0.5 / dur);

  const freqs: number[] = [];
  const mags:  number[] = [];

  for (let f = fMin; f <= fMax + 1e-9; f += step) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const t   = (timestamps[n] - timestamps[0]) / 1000; // temps réel en secondes
      const phi = -2 * Math.PI * f * t;
      re += x[n] * Math.cos(phi);
      im += x[n] * Math.sin(phi);
    }
    freqs.push(f);
    mags.push(Math.sqrt(re * re + im * im));
  }

  // Pic dominant
  let peakMag = 0, peakIdx = 0;
  for (let i = 0; i < mags.length; i++) {
    if (mags[i] > peakMag) { peakMag = mags[i]; peakIdx = i; }
  }

  // SNR fréquentiel : pic / moyenne des voisins éloignés (exclut ±2 bins)
  const others   = mags.filter((_, i) => Math.abs(i - peakIdx) > 2);
  const avgOther = others.length > 0 ? others.reduce((a, b) => a + b, 0) / others.length : 1;
  const snr      = avgOther > 0 ? peakMag / avgOther : 1;

  return { bpm: Math.round(freqs[peakIdx] * 60), snr };
}

// Pic d'autocorrélation normalisée dans la plage 48–180 BPM.
// Mesure la périodicité du signal : 0 = aléatoire, 1 = parfaitement périodique.
// Utilisé dans fingerScore pour vérifier qu'un signal cardiaque est bien présent.
function autocorrelationPeak(signal: number[], fps: number): number {
  const N    = signal.length;
  const mean = signal.reduce((a, b) => a + b, 0) / N;
  const x    = signal.map(v => v - mean);
  const r0   = x.reduce((s, v) => s + v * v, 0);
  if (r0 < 1e-10) return 0;

  // Lag min → 180 BPM (0.333 s) ; lag max → 48 BPM (1.25 s)
  const lagMin = Math.max(1, Math.round(fps * 0.333));
  const lagMax = Math.min(N - 1, Math.round(fps * 1.25));

  let peak = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let sum = 0;
    for (let i = 0; i < N - lag; i++) sum += x[i] * x[i + lag];
    const r = sum / r0;
    if (r > peak) peak = r;
  }
  return Math.max(0, peak);
}

interface PPGResult {
  bpm:              number | null;
  confidence:       number;
  signalQuality:    number;
  fingerConfidence: number;
  isFingerDetected: boolean;
  isValid:          boolean;
  isUncertain:      boolean;   // confidence 70–84 % : résultat affiché avec avertissement
  fps:              number;
  message:          string;
  hrv?:             HRVData;
  debug?: {
    avgRed:      number;
    ratio:       number;
    rrIntervals: number[];
    variance:    number;
  };
}

function analyzePPG(samples: Sample[], baselineAvgR = 0): PPGResult {
  const fail = (msg: string, sq = 0): PPGResult => ({
    bpm: null, confidence: 0, signalQuality: sq,
    fingerConfidence: 0, isFingerDetected: false,
    isValid: false, isUncertain: false, fps: 0, message: msg,
  });

  if (samples.length < 120) return fail('Pas assez de données — gardez le doigt immobile sur la caméra');

  // ── 0. Dominance rouge post-hoc ──────────────────────────────────────────
  const avgR  = samples.reduce((s, p) => s + p.r, 0) / samples.length;
  const avgG  = samples.reduce((s, p) => s + p.g, 0) / samples.length;
  const avgB  = samples.reduce((s, p) => s + p.b, 0) / samples.length;
  const ratio = avgR / (avgG + avgB + 1);

  const fingerConfidence = Math.min(100, Math.max(0,
    Math.round((ratio - 0.6) / (2.0 - 0.6) * 100)
  ));

  if (ratio < 1.2) {
    return {
      ...fail(`Aucun doigt détecté — couvrez uniquement l'objectif (ratio ${ratio.toFixed(2)} < 1.2)`, 0),
      fingerConfidence, isFingerDetected: false,
      debug: { avgRed: avgR, ratio, rrIntervals: [], variance: 0 },
    };
  }
  // Plage luminosité relative à la baseline (mesurée sans doigt).
  // Bornes élargies pour tolérer le lock Camera2 (AE fixe peut décaler avgR
  // de ×2-4 vs mode auto) — le check ratio ci-dessus couvre déjà "pas de doigt".
  const lumLow  = baselineAvgR > 10 ? Math.max(25, baselineAvgR * 0.15) : 25;
  const lumHigh = baselineAvgR > 10 ? baselineAvgR * 5.0 : 252;
  if (avgR < lumLow || avgR > lumHigh) {
    return {
      ...fail(avgR < lumLow ? 'Signal trop sombre — appuyez légèrement sur l\'objectif' : 'Signal surexposé — réduisez la pression', 0),
      fingerConfidence, isFingerDetected: true,
      debug: { avgRed: avgR, ratio, rrIntervals: [], variance: 0 },
    };
  }

  // Signal PPG : canal rouge — pénétration profonde sous flash LED
  const vals = samples.map(s => s.r);
  const ts   = samples.map(s => s.timestamp);
  const dur  = (ts[ts.length - 1] - ts[0]) / 1000;
  const fps  = Math.round(samples.length / dur);

  if (fps < 10) return { ...fail('Fréquence caméra trop faible — réessayez'), fps };

  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std  = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
  const cv   = std / (mean || 1);  // std_normalized = std / mean

  // Seuils CV resserrés : 1 % min (signal trop plat) — 20 % max (trop bruité)
  if (cv < 0.01) return fail('Signal trop plat — appuyez légèrement, laissez le flash dégagé');
  if (cv > 0.20) return fail('Signal trop instable — restez parfaitement immobile');

  // ── 1. Z-score normalization + suppression outliers (|z| > 3) ────────────
  const normalized = vals.map(v => (v - mean) / std);
  const clean      = normalized.map(v => (Math.abs(v) > 3 ? 0 : v));

  // ── 2. Détrend 2.5 s (HP ≈ 0.4 Hz) ─────────────────────────────────────
  const trendWin  = Math.max(5, Math.round(fps * 2.5));
  const trend     = movingAvg(clean, trendWin);
  const detrended = clean.map((v, i) => v - trend[i]);

  // ── 3. Bandpass 0.8–3 Hz ─────────────────────────────────────────────────
  const smW      = Math.max(2, Math.round(fps * 0.04));
  const lpW      = Math.max(2, Math.round(fps * 0.44 / 3));
  const filtered = movingAvg(movingAvg(detrended, smW), lpW);

  // ── 4. SNR temporel ──────────────────────────────────────────────────────
  const sigMax = Math.max(...filtered);
  const sigMin = Math.min(...filtered);
  const amp    = sigMax - sigMin;
  if (amp < 1e-10) return fail('Amplitude PPG nulle — repositionnez le doigt');

  const noiseArr = filtered.map((v, i) => detrended[i] - v);
  const noiseRMS = Math.sqrt(noiseArr.reduce((s, v) => s + v * v, 0) / noiseArr.length);
  const snr      = noiseRMS > 0 ? amp / noiseRMS : 0;

  // ── 5. Détection de pics ─────────────────────────────────────────────────
  const peakThr = sigMin + amp * 0.40;
  const minDist = Math.max(3, Math.floor(fps * 0.333));
  const peaks: number[] = [];
  for (let i = 1; i < filtered.length - 1; i++) {
    if (
      filtered[i] > peakThr &&
      filtered[i] >= filtered[i - 1] &&
      filtered[i] >= filtered[i + 1] &&
      (peaks.length === 0 || i - peaks[peaks.length - 1] >= minDist)
    ) peaks.push(i);
  }

  // Validation physiologique : nombre de pics cohérent avec la durée réelle
  // 0.6 pic/s → 36 BPM minimum | 2.0 pics/s → 120 BPM maximum
  const expectedMin = dur * 0.6;
  const expectedMax = dur * 2.0;
  if (peaks.length < expectedMin || peaks.length > expectedMax) {
    return {
      bpm: null, confidence: 0, signalQuality: Math.round(Math.min(40, snr * 5)),
      fingerConfidence, isFingerDetected: ratio >= 1.2,
      isValid: false, isUncertain: false, fps,
      message: peaks.length < expectedMin
        ? `Trop peu de pics détectés (${peaks.length} sur ${Math.round(dur)}s) — repositionnez le doigt`
        : `Trop de pics détectés (${peaks.length}) — signal bruité, restez parfaitement immobile`,
    };
  }

  // Variance d'amplitude des pics — trop variable = mouvement ou mauvais contact
  const peakAmps    = peaks.map(i => filtered[i]);
  const peakAmpMean = peakAmps.reduce((a, b) => a + b, 0) / peakAmps.length;
  const peakAmpStd  = Math.sqrt(peakAmps.reduce((s, v) => s + (v - peakAmpMean) ** 2, 0) / peakAmps.length);
  const peakAmpCv   = Math.abs(peakAmpMean) > 0 ? peakAmpStd / Math.abs(peakAmpMean) : 1;
  if (peakAmpCv > 0.50) {
    return fail('Amplitude des pics trop variable — gardez le doigt parfaitement immobile');
  }

  // ── 6. Intervalles RR (48–180 BPM) ──────────────────────────────────────
  const rr: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    const dt = (ts[peaks[i]] - ts[peaks[i - 1]]) / 1000;
    if (dt >= 0.333 && dt <= 1.25) rr.push(dt);
  }

  if (rr.length < 3) return fail('Intervalles RR hors plage 48–180 BPM — réessayez immobile');

  // ── 7. Rejet IQR ─────────────────────────────────────────────────────────
  const sortedRR = [...rr].sort((a, b) => a - b);
  const q1       = sortedRR[Math.floor(sortedRR.length * 0.25)];
  const q3       = sortedRR[Math.floor(sortedRR.length * 0.75)];
  const iqrV     = q3 - q1;
  const cleanRR  = rr.filter(v => v >= q1 - 1.5 * iqrV && v <= q3 + 1.5 * iqrV);

  if (cleanRR.length < 3) return fail('Trop d\'artefacts RR — réessayez parfaitement immobile');

  // ── 8. BPM médiane RR ────────────────────────────────────────────────────
  const sortedC  = [...cleanRR].sort((a, b) => a - b);
  const medRR    = sortedC[Math.floor(sortedC.length / 2)];
  const bpmPeaks = Math.round(60 / medRR);

  if (bpmPeaks < 48 || bpmPeaks > 180) {
    return fail(`BPM hors plage 48–180 BPM (${bpmPeaks}) — réessayez`);
  }

  // ── 9. DFT 0.8–3 Hz ──────────────────────────────────────────────────────
  const dft    = computeDFT(filtered, ts);
  const bpmDFT = dft.bpm;
  const diff   = Math.abs(bpmPeaks - bpmDFT);

  const isHarmonic = Math.abs(bpmDFT - 2 * bpmPeaks) <= 8
                  || Math.abs(bpmPeaks - 2 * bpmDFT) <= 8;

  let bpm: number;
  let coherenceScore: number;
  let coherenceMsg: string;

  if (isHarmonic) {
    bpm = bpmPeaks; coherenceScore = 0.80;
    coherenceMsg = `Accord méthodes (harmonique DFT corrigée)`;
  } else if (diff <= 5) {
    bpm = Math.round(bpmPeaks * 0.45 + bpmDFT * 0.55); coherenceScore = 1.0;
    coherenceMsg = `Mesure fiable — accord Δ${diff} BPM`;
  } else if (diff <= 12) {
    bpm = bpmDFT; coherenceScore = 0.70;
    coherenceMsg = `Mesure acceptable — Δ${diff} BPM entre méthodes`;
  } else {
    bpm = bpmDFT; coherenceScore = 0.38;
    coherenceMsg = `Signal ambigu — Δ${diff} BPM, réessayez immobile`;
  }

  if (diff > 30 || bpm < 48 || bpm > 180) {
    return fail(`Mesure incohérente (pics ${bpmPeaks} / DFT ${bpmDFT} BPM) — réessayez immobile`);
  }

  // ── 10. Cohérence temporelle multi-fenêtres ──────────────────────────────
  // Minimum 3 intervalles par fenêtre — median d'une fenêtre de 2 est trop bruité
  // et peut déclencher le rejet "BPM instable" sur de la variabilité normale.
  const wSz = Math.max(3, Math.floor(cleanRR.length / 3));
  const wBPMs: number[] = [];
  for (let s = 0; s + wSz <= cleanRR.length; s += Math.max(1, Math.floor(wSz / 2))) {
    const w    = cleanRR.slice(s, s + wSz);
    const wMed = [...w].sort((a, b) => a - b)[Math.floor(w.length / 2)];
    wBPMs.push(Math.round(60 / wMed));
  }
  const bpmVar = wBPMs.length > 1
    ? wBPMs.reduce((s, b) => s + (b - bpm) ** 2, 0) / wBPMs.length
    : 0;

  // Rejet si variation BPM consécutive > 15 BPM → instabilité de mouvement
  if (wBPMs.length > 1) {
    for (let i = 1; i < wBPMs.length; i++) {
      if (Math.abs(wBPMs[i] - wBPMs[i - 1]) > 15) {
        return fail('BPM instable entre fenêtres (> 15 BPM) — restez parfaitement immobile');
      }
    }
  }
  // Rejet BPM élevé + forte variance → activité physique ou bruit
  if (bpm > 110 && bpmVar > 300) {
    return fail('BPM élevé instable — activité ou bruit — gardez le doigt immobile');
  }

  // ── 11. HRV préliminaire + variance RR ───────────────────────────────────
  const diffs   = cleanRR.slice(1).map((v, i) => Math.abs(v - cleanRR[i]));
  const rmssd   = Math.sqrt(diffs.reduce((s, d) => s + d * d, 0) / (diffs.length || 1));
  const regularity = Math.max(0, 1 - rmssd / medRR);

  const rrMeanSec  = cleanRR.reduce((a, b) => a + b, 0) / cleanRR.length;
  const rrVariance = cleanRR.reduce((s, v) => s + (v - rrMeanSec) ** 2, 0) / cleanRR.length;
  // Normalisation [0,1] : 0 = régulier, 1 = très variable (0.05 s² = seuil max)
  const rrVarNorm  = Math.min(1, rrVariance / 0.05);
  // Rejet si écart-type RR > 12 % de la moyenne — intervalles trop irréguliers
  const rrStd = Math.sqrt(rrVariance);
  // 15 % au lieu de 12 % : tolère mieux la VFC élevée (sportifs, repos profond)
  // Ex. 72 bpm → rrMean 833 ms → limite 125 ms — couvre ~95 % des adultes sains
  if (rrStd > 0.15 * rrMeanSec) {
    return fail(`Intervalles RR trop irréguliers (σ=${Math.round(rrStd * 1000)} ms) — réessayez immobile`);
  }

  // ── 12. Autocorrélation (sur signal filtré — plus précis que signal brut) ─
  const autocorrPeak = autocorrelationPeak(filtered, fps);

  // ── 13. periodicityScore : autocorrélation + régularité RR ───────────────
  const periodicityScore = Math.min(100,
    0.6 * autocorrPeak * 100 + 0.4 * (1 - rrVarNorm) * 100
  );

  // ── 14. Scores qualité globaux ────────────────────────────────────────────
  // Références SNR recalibrées pour PPG mobile réel (15 s, ~30 fps)
  // SNR temporel ref 5 (était 8) : SNR ≥ 5 = excellent, 2–4 = acceptable
  // SNR fréquentiel ref 4 (était 5) : DFT SNR ≥ 4 = excellent, 2–3 = acceptable
  const snrScore  = Math.min(1, snr / 5);
  const dftSNR    = Math.min(1, dft.snr / 4);
  const peakScore = Math.min(1, cleanRR.length / 10);
  const sampScore = Math.min(1, samples.length / (fps * 12));
  const consScore = Math.max(0, 1 - bpmVar / 400);

  const signalQuality = Math.round(Math.min(100,
    25 * snrScore + 20 * dftSNR + 20 * regularity + 20 * peakScore + 15 * sampScore
  ));

  // ── 15. fingerScore — calculé avant confidence (utilisé dans sa formule) ──
  // ratioScore : sigmoïde centrée à 1.3, k=10
  //   ratio 1.2 → ~27 | 1.3 → 50 | 1.35 → 62 | 1.5 → 88 | 1.8 → 98
  const ratioScore     = Math.round(100 / (1 + Math.exp(-10 * (ratio - 1.3))));
  const lumScore       = Math.round(Math.max(0, 100 - Math.abs(avgR - 140) / 80 * 100));
  const stabilityScore = Math.round(consScore * 100);

  const fingerScore = Math.round(
    0.35 * ratioScore + 0.25 * lumScore + 0.25 * periodicityScore + 0.15 * stabilityScore
  );

  // ── 16. Confiance : 4 composantes égales × calibration × accord ──────────
  // Facteur 1.15 : rawConf 74 → confidence 85 pour mesures de bonne qualité.
  // coherenceScore appliqué avec amortissement (0.7 + 0.3×score) :
  //   accord parfait (1.0) → ×1.0 | partiel (0.70) → ×0.91 | ambigu (0.38) → ×0.81
  const rawConf    = 0.25 * fingerScore + 0.25 * signalQuality + 0.25 * periodicityScore + 0.25 * stabilityScore;
  const confidence = Math.round(Math.min(96,
    rawConf * 1.15 * (0.7 + 0.3 * coherenceScore)
  ));

  // ── 17. finalScore ────────────────────────────────────────────────────────
  const finalScore = Math.round(
    0.3 * fingerScore + 0.3 * signalQuality + 0.4 * stabilityScore
  );

  // ── 17. Gates de rejet ────────────────────────────────────────────────────
  if (fingerScore < 75) {
    return {
      ...fail(`Signal doigt insuffisant (score ${fingerScore}/100) — repositionnez et recommencez`, signalQuality),
      fingerConfidence, isFingerDetected: true,
      debug: { avgRed: avgR, ratio, rrIntervals: cleanRR.map(v => Math.round(v * 1000)), variance: rrVariance },
    };
  }
  if (confidence < 70) {
    return {
      ...fail(`Confiance insuffisante (${confidence}%) — réessayez parfaitement immobile`, signalQuality),
      fingerConfidence, isFingerDetected: true,
      debug: { avgRed: avgR, ratio, rrIntervals: cleanRR.map(v => Math.round(v * 1000)), variance: rrVariance },
    };
  }

  // ── 18. HRV complet ───────────────────────────────────────────────────────
  const rmssdMs = Math.round(rmssd * 1000);
  const sdnnMs  = Math.round(
    Math.sqrt(cleanRR.reduce((s, v) => s + (v - rrMeanSec) ** 2, 0) / cleanRR.length) * 1000
  );
  const recovery = Math.min(98, Math.max(5, Math.round(Math.sqrt(rmssdMs / 100) * 100)));
  const hrv: HRVData = {
    rmssdMs, sdnnMs, recovery,
    stress: 100 - recovery,
    advice: getHRVAdvice(recovery),
  };

  // confidence 70–84 % : résultat affiché mais signalé comme incertain
  const isUncertain = confidence < 85;

  return {
    bpm, confidence, signalQuality,
    fingerConfidence,
    isFingerDetected: true,
    isValid: true,
    isUncertain,
    fps,
    message: coherenceMsg,
    hrv,
    debug: { avgRed: avgR, ratio, rrIntervals: cleanRR.map(v => Math.round(v * 1000)), variance: Math.round(rrVariance * 1e6) / 1e6 },
  };
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export default function HeartRateScreen() {
  const router = useRouter();
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();

  const [phase,            setPhase]            = useState<Phase>('disclaimer');
  const [countdown,        setCountdown]        = useState(15);
  const [bpm,              setBpm]              = useState<number | null>(null);
  const [confidence,       setConfidence]       = useState(0);
  const [fps,              setFps]              = useState(0);
  const [errorMsg,         setErrorMsg]         = useState('');
  const [sampleCount,      setSampleCount]      = useState(0);
  const [fingerDetected,   setFingerDetected]   = useState(false);
  const [fingerProgress,   setFingerProgress]   = useState(0);
  const [isCalibrating,    setIsCalibrating]    = useState(true);
  const [debugBrightness,  setDebugBrightness]  = useState(0);
  const [cameraReady,      setCameraReady]      = useState(false);
  const [signalQuality,    setSignalQuality]    = useState(0);
  const [hrv,              setHrv]              = useState<HRVData | null>(null);
  const [debugRatio,       setDebugRatio]       = useState(0);
  const [fingerConfidence, setFingerConfidence] = useState(0);
  const [isUncertain,      setIsUncertain]      = useState(false);

  // hasTorch : true si la caméra arrière supporte le torch (flash LED continu)
  // Sur quasi tous les téléphones Android modernes, hasTorch = true sur la caméra arrière
  const hasTorch = (device as any)?.hasTorch ?? true;

  const samplesRef        = useRef<Sample[]>([]);
  const measuringRef      = useRef(false);
  const countdownRef      = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const heartAnim         = useRef(new Animated.Value(1)).current;
  const phaseRef          = useRef<Phase>('disclaimer');
  const fingerFrames      = useRef(0);
  const measureStarted    = useRef(false);
  const startCountdownRef = useRef<() => void>(() => {});

  // Baseline RGB : mesurée flash ON + sans doigt (≈30 trames)
  // Permet de calculer le delta ratio lors de la détection doigt
  const baselineCount     = useRef(0);
  const baselineReady     = useRef(false);
  const baselineR         = useRef(0);
  const baselineG         = useRef(0);
  const baselineB         = useRef(0);
  const baselineRSum      = useRef(0);
  const baselineGSum      = useRef(0);
  const baselineBSum      = useRef(0);
  const noFingerFrames    = useRef(0);
  const prevBpmRef        = useRef<number | null>(null); // EMA inter-mesures

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

  // onFrame reçoit maintenant r, g, b séparément (plugin BT.601 YUV→RGB)
  const onFrame = useCallback((r: number, g: number, b: number) => {
    if (r < 0) return; // code d'erreur plugin

    // Ratio dominance rouge : critère physiologique clé d'un doigt humain
    // Un doigt sous flash : R >> G ≈ B  →  ratio > 1.3
    // Ombre / objet sombre : ratio ≈ 0.5 ou inférieur
    const ratio = r / (g + b + 1);
    setDebugBrightness(Math.round(r));
    setDebugRatio(parseFloat(ratio.toFixed(2)));

    if (phaseRef.current === 'waiting') {
      // ── Phase de calibration (~1 s, 30 trames) ───────────────────────────
      if (!baselineReady.current) {
        baselineRSum.current += r;
        baselineGSum.current += g;
        baselineBSum.current += b;
        baselineCount.current += 1;
        if (baselineCount.current >= 30) {
          baselineR.current = baselineRSum.current / baselineCount.current;
          baselineG.current = baselineGSum.current / baselineCount.current;
          baselineB.current = baselineBSum.current / baselineCount.current;
          baselineReady.current = true;
          setIsCalibrating(false);
        }
        return;
      }

      // ── Détection doigt humain — 3 couches de validation ─────────────────

      // Couche A — Dominance rouge (critère physiologique principal)
      // Un doigt humain : tissu + sang → rouge passe, vert/bleu absorbés
      const layerA = ratio > 1.1;

      // Couche B — Plage de luminosité valide (doigt + flash = 40-240 R)
      const layerB = r >= 40 && r <= 240;

      // Couche C — Delta vs baseline : le ratio doit augmenter significativement
      // quand le doigt vient couvrir (ombre seule ne change pas le ratio)
      const baselineRatio = baselineR.current / (baselineG.current + baselineB.current + 1);
      const layerC = (ratio - baselineRatio) > 0.25;

      const fingerOn = layerA && layerB && layerC;

      if (fingerOn) {
        noFingerFrames.current = 0;
        if (fingerFrames.current === 0) Vibration.vibrate(60);
        fingerFrames.current += 1;
        setFingerDetected(true);
        setFingerProgress(Math.min(100, Math.round((fingerFrames.current / 15) * 100)));
        if (fingerFrames.current >= 15 && !measureStarted.current) {
          measureStarted.current = true;
          startCountdownRef.current();
        }
      } else {
        noFingerFrames.current += 1;
        if (noFingerFrames.current >= 5) {
          fingerFrames.current = 0;
          setFingerDetected(false);
          setFingerProgress(0);
        }
      }
      return;
    }

    if (!measuringRef.current) return;
    samplesRef.current.push({ r, g, b, timestamp: Date.now() });
    if (samplesRef.current.length % 10 === 0) {
      setSampleCount(samplesRef.current.length);
    }
  }, []);

  // Plugin natif Kotlin : lit imageProxy.planes[0] (Y-plan YUV) directement
  // en mémoire CPU, bypasse toArrayBuffer() qui échoue sur les frames GPU.
  const brightnessPlugin = useMemo(() => {
    try {
      return VisionCameraProxy?.initFrameProcessorPlugin('getBrightness', {}) ?? null;
    } catch {
      return null;
    }
  }, []);

  // useRunOnJS crée un wrapper worklet-callable vers onFrame (JS thread).
  const onFrameJS = useRunOnJS(onFrame, [onFrame]);

  // ── Frame processor — runs at camera FPS (~30fps) ─────────────────────────

  const frameProcessor = useFrameProcessor((frame: any) => {
    'worklet';
    if (!onFrameJS) return;
    try {
      if (brightnessPlugin) {
        // Voie native : BrightnessPlugin.kt convertit YUV→RGB en CPU
        // et retourne { r, g, b } — pas de GPU copy, pas de bug AHardwareBuffer
        const res = brightnessPlugin.call(frame) as { r: number; g: number; b: number } | null;
        const r = (res && typeof res.r === 'number') ? res.r : -4;
        const g = (res && typeof res.g === 'number') ? res.g : -4;
        const b = (res && typeof res.b === 'number') ? res.b : -4;
        onFrameJS(r, g, b);
      } else {
        // Fallback sans plugin natif — luminance Y uniquement, ratio inconnu
        onFrameJS(-2, -2, -2);
      }
    } catch {
      onFrameJS(-2, -2, -2);
    }
  }, [onFrameJS, brightnessPlugin]);

  // ── Start countdown (called automatically when finger detected) ──────────

  const startCountdown = useCallback(() => {
    samplesRef.current   = [];
    measuringRef.current = true;
    setSampleCount(0);
    phaseRef.current = 'measuring';
    setPhase('measuring');
    setCountdown(15);
    startHeartbeat();
    // Double vibration : mesure démarrée
    Vibration.vibrate([0, 80, 80, 80]);
    // Verrouille AE/AWB/AF pour stabiliser l'amplitude du signal PPG
    CameraLockModule?.lockForPPG().catch(() => {});

    let remaining = 15;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);

      if (remaining <= 0) {
        clearInterval(countdownRef.current);
        measuringRef.current = false;
        heartAnim.stopAnimation();
        phaseRef.current = 'processing';
        setPhase('processing');
        Vibration.vibrate(300);

        setTimeout(() => {
          const result = analyzePPG(samplesRef.current, baselineR.current);
          if (result.bpm !== null) {
            // EMA temporelle : finalBPM = 0.7 × précédent + 0.3 × nouveau
            // Atténue les variations inter-mesures sans introduire trop de latence
            const rawBpm   = result.bpm;
            const finalBPM = prevBpmRef.current !== null
              ? Math.round(0.7 * prevBpmRef.current + 0.3 * rawBpm)
              : rawBpm;
            prevBpmRef.current = finalBPM;
            setBpm(finalBPM);
            setConfidence(result.confidence);
            setSignalQuality(result.signalQuality);
            setFingerConfidence(result.fingerConfidence);
            setFps(result.fps);
            setHrv(result.hrv ?? null);
            setIsUncertain(result.isUncertain);
            phaseRef.current = 'result';
            setPhase('result');
          } else {
            setErrorMsg(result.message);
            phaseRef.current = 'error';
            setPhase('error');
          }
          // Déverrouille la caméra dans tous les cas (résultat ou erreur)
          CameraLockModule?.unlockCamera().catch(() => {});
        }, 400);
      }
    }, 1000);
  }, [startHeartbeat, heartAnim]);

  // Sync ref so onFrame (no-dep callback) can call the latest startCountdown
  const _syncCountdownRef = useCallback(() => {
    startCountdownRef.current = startCountdown;
  }, [startCountdown]);
  _syncCountdownRef();

  // ── Enter waiting phase (flash ON, waiting for finger) ───────────────────

  const enterWaiting = useCallback(async () => {
    if (!hasPermission) {
      await requestPermission();
      return;
    }
    fingerFrames.current   = 0;
    measureStarted.current = false;
    baselineCount.current  = 0;
    baselineReady.current  = false;
    baselineR.current      = 0; baselineRSum.current = 0;
    baselineG.current      = 0; baselineGSum.current = 0;
    baselineB.current      = 0; baselineBSum.current = 0;
    setIsCalibrating(true);
    setFingerDetected(false);
    setFingerProgress(0);
    setCameraReady(false);
    phaseRef.current = 'waiting';
    setPhase('waiting');
  }, [hasPermission, requestPermission]);

  const handleRetry = useCallback(() => {
    clearInterval(countdownRef.current);
    measuringRef.current   = false;
    measureStarted.current = false;
    fingerFrames.current   = 0;
    noFingerFrames.current = 0;
    baselineCount.current  = 0;
    baselineReady.current  = false;
    baselineR.current      = 0; baselineRSum.current = 0;
    baselineG.current      = 0; baselineGSum.current = 0;
    baselineB.current      = 0; baselineBSum.current = 0;
    setIsCalibrating(true);
    setFingerProgress(0);
    heartAnim.stopAnimation();
    heartAnim.setValue(1);
    setBpm(null);
    setSignalQuality(0);
    setFingerConfidence(0);
    setHrv(null);
    setIsUncertain(false);
    prevBpmRef.current = null;
    setErrorMsg('');
    setFingerDetected(false);
    phaseRef.current = 'instruction';
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

  // Caméra native non disponible
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
            Module caméra indisponible
          </ThemedText>
          <ThemedText style={[styles.permSub, { textAlign: 'center' }]}>
            Le module natif de la caméra n'a pas pu être chargé. Veuillez relancer l'application.
          </ThemedText>
          {_nativeLoadError.length > 0 && (
            <ThemedText style={{ fontSize: fs(10), color: '#aaa', textAlign: 'center', marginTop: vs(8), paddingHorizontal: s(16) }}>
              {_nativeLoadError}
            </ThemedText>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Build natif mais frame processors indisponibles (worklets-core non initialisé)
  if (!frameProcessorsAvailable) {
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
          <ThemedText style={{ fontSize: fs(48), marginBottom: vs(16) }}>⚙️</ThemedText>
          <ThemedText style={[styles.permTitle, { textAlign: 'center' }]}>
            Initialisation en cours…
          </ThemedText>
          <ThemedText style={[styles.permSub, { textAlign: 'center' }]}>
            Le moteur de traitement vidéo (worklets) n'a pas pu démarrer. Essayez de relancer l'application.
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
            { step: '1', icon: '👆', text: 'Posez le bout de votre index sur l\'objectif de la caméra arrière', sub: 'Couvrez uniquement l\'objectif — le flash doit rester dégagé à côté' },
            { step: '2', icon: '💡', text: 'Le flash s\'allume et éclaire votre doigt depuis le côté', sub: 'La lumière traverse les capillaires — la caméra capte les pulsations sanguines' },
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

          <TouchableOpacity style={styles.primaryBtn} onPress={enterWaiting}>
            <ThemedText style={styles.primaryBtnText}>▶  Démarrer la mesure (15 s)</ThemedText>
          </TouchableOpacity>

          <View style={{ height: vs(8) }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Waiting + Measuring — UNE seule Camera pour les deux phases ─────────────
  // Fusionner les deux phases garantit que la Camera reste montée en permanence.
  // Si on utilise deux instances séparées, VisionCamera éteint le torch au
  // démontage de la Camera "waiting" et la Camera "measuring" doit réinitialiser
  // sa session avant de pouvoir le rallumer → flash coupe systématiquement.

  if (phase === 'waiting' || phase === 'measuring') {
    const isMeasuring = phase === 'measuring';
    const ringColor   = fingerDetected ? '#E53935' : 'rgba(255,255,255,0.5)';
    const circleSize  = s(280);

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#111' }]}>

        {/* ── Camera unique — reste montée pendant waiting ET measuring ────── */}
        {/* Position fixe dans l'arbre JSX → React ne la démonte jamais        */}
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          exposure={0}
          torch={cameraReady && hasTorch ? 'on' : 'off'}
          video={true}
          pixelFormat="yuv"
          frameProcessor={frameProcessor}
          onInitialized={() => setCameraReady(true)}
        />

        {/* ── Overlay sombre pendant la mesure (caméra reste allumée derrière) */}
        {isMeasuring && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.88)' }]} />
        )}

        {/* ── UI Attente ───────────────────────────────────────────────────── */}
        {!isMeasuring && (
          <View style={styles.measuringContent}>

            <ThemedText style={{ fontSize: fs(18), fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: vs(20) }}>
              Posez votre doigt sur la caméra
            </ThemedText>

            {/* Anneau indicateur — la caméra en fond reste visible autour */}
            <View style={{
              width: circleSize + 8,
              height: circleSize + 8,
              borderRadius: (circleSize + 8) / 2,
              borderWidth: 4,
              borderColor: ringColor,
            }} />

            {/* Flash status */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: vs(14), gap: s(6) }}>
              <View style={{ width: s(8), height: s(8), borderRadius: 4, backgroundColor: hasTorch ? '#FFD600' : '#888' }} />
              <ThemedText style={{ fontSize: fs(12), color: hasTorch ? 'rgba(255,255,255,0.7)' : '#888' }}>
                {hasTorch ? 'Flash activé' : 'Flash non disponible sur cet appareil'}
              </ThemedText>
            </View>

            {/* Calibration / doigt */}
            {isCalibrating ? (
              <ThemedText style={{ fontSize: fs(13), color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginTop: vs(8) }}>
                ⏳ Calibration… ne posez pas encore votre doigt
              </ThemedText>
            ) : (
              <ThemedText style={{
                fontSize: fs(14),
                color: fingerDetected ? '#E53935' : 'rgba(255,255,255,0.55)',
                textAlign: 'center', marginTop: vs(8),
              }}>
                {fingerDetected ? '✓ Doigt détecté — démarrage automatique…' : 'Posez votre doigt sur l\'objectif caméra — laissez le flash dégagé'}
              </ThemedText>
            )}

            {fingerDetected && (
              <>
                <ThemedText style={{ fontSize: fs(12), color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: vs(4) }}>
                  Restez immobile…
                </ThemedText>
                <View style={{ width: s(260), marginTop: vs(12) }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: vs(4) }}>
                    <ThemedText style={{ fontSize: fs(11), color: 'rgba(255,255,255,0.5)' }}>Démarrage automatique</ThemedText>
                    <ThemedText style={{ fontSize: fs(11), color: '#E53935', fontWeight: '700' }}>{fingerProgress}%</ThemedText>
                  </View>
                  <View style={{ width: '100%', height: vs(6), backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden' }}>
                    <View style={{ height: vs(6), width: `${fingerProgress}%` as any, backgroundColor: '#E53935', borderRadius: 3 }} />
                  </View>
                </View>
              </>
            )}

            <ThemedText style={{ fontSize: fs(10), color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginTop: vs(6) }}>
              {brightnessPlugin ? '✓plug' : '✗plug'} | lum:{debugBrightness}
            </ThemedText>

            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: vs(28), backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }]}
              onPress={handleRetry}
            >
              <ThemedText style={[styles.primaryBtnText, { color: 'rgba(255,255,255,0.6)' }]}>← Annuler</ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {/* ── UI Mesure ────────────────────────────────────────────────────── */}
        {isMeasuring && (
          <View style={styles.measuringContent}>
            <Animated.Text style={[styles.heartIcon, { transform: [{ scale: heartAnim }] }]}>❤️</Animated.Text>

            <ThemedText style={styles.countdownText}>{countdown}</ThemedText>
            <ThemedText style={styles.countdownLabel}>secondes restantes</ThemedText>

            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${((15 - countdown) / 15) * 100}%` as any }]} />
            </View>

            {/* Échantillons collectés */}
            <View style={{ width: '100%', marginTop: vs(4), marginBottom: vs(4) }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: vs(4) }}>
                <ThemedText style={{ fontSize: fs(11), color: 'rgba(255,255,255,0.45)' }}>Échantillons collectés</ThemedText>
                <ThemedText style={{ fontSize: fs(11), color: '#E53935', fontWeight: '700' }}>{sampleCount} / ~450</ThemedText>
              </View>
              <View style={{ width: '100%', height: vs(6), backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ height: vs(6), width: `${Math.min(100, Math.round((sampleCount / 450) * 100))}%` as any, backgroundColor: '#E53935', borderRadius: 3 }} />
              </View>
            </View>

            {/* Signal PPG + ratio couleur */}
            <View style={{ width: '100%', marginTop: vs(6) }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: vs(4) }}>
                <ThemedText style={{ fontSize: fs(11), color: 'rgba(255,255,255,0.45)' }}>Signal PPG</ThemedText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(4) }}>
                  <View style={{ width: s(7), height: s(7), borderRadius: s(4), backgroundColor: debugBrightness >= 0 ? '#E53935' : 'rgba(255,255,255,0.2)' }} />
                  <ThemedText style={{ fontSize: fs(11), color: 'rgba(255,255,255,0.45)' }}>
                    {debugBrightness >= 0 ? 'Actif' : '—'}
                  </ThemedText>
                </View>
              </View>
              <View style={{ width: '100%', height: vs(6), backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ height: vs(6), width: `${Math.min(100, Math.max(0, Math.round((debugBrightness / 220) * 100)))}%` as any, backgroundColor: 'rgba(229,57,53,0.7)', borderRadius: 3 }} />
              </View>
              {/* Ratio dominance rouge — visible uniquement en mesure */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: vs(4) }}>
                <ThemedText style={{ fontSize: fs(10), color: 'rgba(255,255,255,0.30)' }}>
                  Ratio rouge R/(G+B)
                </ThemedText>
                <ThemedText style={{ fontSize: fs(10), color: debugRatio > 1.35 ? '#81C784' : debugRatio > 1.2 ? '#FFB300' : 'rgba(255,80,80,0.7)' }}>
                  {debugRatio.toFixed(2)} {debugRatio > 1.35 ? '✓ doigt' : debugRatio > 1.2 ? '~ incertain' : '✗ non doigt'}
                </ThemedText>
              </View>
            </View>

            <ThemedText style={[styles.measuringHint, { marginTop: vs(12) }]}>Gardez le doigt immobile sur la caméra</ThemedText>
          </View>
        )}

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
              • Couvrez uniquement l'objectif — le flash doit rester dégagé à côté{'\n'}
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
            Confiance : {confidence}%  ·  Qualité signal : {signalQuality}%
          </ThemedText>
          <ThemedText style={styles.confidenceText}>
            {sampleCount} trames  ·  ~{fps} fps
          </ThemedText>
        </View>

        {/* Avertissement mesure incertaine (confidence 70–84 %) */}
        {isUncertain && (
          <View style={styles.uncertainBox}>
            <ThemedText style={styles.uncertainTitle}>⚠️ Mesure incertaine</ThemedText>
            <ThemedText style={styles.uncertainText}>
              La confiance de cette mesure est de {confidence}% — en dessous de 85%. Le résultat affiché est une estimation approximative.{'\n'}
              Restez parfaitement immobile et réessayez pour une mesure plus fiable.
            </ThemedText>
          </View>
        )}

        <View style={styles.warningBox}>
          <ThemedText style={styles.warningText}>
            ⚠️ Cette estimation est fournie à titre informatif uniquement. Elle ne constitue pas un dispositif médical.
          </ThemedText>
        </View>

        {/* ── Carte HRV ────────────────────────────────────────────────── */}
        {hrv && (
          <View style={styles.hrvCard}>
            <View style={styles.hrvHeader}>
              <ThemedText style={styles.hrvTitle}>Variabilité cardiaque — HRV</ThemedText>
              <ThemedText style={styles.hrvSubtitle}>Analyse du système nerveux autonome</ThemedText>
            </View>

            {/* Scores barres */}
            <View style={styles.hrvScoresRow}>
              {/* Récupération */}
              <View style={styles.hrvScoreBlock}>
                <ThemedText style={styles.hrvScoreLabel}>Récupération</ThemedText>
                <View style={styles.hrvBarTrack}>
                  <View style={[styles.hrvBarFill, { width: `${hrv.recovery}%` as any, backgroundColor: hrvRecoveryColor(hrv.recovery) }]} />
                </View>
                <ThemedText style={[styles.hrvScoreValue, { color: hrvRecoveryColor(hrv.recovery) }]}>
                  {hrv.recovery}%
                </ThemedText>
              </View>
              {/* Stress */}
              <View style={styles.hrvScoreBlock}>
                <ThemedText style={styles.hrvScoreLabel}>Stress estimé</ThemedText>
                <View style={styles.hrvBarTrack}>
                  <View style={[styles.hrvBarFill, { width: `${hrv.stress}%` as any, backgroundColor: hrvStressColor(hrv.stress) }]} />
                </View>
                <ThemedText style={[styles.hrvScoreValue, { color: hrvStressColor(hrv.stress) }]}>
                  {hrv.stress}%
                </ThemedText>
              </View>
            </View>

            {/* Métriques cliniques */}
            <View style={styles.hrvMetricsRow}>
              <View style={styles.hrvMetricBox}>
                <ThemedText style={styles.hrvMetricVal}>{hrv.rmssdMs} ms</ThemedText>
                <ThemedText style={styles.hrvMetricName}>RMSSD</ThemedText>
                <ThemedText style={styles.hrvMetricHint}>successions RR</ThemedText>
              </View>
              <View style={styles.hrvMetricDivider} />
              <View style={styles.hrvMetricBox}>
                <ThemedText style={styles.hrvMetricVal}>{hrv.sdnnMs} ms</ThemedText>
                <ThemedText style={styles.hrvMetricName}>SDNN</ThemedText>
                <ThemedText style={styles.hrvMetricHint}>écart-type RR</ThemedText>
              </View>
              <View style={styles.hrvMetricDivider} />
              <View style={styles.hrvMetricBox}>
                <ThemedText style={styles.hrvMetricVal}>{hrv.recovery >= 70 ? '🟢' : hrv.recovery >= 50 ? '🟡' : '🔴'}</ThemedText>
                <ThemedText style={styles.hrvMetricName}>Niveau</ThemedText>
                <ThemedText style={styles.hrvMetricHint}>{hrv.recovery >= 70 ? 'Bon' : hrv.recovery >= 50 ? 'Moyen' : 'Faible'}</ThemedText>
              </View>
            </View>

            {/* Conseil personnalisé */}
            <View style={styles.hrvAdviceBox}>
              <ThemedText style={styles.hrvAdviceText}>💡 {hrv.advice}</ThemedText>
            </View>

            <ThemedText style={styles.hrvDisclaimer}>
              * HRV mesurée sur 15 s (enregistrement ultra-court). Indicatif — non clinique.
            </ThemedText>
          </View>
        )}

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

  // Uncertain measurement warning
  uncertainBox: {
    width: '100%', backgroundColor: '#FFF3E0', borderRadius: 14,
    padding: s(16), borderLeftWidth: 4, borderLeftColor: '#F57C00',
  },
  uncertainTitle: { fontSize: fs(14), fontWeight: 'bold', color: '#E65100', marginBottom: vs(6) },
  uncertainText:  { fontSize: fs(13), color: '#BF360C', lineHeight: vs(20) },

  // HRV card
  hrvCard: {
    width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: s(20),
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10, shadowRadius: 6,
  },
  hrvHeader: { marginBottom: vs(14) },
  hrvTitle:  { fontSize: fs(15), fontWeight: '800', color: '#1a1a1a', marginBottom: vs(2) },
  hrvSubtitle: { fontSize: fs(12), color: '#888' },

  hrvScoresRow: { gap: vs(10), marginBottom: vs(16) },
  hrvScoreBlock: { width: '100%' },
  hrvScoreLabel: { fontSize: fs(12), color: '#555', fontWeight: '600', marginBottom: vs(4) },
  hrvBarTrack: {
    width: '100%', height: vs(10), backgroundColor: '#f0f0f0',
    borderRadius: 5, overflow: 'hidden', marginBottom: vs(3),
  },
  hrvBarFill: { height: vs(10), borderRadius: 5 },
  hrvScoreValue: { fontSize: fs(13), fontWeight: '700', textAlign: 'right' },

  hrvMetricsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    backgroundColor: '#fafafa', borderRadius: 12, padding: s(14), marginBottom: vs(14),
  },
  hrvMetricBox: { alignItems: 'center', flex: 1 },
  hrvMetricVal:  { fontSize: fs(16), fontWeight: '800', color: '#1a1a1a' },
  hrvMetricName: { fontSize: fs(11), fontWeight: '700', color: '#555', marginTop: vs(2) },
  hrvMetricHint: { fontSize: fs(10), color: '#aaa', marginTop: vs(1) },
  hrvMetricDivider: { width: 1, height: vs(40), backgroundColor: '#e0e0e0' },

  hrvAdviceBox: {
    backgroundColor: '#F3F8FF', borderRadius: 12, padding: s(14),
    borderLeftWidth: 3, borderLeftColor: '#1565C0', marginBottom: vs(10),
  },
  hrvAdviceText: { fontSize: fs(13), color: '#1a1a1a', lineHeight: vs(20) },
  hrvDisclaimer: { fontSize: fs(10), color: '#bbb', textAlign: 'center' },

  refRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: vs(6), gap: s(10) },
  refDot:   { width: s(10), height: s(10), borderRadius: 5 },
  refLabel: { flex: 1, fontSize: fs(13), color: '#555' },
  refRange: { fontSize: fs(13), fontWeight: '700' },

  // Error
  errorTitle: { fontSize: fs(20), fontWeight: 'bold', color: '#B71C1C', textAlign: 'center', marginBottom: vs(4) },
  errorMsg:   { fontSize: fs(14), color: '#555', textAlign: 'center', lineHeight: vs(22) },
});
