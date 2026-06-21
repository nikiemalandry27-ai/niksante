/**
 * NikSanté — Constantes globales
 *
 * GLUCOSE_THRESHOLDS : seuils de glycémie en mg/dL
 * Basés sur les recommandations de la Société Francophone du Diabète.
 */

export const GLUCOSE_THRESHOLDS = {
  /** Hypoglycémie critique niveau 2 : < 54 mg/dL (ADA/FID) */
  HYPO_CRITICAL: 54,
  /** Hypoglycémie niveau 1 : < 70 mg/dL (ADA/FID) */
  HYPO_ALERT: 70,
  /** Zone basse (vigilance) : 70–80 mg/dL */
  HYPO_WARNING: 80,
  /** Borne inférieure TIR — 70 mg/dL (ADA 2019 / FID 2023) */
  NORMAL_MIN: 70,
  /** Borne supérieure TIR — 180 mg/dL (ADA 2019 / FID 2023) */
  NORMAL_MAX: 180,
  /** Hyperglycémie niveau 1 : > 180 mg/dL */
  HYPER_WARNING: 180,
  /** Hyperglycémie niveau 2 : > 250 mg/dL (ADA) */
  HYPER_ALERT: 250,
  /** Hyperglycémie critique : > 300 mg/dL */
  HYPER_CRITICAL: 300,
} as const;

/** Statuts possibles d'une mesure de glycémie */
export type GlucoseStatus =
  | 'hypo_critical'
  | 'hypo'
  | 'normal'
  | 'hyper'
  | 'hyper_critical';
