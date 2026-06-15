import type { SleepEntry } from '@/store/sleepStore';
import type { GlucoseEntry } from '@/store/glucoseStore';

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export interface Insight {
  id:       string;
  icon:     string;
  title:    string;
  message:  string;
  color:    string;
  priority: 1 | 2 | 3; // 1 = critique, 2 = avertissement, 3 = positif / info
}

export interface HealthScore {
  total:        number; // 0–100
  sleepScore:   number;
  glucoseScore: number;
  label:        string;
  color:        string;
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function last7DaysGlucose(history: GlucoseEntry[]): GlucoseEntry[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  return history.filter(e => new Date(e.date) >= cutoff);
}

function bedtimeStdMinutes(entries: SleepEntry[]): number {
  if (entries.length < 2) return 0;
  const mins = entries.map(e => {
    const [h, m] = e.bedTime.split(':').map(Number);
    return h * 60 + m;
  });
  const mean     = mins.reduce((a, b) => a + b, 0) / mins.length;
  const variance = mins.reduce((s, v) => s + (v - mean) ** 2, 0) / mins.length;
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// Moteur d'insights
// ---------------------------------------------------------------------------

export function generateInsights(
  sleepEntries: SleepEntry[],
  glucoseHistory: GlucoseEntry[],
): Insight[] {
  const insights: Insight[] = [];

  const recentSleep   = sleepEntries.slice(0, 7);
  const recentGlucose = last7DaysGlucose(glucoseHistory);

  const avgDuration = recentSleep.length > 0
    ? recentSleep.reduce((a, b) => a + b.duration, 0) / recentSleep.length : null;
  const avgQuality = recentSleep.length > 0
    ? recentSleep.reduce((a, b) => a + b.quality, 0) / recentSleep.length : null;
  const avgGlucose = recentGlucose.length > 0
    ? recentGlucose.reduce((a, b) => a + b.value, 0) / recentGlucose.length : null;

  const stdMin = bedtimeStdMinutes(recentSleep);

  // ── 1. Sommeil insuffisant ───────────────────────────────────────────────
  if (avgDuration !== null && avgDuration < 6) {
    insights.push({
      id: 'short_sleep', icon: '😴', priority: 1,
      title: 'Sommeil insuffisant',
      message: `Durée moyenne : ${avgDuration.toFixed(1)}h (recommandé 7–9h). Un sommeil court peut perturber la régulation de la glycémie.`,
      color: '#B71C1C',
    });
  }

  // ── 2. Qualité de sommeil faible ─────────────────────────────────────────
  if (avgQuality !== null && avgQuality < 2.5) {
    insights.push({
      id: 'poor_quality', icon: '🌙', priority: 1,
      title: 'Qualité de sommeil faible',
      message: 'Un mauvais sommeil répété augmente la résistance à l\'insuline et déséquilibre la glycémie.',
      color: '#F57C00',
    });
  }

  // ── 3. Glycémie élevée ───────────────────────────────────────────────────
  if (avgGlucose !== null && avgGlucose > 180) {
    insights.push({
      id: 'high_glucose', icon: '📈', priority: 1,
      title: 'Glycémie élevée',
      message: `Moyenne : ${Math.round(avgGlucose)} mg/dL ces 7 derniers jours. Consultez votre médecin si cela persiste.`,
      color: '#F57C00',
    });
  }

  // ── 4. Mauvais sommeil + glycémie élevée (combiné) ───────────────────────
  if (avgQuality !== null && avgQuality < 3 && avgGlucose !== null && avgGlucose > 160) {
    insights.push({
      id: 'sleep_glucose_combo', icon: '⚠️', priority: 1,
      title: 'Sommeil et glycémie préoccupants',
      message: 'Un mauvais sommeil combiné à une glycémie élevée crée un cycle difficile. Régularisez vos horaires de coucher.',
      color: '#B71C1C',
    });
  }

  // ── 5. Horaires irréguliers ───────────────────────────────────────────────
  if (stdMin > 60) {
    insights.push({
      id: 'irregular_schedule', icon: '🕐', priority: 2,
      title: 'Horaires irréguliers',
      message: 'Vos heures de coucher varient de plus d\'1h. Des horaires stables améliorent le sommeil et la glycémie.',
      color: '#F57C00',
    });
  }

  // ── 6. Bonne récupération (positif) ──────────────────────────────────────
  if (
    avgDuration !== null && avgDuration >= 7 &&
    avgQuality  !== null && avgQuality  >= 3.5 &&
    avgGlucose  !== null && avgGlucose  <= 160
  ) {
    insights.push({
      id: 'good_recovery', icon: '✅', priority: 3,
      title: 'Bonne récupération',
      message: 'Sommeil de qualité et glycémie stable. Continuez sur cette lancée !',
      color: '#388E3C',
    });
  }

  // ── 7. Aucune donnée de sommeil ───────────────────────────────────────────
  if (recentSleep.length === 0) {
    insights.push({
      id: 'no_sleep_data', icon: '📝', priority: 3,
      title: 'Aucune donnée de sommeil',
      message: 'Enregistrez votre sommeil chaque matin pour obtenir des insights personnalisés.',
      color: '#888',
    });
  }

  return insights.sort((a, b) => a.priority - b.priority);
}

// ---------------------------------------------------------------------------
// Score de santé global
// ---------------------------------------------------------------------------

export function computeHealthScore(
  sleepEntries: SleepEntry[],
  glucoseHistory: GlucoseEntry[],
): HealthScore {
  const recentSleep   = sleepEntries.slice(0, 7);
  const recentGlucose = last7DaysGlucose(glucoseHistory);

  // ── Score sommeil (40 %) ──────────────────────────────────────────────────
  let sleepScore = 50;

  if (recentSleep.length > 0) {
    const avgDur  = recentSleep.reduce((a, b) => a + b.duration, 0) / recentSleep.length;
    const avgQual = recentSleep.reduce((a, b) => a + b.quality,  0) / recentSleep.length;

    const durScore =
      avgDur < 5   ? 20 :
      avgDur < 6   ? 50 :
      avgDur < 7   ? 70 :
      avgDur <= 9  ? 100 : 80;

    const qualScore  = ((avgQual - 1) / 4) * 100;
    const regScore   = Math.max(0, 100 - (bedtimeStdMinutes(recentSleep) / 120) * 100);

    sleepScore = Math.round(durScore * 0.4 + qualScore * 0.4 + regScore * 0.2);
  }

  // ── Score glycémie (60 %) ────────────────────────────────────────────────
  let glucoseScore = 50;

  if (recentGlucose.length > 0) {
    const inRange = recentGlucose.filter(e => e.value >= 70 && e.value <= 180).length;
    const tir     = (inRange / recentGlucose.length) * 100;

    const avg = recentGlucose.reduce((a, b) => a + b.value, 0) / recentGlucose.length;
    const std = Math.sqrt(
      recentGlucose.reduce((s, e) => s + (e.value - avg) ** 2, 0) / recentGlucose.length
    );
    const stabScore = Math.max(0, 100 - (std / 50) * 100);

    glucoseScore = Math.round(tir * 0.6 + stabScore * 0.4);
  }

  // ── Score total ───────────────────────────────────────────────────────────
  const total = Math.round(sleepScore * 0.40 + glucoseScore * 0.60);

  const label = total >= 80 ? 'Excellent' : total >= 60 ? 'Bon' : total >= 40 ? 'Moyen' : 'À améliorer';
  const color = total >= 80 ? '#388E3C'   : total >= 60 ? '#FBC02D' : total >= 40 ? '#F57C00' : '#B71C1C';

  return { total, sleepScore, glucoseScore, label, color };
}
