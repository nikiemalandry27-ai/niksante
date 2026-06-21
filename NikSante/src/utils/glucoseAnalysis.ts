/**
 * NikSanté — Analyse avancée de glycémie (Step 5)
 *
 * Fonctions :
 *  - getTimeInRange()      : % de lectures dans la plage normale
 *  - getConsistencyScore() : score de contrôle global (0–100)
 *  - getPatternInsight()   : message IA basé sur les 3–7 dernières mesures
 *  - getWeeklyStats()      : moyenne par jour sur 7 jours
 *  - formatExportText()    : texte formaté à partager avec un médecin
 *
 */

import Constants from 'expo-constants';
import { GlucoseEntry, MEAL_CONTEXT_META, MealContext } from '@/store/glucoseStore';
import { GLUCOSE_THRESHOLDS, GlucoseStatus } from './constants';
import { getGlucoseStatus, formatDate, GlucoseUnit, formatGlucose, unitLabel } from './glucoseHelper';

// ---------------------------------------------------------------------------
// Time In Range (TIR)
// ---------------------------------------------------------------------------

export interface TIRResult {
  /** % en dessous de la plage normale */
  below: number;
  /** % dans la plage normale */
  inRange: number;
  /** % au-dessus de la plage normale */
  above: number;
  /** Nombre total de lectures */
  total: number;
}

/**
 * Calcule le Time In Range (TIR) en pourcentages.
 * Plage cible : NORMAL_MIN – NORMAL_MAX mg/dL.
 */
export function getTimeInRange(entries: GlucoseEntry[]): TIRResult {
  if (entries.length === 0) {
    return { below: 0, inRange: 0, above: 0, total: 0 };
  }

  let below   = 0;
  let inRange = 0;
  let above   = 0;

  for (const e of entries) {
    if      (e.value < GLUCOSE_THRESHOLDS.NORMAL_MIN) below++;
    else if (e.value > GLUCOSE_THRESHOLDS.NORMAL_MAX) above++;
    else                                               inRange++;
  }

  const total = entries.length;
  return {
    below:   Math.round((below   / total) * 100),
    inRange: Math.round((inRange / total) * 100),
    above:   Math.round((above   / total) * 100),
    total,
  };
}

// ---------------------------------------------------------------------------
// Score de contrôle
// ---------------------------------------------------------------------------

export interface ConsistencyScore {
  /** Score de 0 à 100 */
  score: number;
  /** Libellé qualitatif */
  label: 'Excellent' | 'Bon' | 'Passable' | 'À améliorer';
  /** Couleur associée */
  color: string;
}

/**
 * Calcule un score de contrôle glycémique basé sur le TIR.
 *
 * Seuils (recommandations FID / ADA) :
 *   TIR > 70 % → Excellent
 *   TIR 50–70 % → Bon
 *   TIR 30–50 % → Passable
 *   TIR < 30 % → À améliorer
 */
export function getConsistencyScore(entries: GlucoseEntry[]): ConsistencyScore {
  if (entries.length === 0) {
    return { score: 0, label: 'À améliorer', color: '#aaa' };
  }

  const { inRange } = getTimeInRange(entries);

  if (inRange >= 70) return { score: inRange, label: 'Excellent',    color: '#388E3C' };
  if (inRange >= 50) return { score: inRange, label: 'Bon',          color: '#66BB6A' };
  if (inRange >= 30) return { score: inRange, label: 'Passable',     color: '#F57C00' };
  return               { score: inRange, label: 'À améliorer',  color: '#B71C1C' };
}

// ---------------------------------------------------------------------------
// Pattern Insight (IA déterministe)
// ---------------------------------------------------------------------------

export interface PatternInsight {
  title:       string;
  message:     string;
  suggestion?: string;
  color:       string;
  icon:        string;
}

/**
 * Analyse les N dernières mesures et détecte des patterns récurrents.
 *
 * Patterns détectés :
 *   - 3 mesures consécutives hautes   → tendance hyperglycémique
 *   - 3 mesures consécutives basses   → tendance hypoglycémique
 *   - Oscillations importantes        → variabilité élevée
 *   - 5 mesures stables dans la norme → excellente stabilité
 *   - Aucun pattern → null
 */
export function getPatternInsight(entries: GlucoseEntry[]): PatternInsight | null {
  if (entries.length < 3) return null;

  const last5  = entries.slice(0, Math.min(5, entries.length)).map((e) => e.value);
  const last3  = last5.slice(0, 3);

  const allHighLast3 = last3.every((v) => v > GLUCOSE_THRESHOLDS.NORMAL_MAX);
  const allLowLast3  = last3.every((v) => v < GLUCOSE_THRESHOLDS.HYPO_ALERT);
  const allNormal5   = last5.length === 5 && last5.every(
    (v) => v >= GLUCOSE_THRESHOLDS.NORMAL_MIN && v <= GLUCOSE_THRESHOLDS.NORMAL_MAX
  );

  // Variabilité : écart-type simplifié (max - min)
  const range = Math.max(...last5) - Math.min(...last5);
  const highVariability = last5.length >= 4 && range > 100;

  if (allHighLast3) {
    return {
      icon:       '📈',
      title:      'Tendance hyperglycémique',
      message:    'Vos 3 dernières mesures sont au-dessus de la normale.',
      suggestion: 'Révisez votre alimentation et consultez votre médecin si cela persiste.',
      color:      '#F57C00',
    };
  }

  if (allLowLast3) {
    return {
      icon:       '📉',
      title:      'Tendance hypoglycémique',
      message:    'Vos 3 dernières mesures sont en dessous de la normale.',
      suggestion: 'Assurez-vous de manger régulièrement et consultez votre diabétologue.',
      color:      '#1565C0',
    };
  }

  if (allNormal5) {
    return {
      icon:       '🏆',
      title:      'Excellente stabilité',
      message:    'Vos 5 dernières mesures sont toutes dans la plage normale. Continuez !',
      color:      '#388E3C',
    };
  }

  if (highVariability) {
    return {
      icon:       '〰️',
      title:      'Variabilité élevée',
      message:    `Vos lectures varient beaucoup (écart de ${range} mg/dL).`,
      suggestion: 'Une glycémie instable peut indiquer un besoin d\'ajustement du traitement.',
      color:      '#7B1FA2',
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Statistiques hebdomadaires
// ---------------------------------------------------------------------------

export interface DayStats {
  /** Libellé court du jour (Lu, Ma, …) */
  label: string;
  /** Moyenne du jour (null si aucune mesure) */
  avg: number | null;
  /** Nombre de mesures */
  count: number;
}

const DAY_LABELS = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];

/**
 * Retourne les statistiques par jour sur les 7 derniers jours.
 * Le tableau est ordonné du plus ancien au plus récent.
 */
export function getWeeklyStats(entries: GlucoseEntry[]): DayStats[] {
  const today = new Date();
  const result: DayStats[] = [];

  for (let i = 6; i >= 0; i--) {
    const target = new Date(today);
    target.setDate(today.getDate() - i);
    target.setHours(0, 0, 0, 0);

    const dayEntries = entries.filter((e) => {
      const d = new Date(e.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === target.getTime();
    });

    const avg = dayEntries.length > 0
      ? Math.round(dayEntries.reduce((a, b) => a + b.value, 0) / dayEntries.length)
      : null;

    result.push({
      label: DAY_LABELS[target.getDay()],
      avg,
      count: dayEntries.length,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Estimateur HbA1c (formule ADAG — référence clinique standard)
// ---------------------------------------------------------------------------

export interface HbA1cResult {
  value: number;
  label: string;
  color: string;
  advice: string;
  basedOnCount: number;
}

export function estimateHbA1c(entries: GlucoseEntry[]): HbA1cResult | null {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const recent = entries.filter(e => new Date(e.date) >= cutoff);
  if (recent.length < 14) return null;
  const avg = recent.reduce((sum, e) => sum + e.value, 0) / recent.length;
  const value = Math.round(((avg + 46.7) / 28.7) * 10) / 10;
  const interp = interpretHbA1c(value);
  return { value, basedOnCount: recent.length, ...interp };
}

function interpretHbA1c(value: number): { label: string; color: string; advice: string } {
  if (value < 5.7) return { label: 'Normal',          color: '#388E3C', advice: 'Excellent contrôle glycémique.' };
  if (value < 6.5) return { label: 'Prédiabète',      color: '#F57C00', advice: 'Surveillez alimentation et activité physique.' };
  if (value < 7.0) return { label: 'Bien contrôlé',   color: '#66BB6A', advice: 'Objectif atteint pour la plupart des diabétiques.' };
  if (value < 8.0) return { label: 'Acceptable',      color: '#FBC02D', advice: 'Peut être amélioré avec votre médecin.' };
  return               { label: 'À améliorer',     color: '#B71C1C', advice: 'Consultez votre diabétologue pour ajuster le traitement.' };
}

// ---------------------------------------------------------------------------
// Moyennes journalières (pour graphiques de tendance 7j / 30j / 90j)
// ---------------------------------------------------------------------------

export interface DailyAverage {
  date: string;
  avg: number;
  count: number;
}

export function getDailyAverages(entries: GlucoseEntry[], days: number): DailyAverage[] {
  const today = new Date();
  const result: DailyAverage[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const target = new Date(today);
    target.setDate(today.getDate() - i);
    const dateStr = target.toISOString().split('T')[0];
    const dayEntries = entries.filter(
      e => new Date(e.date).toISOString().split('T')[0] === dateStr,
    );
    if (dayEntries.length > 0) {
      result.push({
        date:  dateStr,
        avg:   Math.round(dayEntries.reduce((sum, e) => sum + e.value, 0) / dayEntries.length),
        count: dayEntries.length,
      });
    }
  }
  return result;
}

export function getTrendFromAverages(averages: DailyAverage[]): 'up' | 'down' | 'stable' {
  if (averages.length < 3) return 'stable';
  const n    = averages.length;
  const ys   = averages.map(a => a.avg);
  const sumX = (n * (n - 1)) / 2;
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = ys.reduce((sum, y, i) => sum + i * y, 0);
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  if (slope > 1.5) return 'up';
  if (slope < -1.5) return 'down';
  return 'stable';
}

// ---------------------------------------------------------------------------
// Export texte (Share API)
// ---------------------------------------------------------------------------

/**
 * Génère un rapport textuel formaté, prêt à être partagé avec un médecin.
 */
export function formatExportText(entries: GlucoseEntry[], unit: GlucoseUnit = 'mg_dl'): string {
  if (entries.length === 0) {
    return 'NikSanté — Aucune mesure enregistrée.';
  }

  const tir   = getTimeInRange(entries);
  const score = getConsistencyScore(entries);
  const now   = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const statusCount: Partial<Record<GlucoseStatus, number>> = {};
  for (const e of entries) {
    const s = getGlucoseStatus(e.value);
    statusCount[s] = (statusCount[s] ?? 0) + 1;
  }

  const values  = entries.map((e) => e.value);
  const avg     = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const minVal  = Math.min(...values);
  const maxVal  = Math.max(...values);
  const ul      = unitLabel(unit);

  // En-tête
  let text = `📊 NikSanté — Rapport glycémique\n`;
  text    += `Exporté le ${now}\n`;
  text    += `${'─'.repeat(36)}\n\n`;

  // Résumé
  text += `RÉSUMÉ (${entries.length} mesures)\n`;
  text += `• Moyenne     : ${formatGlucose(avg, unit)} ${ul}\n`;
  text += `• Minimum     : ${formatGlucose(minVal, unit)} ${ul}\n`;
  text += `• Maximum     : ${formatGlucose(maxVal, unit)} ${ul}\n`;
  text += `• Score       : ${score.label} (TIR ${tir.inRange}%)\n`;
  text += `• Dans la norme : ${tir.inRange}%\n`;
  text += `• Trop bas      : ${tir.below}%\n`;
  text += `• Trop haut     : ${tir.above}%\n\n`;

  // Mesures
  text += `MESURES RÉCENTES\n`;
  text += `${'─'.repeat(36)}\n`;

  for (const e of entries.slice(0, 20)) {
    const status = getGlucoseStatus(e.value);
    const emoji  = status === 'normal'
      ? '🟢'
      : status.includes('hypo')
      ? '🔵'
      : '🔴';

    const ctx = e.mealContext
      ? ` [${MEAL_CONTEXT_META[e.mealContext as NonNullable<MealContext>].label}]`
      : '';
    const note = e.note ? ` — ${e.note}` : '';

    text += `${emoji} ${formatDate(e.date)} — ${formatGlucose(e.value, unit)} ${ul}${ctx}${note}\n`;
  }

  if (entries.length > 20) {
    text += `... et ${entries.length - 20} mesure(s) supplémentaire(s)\n`;
  }

  text += `\n${'─'.repeat(36)}\n`;
  text += `Généré par NikSanté v${Constants.expoConfig?.version ?? '1.0.0'}`;

  return text;
}
