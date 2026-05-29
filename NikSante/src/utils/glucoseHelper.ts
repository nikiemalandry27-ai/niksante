/**
 * NikSanté — Utilitaires pour la glycémie
 *
 * Contient :
 *  - getGlucoseStatus  : détermine le statut clinique d'une mesure
 *  - getStatusColor    : retourne la couleur associée au statut
 *  - getAIMessage      : génère le message de conseil basé sur le statut
 *  - formatDate        : formate une date en français
 */

import { GLUCOSE_THRESHOLDS, GlucoseStatus } from './constants';

// ---------------------------------------------------------------------------
// getGlucoseStatus
// ---------------------------------------------------------------------------

/**
 * Retourne le statut clinique d'une valeur de glycémie (mg/dL).
 *
 *   < 54        → hypo_critical
 *   54 – 69     → hypo
 *   70 – 140    → normal
 *   141 – 300   → hyper
 *   > 300       → hyper_critical
 */
export function getGlucoseStatus(value: number): GlucoseStatus {
  if (value < GLUCOSE_THRESHOLDS.HYPO_CRITICAL) return 'hypo_critical';
  if (value < GLUCOSE_THRESHOLDS.HYPO_ALERT)    return 'hypo';
  if (value <= GLUCOSE_THRESHOLDS.NORMAL_MAX)   return 'normal';
  if (value <= GLUCOSE_THRESHOLDS.HYPER_CRITICAL) return 'hyper';
  return 'hyper_critical';
}

// ---------------------------------------------------------------------------
// getStatusColor
// ---------------------------------------------------------------------------

/** Retourne la couleur hex associée au statut (pour UI). */
export function getStatusColor(status: GlucoseStatus): string {
  const colors: Record<GlucoseStatus, string> = {
    hypo_critical:  '#B71C1C', // rouge foncé
    hypo:           '#F57C00', // orange
    normal:         '#388E3C', // vert
    hyper:          '#F57C00', // orange
    hyper_critical: '#B71C1C', // rouge foncé
  };
  return colors[status];
}

// ---------------------------------------------------------------------------
// AI Message
// ---------------------------------------------------------------------------

export interface AIMessage {
  title: string;
  message: string;
  suggestion?: string;
  action?: string;
}

/** Génère un message de conseil basé sur le statut de glycémie. */
export function getAIMessage(status: GlucoseStatus): AIMessage {
  switch (status) {
    case 'hypo_critical':
      return {
        title: '⚠️ Hypoglycémie critique',
        message:
          'Votre glycémie est dangereusement basse. ' +
          'Cause possible : apport alimentaire insuffisant ou activité physique intense.',
        suggestion: 'Prenez immédiatement 15 g de sucres rapides (jus de fruit, sucre en morceau, gel de glucose).',
        action: 'Appelez le 15 (SAMU) ou demandez de l\'aide si vous ressentez des vertiges, tremblements ou confusion.',
      };

    case 'hypo':
      return {
        title: '⚡ Glycémie basse',
        message:
          'Votre glycémie est légèrement en dessous de la normale. ' +
          'Cause possible : repas sauté ou effort physique récent.',
        suggestion: 'Prenez une collation sucrée légère (fruit, biscuit) et surveillez dans 15 minutes.',
      };

    case 'normal':
      return {
        title: '✅ Glycémie normale',
        message: 'Votre glycémie est dans la plage cible. Continuez sur cette lancée !',
        suggestion: 'Maintenez une alimentation équilibrée, restez hydraté et bougez régulièrement.',
      };

    case 'hyper':
      return {
        title: '📈 Glycémie élevée',
        message:
          'Votre glycémie est au-dessus de la normale. ' +
          'Cause possible : repas riche en glucides rapides ou stress.',
        suggestion: 'Buvez de l\'eau, évitez les sucres rapides et marchez 10–15 minutes si possible.',
      };

    case 'hyper_critical':
      return {
        title: '🚨 Hyperglycémie critique',
        message:
          'Votre glycémie est dangereusement élevée. ' +
          'Cause possible : dose d\'insuline manquée ou alimentation inadaptée.',
        suggestion: 'Hydratez-vous abondamment et évitez tout aliment sucré.',
        action: 'Consultez un médecin immédiatement ou rendez-vous aux urgences.',
      };
  }
}

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

/**
 * Formate une date en format court français.
 * Ex : "27/05 à 14:32"
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('fr-FR', {
    day:    '2-digit',
    month:  '2-digit',
    hour:   '2-digit',
    minute: '2-digit',
  });
}
