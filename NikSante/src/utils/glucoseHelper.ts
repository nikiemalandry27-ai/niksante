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
import type { MealContext } from '@/store/glucoseStore';

// ---------------------------------------------------------------------------
// Unit conversion
// ---------------------------------------------------------------------------

export type GlucoseUnit = 'mg_dl' | 'mmol_l';

/** Convert a stored mg/dL value to the display unit. */
export function toDisplay(value: number, unit: GlucoseUnit): number {
  if (unit === 'mmol_l') return Math.round((value / 18) * 10) / 10;
  return value;
}

/** Convert a display-unit value back to mg/dL for storage. */
export function fromDisplay(displayValue: number, unit: GlucoseUnit): number {
  if (unit === 'mmol_l') return Math.round(displayValue * 18);
  return Math.round(displayValue);
}

/** Format a stored mg/dL value as a display string in the chosen unit. */
export function formatGlucose(value: number, unit: GlucoseUnit): string {
  if (unit === 'mmol_l') return (Math.round((value / 18) * 10) / 10).toFixed(1);
  return String(value);
}

/** Return the unit label string. */
export function unitLabel(unit: GlucoseUnit): string {
  return unit === 'mmol_l' ? 'mmol/L' : 'mg/dL';
}

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

/** Génère un conseil contextualisé selon le statut ET le contexte repas/activité. */
export function getAIMessage(status: GlucoseStatus, mealContext: MealContext = null): AIMessage {

  // ── Hypoglycémie critique — urgence maximale dans tous les cas ───────────
  if (status === 'hypo_critical') {
    const contextNote =
      mealContext === 'sport'       ? 'L\'effort physique intense a probablement déclenché cette hypoglycémie.' :
      mealContext === 'before_meal' ? 'Votre glycémie était déjà critique avant le repas — ne mangez pas encore sans traiter d\'abord.' :
      mealContext === 'after_meal'  ? 'La glycémie est tombée dangereusement bas après le repas — possible surdosage en insuline.' :
      mealContext === 'fasting'     ? 'Hypoglycémie critique à jeun — vérifiez votre dose du soir avec votre médecin.' :
      mealContext === 'bedtime'     ? 'Danger : ne dormez pas avec une glycémie aussi basse. Traitez d\'abord.' :
      'Cause possible : dose d\'insuline trop forte, repas sauté ou effort physique intense.';
    return {
      title: '⚠️ Hypoglycémie critique',
      message: `Votre glycémie est dangereusement basse. ${contextNote}`,
      suggestion: 'Prenez immédiatement 15 g de sucres rapides (jus de fruit, sucre en morceau, gel de glucose).',
      action: 'Appelez le 15 (SAMU) si vous ressentez vertiges, tremblements ou confusion.',
    };
  }

  // ── Hypoglycémie légère ──────────────────────────────────────────────────
  if (status === 'hypo') {
    switch (mealContext) {
      case 'before_meal':
        return {
          title: '⚡ Glycémie basse avant repas',
          message: 'Votre glycémie est basse avant de manger. Commencez par un glucide rapide avant le repas.',
          suggestion: 'Prenez un jus de fruit ou un sucre, puis mangez un repas équilibré avec des glucides lents.',
        };
      case 'after_meal':
        return {
          title: '⚡ Glycémie basse après repas',
          message: 'Inhabituel : la glycémie baisse après le repas — peut indiquer un surdosage en insuline ou un repas trop léger.',
          suggestion: 'Prenez une collation sucrée et contrôlez à nouveau dans 15 minutes. Signalez à votre médecin.',
        };
      case 'fasting':
        return {
          title: '⚡ Glycémie basse à jeun',
          message: 'Hypoglycémie à jeun — possible hypoglycémie nocturne non ressentie ou dose du soir trop forte.',
          suggestion: 'Prenez une collation sucrée maintenant. Discutez de votre dose nocturne avec votre médecin.',
        };
      case 'bedtime':
        return {
          title: '⚡ Glycémie basse au coucher',
          message: 'Risque d\'hypoglycémie nocturne. Ne dormez pas sans avoir remonté votre glycémie.',
          suggestion: 'Prenez une collation mixte (glucides lents + protéines) : pain + fromage, ou 1 verre de lait.',
        };
      case 'sport':
        return {
          title: '⚡ Glycémie basse — activité physique',
          message: 'L\'effort physique a consommé vos réserves de glucose. Risque d\'hypoglycémie prolongée.',
          suggestion: 'Arrêtez l\'exercice. Prenez un sucre rapide immédiatement et surveillez dans 15 minutes.',
        };
      default:
        return {
          title: '⚡ Glycémie basse',
          message: 'Votre glycémie est légèrement en dessous de la normale. Cause possible : repas sauté ou effort récent.',
          suggestion: 'Prenez une collation sucrée légère (fruit, biscuit) et contrôlez dans 15 minutes.',
        };
    }
  }

  // ── Glycémie normale ─────────────────────────────────────────────────────
  if (status === 'normal') {
    switch (mealContext) {
      case 'before_meal':
        return {
          title: '✅ Bonne glycémie avant repas',
          message: 'Votre glycémie est dans la cible avant le repas. Bon point de départ.',
          suggestion: 'Privilégiez un repas équilibré (glucides lents, légumes, protéines) pour garder cette stabilité.',
        };
      case 'after_meal':
        return {
          title: '✅ Bonne glycémie après repas',
          message: 'La digestion se passe bien, votre glycémie est restée stable après le repas.',
          suggestion: 'Excellent résultat ! Notez la composition de ce repas — elle vous convient bien.',
        };
      case 'fasting':
        return {
          title: '✅ Glycémie à jeun normale',
          message: 'Votre contrôle glycémique nocturne est bon. L\'organisme a bien régulé pendant la nuit.',
          suggestion: 'Continuez avec un petit-déjeuner équilibré (pas de sucres rapides à jeun).',
        };
      case 'bedtime':
        return {
          title: '✅ Glycémie normale au coucher',
          message: 'Bonne glycémie pour aller dormir. Le risque d\'hypoglycémie nocturne est faible.',
          suggestion: mealContext === 'bedtime' && true
            ? 'Si votre glycémie est proche de 80 mg/dL, une petite collation protéinée peut prévenir une baisse nocturne.'
            : 'Bonne nuit !',
        };
      case 'sport':
        return {
          title: '✅ Glycémie normale — activité physique',
          message: 'Votre glycémie est bien dans la cible pour pratiquer une activité physique.',
          suggestion: 'Gardez une collation sucrée à portée en cas d\'effort prolongé (> 45 min).',
        };
      default:
        return {
          title: '✅ Glycémie normale',
          message: 'Votre glycémie est dans la plage cible. Continuez sur cette lancée !',
          suggestion: 'Maintenez une alimentation équilibrée, restez hydraté et bougez régulièrement.',
        };
    }
  }

  // ── Hyperglycémie modérée ────────────────────────────────────────────────
  if (status === 'hyper') {
    switch (mealContext) {
      case 'before_meal':
        return {
          title: '📈 Glycémie élevée avant repas',
          message: 'Votre glycémie est déjà haute avant de manger — probablement un résidu du repas précédent ou du stress.',
          suggestion: 'Choisissez un repas léger pauvre en glucides rapides. Évitez le pain blanc, les sodas, les desserts.',
        };
      case 'after_meal':
        return {
          title: '📈 Glycémie élevée après repas',
          message: 'Le repas a fait monter votre glycémie au-dessus de la cible. Trop de glucides rapides ou de sucres ajoutés.',
          suggestion: 'Marchez 15–20 minutes : cela aide les muscles à consommer le glucose. Évitez de vous asseoir juste après.',
        };
      case 'fasting':
        return {
          title: '📈 Glycémie à jeun élevée',
          message: 'Phénomène possible de l\'aube : l\'organisme libère du glucose en fin de nuit pour préparer le réveil.',
          suggestion: 'Évitez un petit-déjeuner riche en glucides rapides. Discutez avec votre médecin si cela se répète.',
        };
      case 'bedtime':
        return {
          title: '📈 Glycémie élevée au coucher',
          message: 'Aller dormir avec une glycémie haute prolonge l\'hyperglycémie pendant la nuit.',
          suggestion: 'Buvez de l\'eau, évitez toute collation sucrée. Une courte marche de 10 min peut aider avant de dormir.',
        };
      case 'sport':
        return {
          title: '📈 Glycémie élevée — activité physique',
          message: 'Inhabituel après le sport — l\'exercice anaérobie intense (sprint, musculation) peut parfois élever la glycémie.',
          suggestion: 'Hydratez-vous bien. Si cela se répète après le sport, discutez-en avec votre médecin.',
        };
      default:
        return {
          title: '📈 Glycémie élevée',
          message: 'Votre glycémie est au-dessus de la normale. Cause possible : repas riche en glucides rapides ou stress.',
          suggestion: 'Buvez de l\'eau, évitez les sucres rapides et marchez 10–15 minutes si possible.',
        };
    }
  }

  // ── Hyperglycémie critique ───────────────────────────────────────────────
  const contextNote =
    mealContext === 'after_meal'  ? 'Ce niveau après repas indique un apport glucidique excessif ou un défaut d\'insuline.' :
    mealContext === 'fasting'     ? 'Ce niveau à jeun est très préoccupant — l\'organisme n\'a pas du tout régulé pendant la nuit.' :
    mealContext === 'sport'       ? 'Ne pratiquez aucun exercice physique avec une glycémie aussi haute — risque de cétose.' :
    mealContext === 'bedtime'     ? 'Ne dormez pas avec cette glycémie. Le risque de complications nocturnes est élevé.' :
    'Cause possible : dose d\'insuline manquée, alimentation inadaptée ou infection.';
  return {
    title: '🚨 Hyperglycémie critique',
    message: `Votre glycémie est dangereusement élevée. ${contextNote}`,
    suggestion: 'Hydratez-vous abondamment (eau uniquement) et évitez tout aliment sucré.',
    action: 'Consultez un médecin immédiatement ou rendez-vous aux urgences.',
  };
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
