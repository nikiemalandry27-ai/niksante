/**
 * NikSanté — Constantes globales
 *
 * GLUCOSE_THRESHOLDS : seuils de glycémie en mg/dL
 * Basés sur les recommandations de la Société Francophone du Diabète.
 */

export const GLUCOSE_THRESHOLDS = {
  /** Hypoglycémie critique niveau 2 : < 54 mg/dL / < 3 mmol/L (ADA/FID) */
  HYPO_CRITICAL: 54,
  /** Hypoglycémie niveau 1 : < 70 mg/dL / < 4 mmol/L (ADA/FID) */
  HYPO_ALERT: 70,
  /** Zone basse (vigilance) : 70–80 mg/dL */
  HYPO_WARNING: 80,
  /** Borne inférieure zone optimale : 70 mg/dL / 4 mmol/L */
  NORMAL_MIN: 70,
  /** Borne supérieure zone optimale : 140 mg/dL / 8 mmol/L (SFD/OMS — objectif global) */
  NORMAL_MAX: 140,
  /**
   * Seuil post-repas acceptable : 180 mg/dL / 10 mmol/L
   * = limite haute tolérée 2h après repas, mais à améliorer.
   * Aussi utilisé comme borne supérieure du TIR ADA (70–180 mg/dL) pour les rapports.
   */
  HYPER_WARNING: 180,
  /** Hyperglycémie franche : > 250 mg/dL / > 14 mmol/L */
  HYPER_ALERT: 250,
  /** Hyperglycémie critique : > 300 mg/dL / > 16.7 mmol/L */
  HYPER_CRITICAL: 300,
} as const;

/** Statuts possibles d'une mesure de glycémie */
export type GlucoseStatus =
  | 'hypo_critical'
  | 'hypo'
  | 'normal'
  | 'hyper_mild'     // 140–180 mg/dL (8–10 mmol/L) : acceptable post-repas, à améliorer
  | 'hyper'
  | 'hyper_critical';
