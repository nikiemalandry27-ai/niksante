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
 *   < 54         → hypo_critical
 *   54 – 69      → hypo
 *   70 – 140     → normal      (4–8 mmol/L — zone optimale SFD/OMS)
 *   141 – 180    → hyper_mild  (8–10 mmol/L — acceptable post-repas, à améliorer)
 *   181 – 300    → hyper
 *   > 300        → hyper_critical
 */
export function getGlucoseStatus(value: number): GlucoseStatus {
  if (value < GLUCOSE_THRESHOLDS.HYPO_CRITICAL)  return 'hypo_critical';
  if (value < GLUCOSE_THRESHOLDS.HYPO_ALERT)     return 'hypo';
  if (value <= GLUCOSE_THRESHOLDS.NORMAL_MAX)    return 'normal';
  if (value <= GLUCOSE_THRESHOLDS.HYPER_WARNING) return 'hyper_mild';
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
    hypo:           '#1565C0', // bleu
    normal:         '#388E3C', // vert
    hyper_mild:     '#F9A825', // jaune ambré (8–10 mmol/L)
    hyper:          '#E65100', // orange foncé
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
      mealContext === 'sport'       ? 'L\'effort physique semble avoir fortement sollicité vos réserves de glucose. Interrompez l\'activité le temps de vous stabiliser.' :
      mealContext === 'before_meal' ? 'Votre glycémie est trop basse avant le repas — commencez par la stabiliser avant de passer à table.' :
      mealContext === 'after_meal'  ? 'Votre glycémie est très basse après ce repas — cela peut arriver en cas de repas trop léger ou d\'un léger décalage de traitement.' :
      mealContext === 'fasting'     ? 'Cette valeur très basse à jeun mérite attention — parlez de votre dosage nocturne à votre médecin.' :
      mealContext === 'bedtime'     ? 'Votre glycémie est très basse au moment du coucher — il est important de la remonter avant de dormir.' :
      'Cela peut survenir en cas de repas sauté, d\'effort intense ou d\'un ajustement de traitement à revoir.';
    return {
      title: '⚠️ Hypoglycémie critique',
      message: `Votre glycémie est dangereusement basse. ${contextNote}`,
      suggestion: 'Prenez immédiatement 15 g de sucres rapides (jus de fruit, sucre en morceau, gel de glucose).',
      action: 'Appelez les secours si vous ressentez vertiges, tremblements ou confusion.',
    };
  }

  // ── Hypoglycémie légère ──────────────────────────────────────────────────
  if (status === 'hypo') {
    switch (mealContext) {
      case 'before_meal':
        return {
          title: '⚡ Glycémie basse avant repas',
          message: 'Votre glycémie est un peu basse avant de manger. Il est conseillé de la stabiliser d\'abord avant de commencer le repas.',
          suggestion: 'Prenez 15 g de glucides rapides (un verre de jus de fruit, 3 morceaux de sucre ou un gel de glucose), attendez 10–15 min, puis commencez votre repas normalement.',
        };
      case 'after_meal':
        return {
          title: '⚡ Glycémie basse après repas',
          message: 'Votre glycémie a baissé après le repas. Cela peut arriver en cas de repas léger, d\'activité physique récente ou d\'un léger décalage de traitement.',
          suggestion: 'Prenez une collation légèrement sucrée (fruit, biscuit, jus de fruit) et vérifiez à nouveau dans 15 minutes. Si cela se répète, mentionnez-le à votre médecin.',
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
          title: '⚡ Glycémie basse pendant l\'activité',
          message: 'L\'effort physique a sollicité vos réserves de glucose — une pause s\'impose pour vous stabiliser.',
          suggestion: 'Interrompez l\'activité et prenez 15 g de glucides rapides (jus de fruit, gel, sucre). Vérifiez à nouveau dans 10–15 min avant de reprendre éventuellement.',
        };
      default:
        return {
          title: '⚡ Glycémie basse',
          message: 'Votre glycémie est basse — un repas sauté ou un effort physique récent peuvent en être la cause.',
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
          message: 'Votre glycémie est bien équilibrée avant ce repas — c\'est une excellente base pour bien démarrer.',
          suggestion: 'Choisissez un repas adapté : glucides lents (riz complet, légumineuses, pain complet), légumes et protéines, en limitant les sucres rapides et les boissons sucrées.',
        };
      case 'after_meal':
        return {
          title: '✅ Bonne glycémie après repas',
          message: 'Votre glycémie est restée bien équilibrée après ce repas — votre organisme a bien assimilé cet apport.',
          suggestion: 'Ce repas vous convient bien, notez sa composition. Une courte marche de 10–15 min peut encore renforcer cet équilibre.',
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
          title: '✅ Glycémie stable — activité physique',
          message: 'Votre glycémie est stable — conditions favorables pour pratiquer une activité physique.',
          suggestion: 'Gardez une collation sucrée à portée en cas d\'effort prolongé (> 45 min).',
        };
      default:
        return {
          title: '✅ Glycémie bien équilibrée',
          message: 'Votre glycémie est bien équilibrée. Continuez sur cette lancée !',
          suggestion: 'Maintenez une alimentation équilibrée, restez hydraté et bougez régulièrement.',
        };
    }
  }

  // ── Zone acceptable post-repas (8–10 mmol/L / 140–180 mg/dL) ─────────────
  if (status === 'hyper_mild') {
    switch (mealContext) {
      case 'after_meal':
        return {
          title: '🟡 Glycémie légèrement élevée après repas',
          message: 'Votre glycémie est restée légèrement élevée après ce repas — signe que le repas était riche en glucides rapides ou en sucres ajoutés.',
          suggestion: 'Marchez 15–20 min : cela aide les muscles à consommer le glucose et accélère la régulation.',
        };
      case 'before_meal':
        return {
          title: '🟡 Glycémie élevée avant repas',
          message: 'Votre glycémie est légèrement élevée avant de manger — probablement un résidu du repas précédent ou l\'effet du stress.',
          suggestion: 'Choisissez un repas léger pauvre en glucides rapides. Évitez le pain blanc, les sodas et les sucreries.',
        };
      case 'fasting':
        return {
          title: '🟡 Glycémie à jeun élevée',
          message: 'À jeun, votre glycémie reste légèrement élevée — l\'organisme n\'a pas totalement régulé pendant la nuit.',
          suggestion: 'Si c\'est répété, consultez votre médecin — possible phénomène de l\'aube ou ajustement de traitement nécessaire.',
        };
      case 'bedtime':
        return {
          title: '🟡 Glycémie élevée au coucher',
          message: 'Aller dormir avec une glycémie élevée prolonge cette élévation pendant la nuit sans que vous puissiez la corriger.',
          suggestion: 'Buvez de l\'eau, évitez toute collation. Une courte marche de 10 min peut aider avant de dormir.',
        };
      case 'sport':
        return {
          title: '🟡 Glycémie élevée pendant l\'activité',
          message: 'Un effort anaérobie intense (sprint, musculation) peut temporairement élever la glycémie via les hormones de stress.',
          suggestion: 'Après l\'effort, la glycémie devrait baisser avec la phase de récupération. Surveillez l\'évolution.',
        };
      default:
        return {
          title: '🟡 Glycémie légèrement élevée',
          message: 'Votre glycémie est légèrement élevée — peut être lié à un repas récent riche en glucides ou à un état de stress.',
          suggestion: 'Buvez de l\'eau, marchez un peu et observez l\'évolution à la prochaine mesure.',
        };
    }
  }

  // ── Hyperglycémie modérée ────────────────────────────────────────────────
  if (status === 'hyper') {
    switch (mealContext) {
      case 'before_meal':
        return {
          title: '📈 Glycémie élevée avant repas',
          message: 'Votre glycémie est un peu haute avant de manger — probablement un résidu du repas précédent ou l\'effet du stress.',
          suggestion: 'Optez pour un repas léger : légumes, protéines et glucides lents (riz complet, légumineuses). Limitez les sucres rapides, sodas et sucreries.',
        };
      case 'after_meal':
        return {
          title: '📈 Glycémie élevée après repas',
          message: 'Votre glycémie a augmenté de façon notable après ce repas — cela peut être lié à une portion importante de glucides rapides ou sucres ajoutés.',
          suggestion: 'Une marche douce de 15–20 minutes aide les muscles à consommer le glucose. Pour le prochain repas, privilégiez les aliments à index glycémique bas.',
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
          title: '📈 Glycémie élevée pendant l\'activité',
          message: 'Certains efforts anaérobies intenses (sprint, musculation) peuvent temporairement élever la glycémie via la libération d\'hormones de stress.',
          suggestion: 'Hydratez-vous bien. La glycémie devrait progressivement revenir à un niveau normal après l\'effort. Si cela se répète souvent, évoquez-le avec votre médecin.',
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
    mealContext === 'before_meal' ? 'Avant de passer à table, évitez les aliments riches en glucides rapides ou sucres ajoutés — ils risqueraient d\'aggraver davantage cette élévation.' :
    mealContext === 'after_meal'  ? 'Ce niveau après repas peut s\'expliquer par un apport glucidique important ou un ajustement de traitement à discuter avec votre médecin.' :
    mealContext === 'fasting'     ? 'Cette valeur à jeun mérite une attention médicale — l\'organisme n\'a pas pu réguler suffisamment pendant la nuit.' :
    mealContext === 'sport'       ? 'Il est conseillé d\'interrompre l\'activité physique — faire un effort avec cette glycémie peut aggraver la situation.' :
    mealContext === 'bedtime'     ? 'Il est préférable de ne pas dormir avec cette glycémie — une régulation nocturne sera difficile sans intervention.' :
    'Cela peut survenir en cas de dose d\'insuline manquée, d\'alimentation inadaptée ou d\'un début d\'infection.';
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
