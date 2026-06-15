import type { SleepEntry, WakeFeeling } from '@/store/sleepStore';
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
  priority: 1 | 2 | 3; // 1 = critique, 2 = avertissement, 3 = positif
}

export interface HealthScore {
  total:        number; // 0–100
  sleepScore:   number;
  glucoseScore: number;
  label:        string;
  color:        string;
}

export interface SleepDebt {
  debt7d:         number; // heures de dette sur 7 jours
  debt14d:        number; // heures de dette sur 14 jours
  personalGoal:   number; // objectif personnalisé en heures
  recoveryNights: number; // nuits nécessaires pour récupérer
  recoveryExtra:  number; // minutes supplémentaires par nuit
}

export type Chronotype = 'matin' | 'soir' | 'intermédiaire';

export interface ChronotypeResult {
  type:        Chronotype;
  label:       string;
  emoji:       string;
  description: string;
  tipBedTime:  string; // heure de coucher recommandée
}

export interface DailyTip {
  text:  string;
  icon:  string;
  color: string;
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
    // Normalise les heures après minuit (ex: 01:00 → 25h)
    return h < 6 ? (h + 24) * 60 + m : h * 60 + m;
  });
  const mean     = mins.reduce((a, b) => a + b, 0) / mins.length;
  const variance = mins.reduce((s, v) => s + (v - mean) ** 2, 0) / mins.length;
  return Math.sqrt(variance);
}

function bedTimeToMinutes(bedTime: string): number {
  const [h, m] = bedTime.split(':').map(Number);
  return h < 6 ? (h + 24) * 60 + m : h * 60 + m;
}

function computePersonalGoal(entries: SleepEntry[]): number {
  if (entries.length < 7) return 7.5;
  const durations = [...entries].map(e => e.duration).sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  const median = durations.length % 2 === 0
    ? (durations[mid - 1] + durations[mid]) / 2
    : durations[mid];
  // Objectif = médiane + 15 min, borné à 6–9h
  return Math.min(9, Math.max(6, Math.round((median + 0.25) * 4) / 4));
}

// ---------------------------------------------------------------------------
// Dette de sommeil
// ---------------------------------------------------------------------------

export function computeSleepDebt(entries: SleepEntry[]): SleepDebt {
  const goal = computePersonalGoal(entries);
  const now  = new Date();

  function debtForDays(days: number): number {
    let total = 0;
    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const entry   = entries.find(e => e.date === dateStr);
      if (entry) total += Math.max(0, goal - entry.duration);
    }
    return Math.round(total * 10) / 10;
  }

  const debt7d  = debtForDays(7);
  const debt14d = debtForDays(14);

  // Plan de récupération : +20 min/nuit si dette < 2h, +30 min sinon
  const recoveryExtra  = debt7d >= 2 ? 30 : 20;
  const recoveryNights = debt7d > 0 ? Math.ceil(debt7d / (recoveryExtra / 60)) : 0;

  return { debt7d, debt14d, personalGoal: goal, recoveryNights, recoveryExtra };
}

// ---------------------------------------------------------------------------
// Chronotype
// ---------------------------------------------------------------------------

export function detectChronotype(entries: SleepEntry[]): ChronotypeResult | null {
  if (entries.length < 5) return null;
  const recent = entries.slice(0, 14);
  const avgBed = recent.reduce((s, e) => s + bedTimeToMinutes(e.bedTime), 0) / recent.length;

  if (avgBed < 21 * 60 + 30) {
    return {
      type: 'matin', label: 'Du matin', emoji: '🌅', tipBedTime: '21:30',
      description: 'Vous êtes du matin (alouette) — exploitez les premières heures pour vos tâches importantes.',
    };
  }
  if (avgBed > 23 * 60 + 30) {
    return {
      type: 'soir', label: 'Du soir', emoji: '🦉', tipBedTime: '23:00',
      description: 'Vous êtes du soir (hibou) — veillez à ne pas descendre en dessous de 7h de sommeil.',
    };
  }
  return {
    type: 'intermédiaire', label: 'Intermédiaire', emoji: '⏰', tipBedTime: '22:30',
    description: 'Rythme intermédiaire — une régularité accrue améliorerait votre récupération.',
  };
}

// ---------------------------------------------------------------------------
// Conseil actionnable du jour (1 seul par jour)
// ---------------------------------------------------------------------------

export function getDailyTip(entries: SleepEntry[], debt: SleepDebt | null): DailyTip {
  const today = new Date();
  const dow   = today.getDay(); // 0 = dim, 1 = lun …
  const recent3 = entries.slice(0, 3);

  // Priorité 1 : dette importante
  if (debt && debt.debt7d >= 1.5) {
    return {
      icon: '🛌', color: '#B71C1C',
      text: `${debt.debt7d}h de dette cette semaine. Ce soir, couchez-vous ${debt.recoveryExtra} min plus tôt que d'habitude.`,
    };
  }

  // Priorité 2 : dernière nuit trop courte
  if (recent3.length > 0 && recent3[0].duration < 6) {
    return {
      icon: '⚡', color: '#F57C00',
      text: `Nuit courte hier (${recent3[0].duration}h). Une micro-sieste de 20 min avant 15h peut compenser sans perturber ce soir.`,
    };
  }

  // Priorité 3 : réveil difficile répété
  const badWakes = recent3.filter(e => e.wakeFeeling && e.wakeFeeling <= 2).length;
  if (badWakes >= 2) {
    return {
      icon: '💤', color: '#7B1FA2',
      text: 'Réveil difficile ces derniers jours. Essayez de vous coucher 30 min plus tôt cette semaine et d\'éviter les écrans après 21h.',
    };
  }

  // Priorité 4 : début de semaine (dimanche soir)
  if (dow === 0) {
    return {
      icon: '📅', color: '#1565C0',
      text: 'Semaine qui commence demain — couchez-vous 30 min plus tôt ce soir pour démarrer en pleine forme.',
    };
  }

  // Priorité 5 : irrégularité des horaires
  if (entries.length >= 5) {
    const std = bedtimeStdMinutes(entries.slice(0, 7));
    if (std > 45) {
      const chrono = detectChronotype(entries);
      const target = chrono?.tipBedTime ?? '22:30';
      return {
        icon: '🎯', color: '#7B1FA2',
        text: `Vos heures de coucher varient de plus de 45 min. Visez ${target} chaque soir cette semaine pour stabiliser votre horloge interne.`,
      };
    }
  }

  // Priorité 6 : bonne série → renforcement positif
  const goodStreak = recent3.filter(e => e.duration >= 7 && e.quality >= 4).length;
  if (goodStreak === 3) {
    return {
      icon: '🌟', color: '#388E3C',
      text: `3 bonnes nuits d'affilée ! Maintenez ce rythme — la régularité est la clé d'un sommeil réparateur durable.`,
    };
  }

  // Conseil générique selon le jour de la semaine
  const tips: DailyTip[] = [
    { icon: '📱', color: '#F57C00', text: 'Éteignez les écrans 30 min avant de dormir : la lumière bleue retarde la mélatonine de 1 à 3h.' },
    { icon: '🌡️', color: '#1565C0', text: 'La température idéale pour dormir est 17–19 °C — une chambre fraîche favorise le sommeil profond.' },
    { icon: '☕', color: '#795548', text: 'La caféine reste active 6–8h dans l\'organisme. Évitez-la après 14h pour ne pas perturber l\'endormissement.' },
    { icon: '🧘', color: '#388E3C', text: '5 min de respiration profonde avant de dormir (4 s inspire, 6 s expire) réduisent le cortisol et facilitent l\'endormissement.' },
    { icon: '💧', color: '#1565C0', text: 'Une bonne hydratation dans la journée (1,5 L) améliore la qualité du sommeil profond. Évitez de boire après 20h.' },
    { icon: '🏃', color: '#388E3C', text: 'L\'exercice physique améliore le sommeil profond de 10–15 %. Mais évitez l\'effort intense dans les 2h avant de dormir.' },
    { icon: '🌙', color: '#7B1FA2', text: 'Une routine pré-sommeil fixe (lecture, douche tiède, obscurité) conditionne le cerveau à s\'endormir plus vite.' },
  ];

  return tips[today.getDate() % tips.length];
}

// ---------------------------------------------------------------------------
// Moteur d'insights (max 2, prioritisés)
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

  const stdMin     = bedtimeStdMinutes(recentSleep);
  const goal       = computePersonalGoal(sleepEntries);

  // Énergie au réveil moyenne (si dispo)
  const wakeFeelings = recentSleep.filter(e => e.wakeFeeling).map(e => e.wakeFeeling as WakeFeeling);
  const avgWake = wakeFeelings.length > 0
    ? wakeFeelings.reduce((a, b) => a + b, 0) / wakeFeelings.length : null;

  // ── Insight 1 : combiné sommeil + glycémie (le plus critique) ────────────
  if (avgQuality !== null && avgQuality < 3 && avgGlucose !== null && avgGlucose > 160) {
    insights.push({
      id: 'sleep_glucose_combo', icon: '⚠️', priority: 1,
      title: 'Cycle défavorable détecté',
      message: `Mauvais sommeil (qualité ${avgQuality.toFixed(1)}/5) + glycémie élevée (${Math.round(avgGlucose)} mg/dL) : ce duo aggrave la résistance à l'insuline. Ciblez d'abord la régularité des horaires de coucher.`,
      color: '#B71C1C',
    });
  }

  // ── Insight 2 : sommeil court sous objectif personnel ────────────────────
  if (avgDuration !== null && avgDuration < goal - 0.5 && !insights.some(i => i.id === 'sleep_glucose_combo')) {
    insights.push({
      id: 'short_sleep', icon: '😴', priority: 1,
      title: 'Sous votre objectif personnel',
      message: `Moyenne ${avgDuration.toFixed(1)}h vs objectif ${goal}h. Un déficit chronique perturbe la régulation du glucose et augmente l'appétit.`,
      color: '#B71C1C',
    });
  }

  // ── Insight 3 : réveil difficile récurrent ────────────────────────────────
  if (avgWake !== null && avgWake < 2.5 && insights.length < 2) {
    insights.push({
      id: 'bad_wake', icon: '😵', priority: 1,
      title: 'Réveil difficile répété',
      message: `Énergie au réveil ${avgWake.toFixed(1)}/5 en moyenne. Ce signal indique un sommeil non réparateur, indépendamment de la durée.`,
      color: '#F57C00',
    });
  }

  // ── Insight 4 : irrégularité > 1h ────────────────────────────────────────
  if (stdMin > 60 && insights.length < 2) {
    insights.push({
      id: 'irregular_schedule', icon: '🕐', priority: 2,
      title: 'Horloge interne perturbée',
      message: `Variation des horaires de coucher > 1h. L'irrégularité désynchronise le rythme circadien et réduit la qualité du sommeil profond.`,
      color: '#F57C00',
    });
  }

  // ── Insight 5 : glycémie élevée seule ────────────────────────────────────
  if (avgGlucose !== null && avgGlucose > 180 && insights.length < 2) {
    insights.push({
      id: 'high_glucose', icon: '📈', priority: 2,
      title: 'Glycémie élevée',
      message: `Moyenne ${Math.round(avgGlucose)} mg/dL ces 7 jours. Une glycémie chroniquement élevée fragmente le sommeil et réduit le sommeil profond.`,
      color: '#F57C00',
    });
  }

  // ── Insight 6 : bonne récupération (positif) ─────────────────────────────
  if (
    insights.length === 0 &&
    avgDuration !== null && avgDuration >= goal &&
    avgQuality  !== null && avgQuality  >= 3.5
  ) {
    insights.push({
      id: 'good_recovery', icon: '✅', priority: 3,
      title: 'Récupération optimale',
      message: `${avgDuration.toFixed(1)}h de sommeil en moyenne, qualité ${avgQuality.toFixed(1)}/5. Votre organisme récupère bien — maintenez ce rythme.`,
      color: '#388E3C',
    });
  }

  return insights
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 2); // max 2 insights — qualité > quantité
}

// ---------------------------------------------------------------------------
// Score de santé global
// ---------------------------------------------------------------------------

export function computeHealthScore(
  sleepEntries: SleepEntry[],
  glucoseHistory: GlucoseEntry[],
): HealthScore | null {
  const recentSleep   = sleepEntries.slice(0, 7);
  const recentGlucose = last7DaysGlucose(glucoseHistory);

  const hasSleep   = recentSleep.length > 0;
  const hasGlucose = recentGlucose.length > 0;

  if (!hasSleep && !hasGlucose) return null;

  // ── Score sommeil ─────────────────────────────────────────────────────────
  let sleepScore = 0;
  if (hasSleep) {
    const goal    = computePersonalGoal(sleepEntries);
    const avgDur  = recentSleep.reduce((a, b) => a + b.duration, 0) / recentSleep.length;
    const avgQual = recentSleep.reduce((a, b) => a + b.quality,  0) / recentSleep.length;
    const regScore = Math.max(0, 100 - (bedtimeStdMinutes(recentSleep) / 120) * 100);

    // Durée vs objectif personnalisé
    const durRatio = Math.min(avgDur / goal, 1);
    const durScore = durRatio < 0.7 ? durRatio * 70 : 70 + (durRatio - 0.7) * 100;

    const qualScore = ((avgQual - 1) / 4) * 100;

    // Facteur réveil subjectif (si disponible)
    const wf = recentSleep.filter(e => e.wakeFeeling).map(e => e.wakeFeeling as number);
    const hasWF = wf.length > 0;
    const wakeScore = hasWF ? ((wf.reduce((a, b) => a + b, 0) / wf.length - 1) / 4) * 100 : null;

    if (wakeScore !== null) {
      sleepScore = Math.round(durScore * 0.30 + qualScore * 0.25 + regScore * 0.15 + wakeScore * 0.30);
    } else {
      sleepScore = Math.round(durScore * 0.40 + qualScore * 0.40 + regScore * 0.20);
    }
  }

  // ── Score glycémie ────────────────────────────────────────────────────────
  let glucoseScore = 0;
  if (hasGlucose) {
    const inRange   = recentGlucose.filter(e => e.value >= 70 && e.value <= 180).length;
    const tir       = (inRange / recentGlucose.length) * 100;
    const avg       = recentGlucose.reduce((a, b) => a + b.value, 0) / recentGlucose.length;
    const std       = Math.sqrt(recentGlucose.reduce((s, e) => s + (e.value - avg) ** 2, 0) / recentGlucose.length);
    const stabScore = Math.max(0, 100 - (std / 50) * 100);
    glucoseScore = Math.round(tir * 0.6 + stabScore * 0.4);
  }

  // ── Score total ───────────────────────────────────────────────────────────
  let total: number;
  if (hasSleep && hasGlucose) {
    total = Math.round(sleepScore * 0.40 + glucoseScore * 0.60);
  } else if (hasSleep) {
    total = sleepScore;
  } else {
    total = glucoseScore;
  }

  const label = total >= 80 ? 'Excellent' : total >= 60 ? 'Bon' : total >= 40 ? 'Moyen' : 'À améliorer';
  const color = total >= 80 ? '#388E3C'   : total >= 60 ? '#FBC02D' : total >= 40 ? '#F57C00' : '#B71C1C';

  return { total, sleepScore, glucoseScore, label, color };
}
