/**
 * NikSanté — Constantes globales
 *
 * GLUCOSE_THRESHOLDS : seuils de glycémie en mg/dL
 * Basés sur les recommandations de la Société Francophone du Diabète.
 */

export const GLUCOSE_THRESHOLDS = {
  /** Hypoglycémie critique : < 54 mg/dL */
  HYPO_CRITICAL: 54,
  /** Hypoglycémie : < 70 mg/dL */
  HYPO_ALERT: 70,
  /** Zone basse (vigilance) : 70-80 mg/dL */
  HYPO_WARNING: 80,
  /** Plage normale minimale */
  NORMAL_MIN: 80,
  /** Plage normale maximale (à jeun / interprandiale) */
  NORMAL_MAX: 140,
  /** Zone élevée (vigilance) */
  HYPER_WARNING: 180,
  /** Hyperglycémie franche */
  HYPER_ALERT: 200,
  /** Hyperglycémie critique */
  HYPER_CRITICAL: 300,
} as const;

/** Statuts possibles d'une mesure de glycémie */
export type GlucoseStatus =
  | 'hypo_critical'
  | 'hypo'
  | 'normal'
  | 'hyper'
  | 'hyper_critical';
