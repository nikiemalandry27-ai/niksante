/**
 * NikSanté — DiabetesGuideScreen
 * Guide médical complet sur le diabète : 10 chapitres éducatifs.
 */

import { useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { s, fs, vs } from '@/utils/responsive';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'list';      title?: string; items: string[] }
  | { type: 'tip';       text: string }
  | { type: 'warning';   text: string }
  | { type: 'table';     rows: { label: string; value: string; color?: string }[] };

interface Chapter {
  id:       string;
  emoji:    string;
  color:    string;
  bg:       string;
  title:    string;
  subtitle: string;
  blocks:   Block[];
}

// ---------------------------------------------------------------------------
// Contenu médical complet
// ---------------------------------------------------------------------------

const CHAPTERS: Chapter[] = [
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'what',
    emoji: '🔬',
    color: '#1565C0',
    bg: '#E3F2FD',
    title: "Qu'est-ce que le diabète ?",
    subtitle: 'Types, causes et mécanismes',
    blocks: [
      {
        type: 'paragraph',
        text: "Le diabète est une maladie chronique caractérisée par un excès de glucose (sucre) dans le sang, appelé hyperglycémie. Il survient lorsque le pancréas ne produit pas suffisamment d'insuline, ou lorsque l'organisme n'utilise pas correctement l'insuline qu'il produit.",
      },
      {
        type: 'paragraph',
        text: "L'insuline est une hormone produite par les cellules bêta du pancréas. Son rôle est d'agir comme une « clé » qui permet au glucose de pénétrer dans les cellules pour être utilisé comme source d'énergie.",
      },
      {
        type: 'list',
        title: '🔵 Diabète de type 1 (5–10 % des cas)',
        items: [
          "Maladie auto-immune : le système immunitaire détruit les cellules productrices d'insuline",
          'Apparaît souvent chez les enfants et jeunes adultes (< 40 ans)',
          "Nécessite un traitement à l'insuline à vie",
          'Pas lié au mode de vie ou au surpoids',
          'Début souvent brutal (polyurie, amaigrissement rapide)',
        ],
      },
      {
        type: 'list',
        title: '🟠 Diabète de type 2 (90 % des cas)',
        items: [
          "Résistance à l'insuline : les cellules répondent moins bien à l'hormone",
          "Déficit progressif de la sécrétion d'insuline",
          'Se développe lentement, souvent asymptomatique au début',
          'Fortement lié au surpoids, la sédentarité et l\'alimentation',
          'Peut être contrôlé (parfois en rémission) par le mode de vie',
          'Touche principalement les adultes de plus de 40 ans, mais de plus en plus de jeunes',
        ],
      },
      {
        type: 'list',
        title: '🟣 Autres formes de diabète',
        items: [
          'Diabète gestationnel : survient pendant la grossesse, disparaît souvent après l\'accouchement',
          'MODY (Maturity Onset Diabetes of the Young) : forme génétique rare',
          'Diabète secondaire : causé par une autre maladie (pancréatite, cancer du pancréas…)',
        ],
      },
      {
        type: 'tip',
        text: '💡 En France, environ 4,5 millions de personnes sont diabétiques, dont 1 million s\'ignorent. Le dépistage précoce est essentiel.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'symptoms',
    emoji: '🩺',
    color: '#E53935',
    bg: '#FFEBEE',
    title: 'Reconnaître les symptômes',
    subtitle: 'Signes cliniques et alertes',
    blocks: [
      {
        type: 'paragraph',
        text: "Le diabète de type 2 peut rester silencieux pendant des années. Les symptômes classiques apparaissent lorsque la glycémie dépasse un certain seuil. Il est important de les connaître pour consulter rapidement.",
      },
      {
        type: 'list',
        title: '⚠️ Les 3 symptômes classiques ("3P")',
        items: [
          '🚽 Polyurie : urines très fréquentes et abondantes (y compris la nuit)',
          '🥤 Polydipsie : soif intense et persistante',
          '🍽️ Polyphagie : faim excessive malgré une alimentation normale',
        ],
      },
      {
        type: 'list',
        title: '🔍 Autres symptômes fréquents',
        items: [
          '😴 Fatigue intense, manque d\'énergie, somnolence après les repas',
          '👁️ Vision floue ou qui change rapidement',
          '🩹 Plaies et coupures qui cicatrisent lentement',
          '🦶 Fourmillements, engourdissements ou douleurs dans les mains et les pieds',
          '🦠 Infections répétées (mycoses génitales, infections urinaires, furoncles)',
          '⚖️ Amaigrissement inexpliqué (surtout dans le type 1)',
          '🤢 Nausées, vomissements (en cas de cétose)',
        ],
      },
      {
        type: 'warning',
        text: "⚠️ Le diabète de type 2 peut évoluer sans symptôme pendant 5 à 10 ans. Une glycémie à jeun est recommandée tous les 3 ans après 45 ans, ou plus tôt si des facteurs de risque sont présents.",
      },
      {
        type: 'list',
        title: '🎯 Facteurs de risque à surveiller',
        items: [
          'Surpoids ou obésité (IMC > 25)',
          'Tour de taille > 94 cm (homme) ou > 80 cm (femme)',
          'Antécédents familiaux de diabète',
          'Hypertension artérielle ou cholestérol élevé',
          'Sédentarité',
          'Antécédent de diabète gestationnel',
          'Syndrome des ovaires polykystiques (SOPK)',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'glucose',
    emoji: '📊',
    color: '#388E3C',
    bg: '#E8F5E9',
    title: 'La glycémie expliquée',
    subtitle: 'Valeurs normales, cibles et interprétation',
    blocks: [
      {
        type: 'paragraph',
        text: "La glycémie est la concentration de glucose dans le sang, exprimée en mg/dL (milligrammes par décilitre) ou en g/L (grammes par litre). Elle varie naturellement au cours de la journée selon les repas, l'activité physique et le stress.",
      },
      {
        type: 'table',
        rows: [
          { label: 'À jeun — Non diabétique',      value: '70–100 mg/dL',   color: '#388E3C' },
          { label: 'À jeun — Prédiabète',          value: '100–125 mg/dL',  color: '#F57C00' },
          { label: 'À jeun — Diabète',             value: '≥ 126 mg/dL',    color: '#E53935' },
          { label: '2h après repas — Normal',      value: '< 140 mg/dL',    color: '#388E3C' },
          { label: '2h après repas — Prédiabète',  value: '140–199 mg/dL',  color: '#F57C00' },
          { label: '2h après repas — Diabète',     value: '≥ 200 mg/dL',    color: '#E53935' },
          { label: 'Objectif à jeun (T2)',         value: '80–130 mg/dL',   color: '#1565C0' },
          { label: 'Objectif post-repas (T2)',     value: '< 180 mg/dL',    color: '#1565C0' },
        ],
      },
      {
        type: 'list',
        title: "🎯 L'HbA1c — Hémoglobine glyquée",
        items: [
          'Mesure la glycémie moyenne des 3 derniers mois',
          'Exprimée en pourcentage',
          'Normal : < 5,7 %',
          'Prédiabète : 5,7–6,4 %',
          'Diabète : ≥ 6,5 %',
          'Objectif thérapeutique habituel : < 7 % (à adapter selon l\'âge et le profil)',
          'À contrôler tous les 3 mois',
        ],
      },
      {
        type: 'list',
        title: '⏰ Facteurs influençant la glycémie',
        items: [
          '📈 Font monter la glycémie : glucides, stress, infections, médicaments corticoïdes, manque de sommeil, phénomène de l\'aube',
          '📉 Font baisser la glycémie : exercice physique, insuline et médicaments antidiabétiques, jeûne',
          '🌅 Phénomène de l\'aube : glycémie naturellement plus élevée le matin (hormones du réveil)',
          '🔁 Effet Somogyi : hyperglycémie rebond après une hypoglycémie nocturne',
        ],
      },
      {
        type: 'tip',
        text: '💡 Le Temps Dans la Cible (TIR — Time In Range) : objectif d\'avoir sa glycémie entre 70 et 180 mg/dL pendant au moins 70 % du temps. Cet indicateur est de plus en plus utilisé pour évaluer l\'équilibre glycémique.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'diet',
    emoji: '🥗',
    color: '#F57C00',
    bg: '#FFF3E0',
    title: "L'alimentation du diabétique",
    subtitle: 'Index glycémique, glucides et conseils pratiques',
    blocks: [
      {
        type: 'paragraph',
        text: "Il n'existe pas de régime diabétique universel, mais des principes généraux qui permettent de stabiliser la glycémie. L'objectif est de limiter les pics de glycémie après les repas tout en assurant une alimentation équilibrée et agréable.",
      },
      {
        type: 'list',
        title: "📊 L'Index Glycémique (IG)",
        items: [
          "Mesure la vitesse à laquelle un aliment fait monter la glycémie (de 0 à 100)",
          'IG élevé (> 70) : pain blanc, riz blanc, pomme de terre, sodas → pics glycémiques',
          'IG moyen (55–70) : riz complet, maïs, banane mûre',
          'IG bas (< 55) : légumineuses, légumes, céréales complètes, plupart des fruits → préférer',
          'La cuisson, la maturité et la transformation modifient l\'IG',
          'IG des pâtes al dente < pâtes bien cuites',
        ],
      },
      {
        type: 'list',
        title: '✅ Aliments à privilégier',
        items: [
          '🥦 Légumes non féculents (brocoli, épinards, courgettes, tomates) → sans limite',
          '🫘 Légumineuses (lentilles, pois chiches, haricots) → très bonne source de protéines et fibres',
          '🐟 Poissons gras (saumon, maquereau) → oméga-3 bénéfiques pour le cœur',
          '🥚 Œufs, volaille sans peau → faible impact glycémique',
          '🫐 Fruits entiers (pomme, poire, fruits rouges) → modérément',
          '🌾 Céréales complètes (avoine, quinoa, sarrasin)',
          '🫒 Huile d\'olive, avocat, noix → graisses insaturées',
          '🥛 Produits laitiers nature sans sucre ajouté',
        ],
      },
      {
        type: 'list',
        title: '❌ Aliments à limiter ou éviter',
        items: [
          '🥤 Boissons sucrées, sodas, jus de fruits → pics glycémiques immédiats',
          '🍬 Confiseries, bonbons, sucre ajouté',
          '🍞 Pain blanc, viennoiseries, biscuits industriels',
          '🍟 Aliments frits, fast-food',
          '🥔 Pomme de terre (IG très élevé surtout en purée)',
          '🍺 Alcool : risque d\'hypoglycémie, surtout avec insuline',
          '🍫 Chocolat au lait, desserts sucrés',
        ],
      },
      {
        type: 'tip',
        text: "💡 Règle de l'assiette idéale : ½ légumes non féculents + ¼ féculents à IG bas + ¼ protéines maigres. Mangez à des horaires réguliers et évitez de sauter des repas.",
      },
      {
        type: 'list',
        title: '🍷 Alcool et diabète',
        items: [
          "L'alcool inhibe la production de glucose par le foie",
          'Risque d\'hypoglycémie retardée (jusqu\'à 24h après)',
          'Si vous buvez : mangez toujours en même temps',
          'Evitez les cocktails sucrés, préférez un verre de vin sec',
          'Informez votre entourage que vous êtes diabétique',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'exercise',
    emoji: '🏃',
    color: '#7B1FA2',
    bg: '#F3E5F5',
    title: "L'activité physique",
    subtitle: 'Bénéfices, précautions et exercices recommandés',
    blocks: [
      {
        type: 'paragraph',
        text: "L'exercice physique est l'un des piliers du traitement du diabète de type 2. Il améliore la sensibilité à l'insuline, fait baisser la glycémie et réduit le risque cardiovasculaire. Ses effets peuvent durer 24 à 48 heures après l'effort.",
      },
      {
        type: 'list',
        title: '💪 Bénéfices prouvés de l\'exercice',
        items: [
          "📉 Baisse immédiate et durable de la glycémie (les muscles consomment du glucose)",
          "🔑 Améliore la sensibilité à l'insuline (moins d'insuline nécessaire)",
          "❤️ Réduit le risque cardiovasculaire (1ère cause de mortalité chez les diabétiques)",
          "⚖️ Aide à contrôler le poids",
          "😊 Améliore l'humeur, réduit le stress et l'anxiété",
          "💤 Améliore la qualité du sommeil",
          "🦴 Renforce os et muscles",
        ],
      },
      {
        type: 'list',
        title: '🏅 Exercices recommandés',
        items: [
          '🚶 Marche rapide 30 min/jour : simple, efficace, accessible à tous',
          '🚴 Vélo, natation, aquagym : exercices à faible impact articulaire',
          '💃 Danse, yoga : combine mouvement et bien-être mental',
          '🏋️ Musculation légère : améliore la composition corporelle',
          '🧘 Tai-chi : bénéfique pour l\'équilibre glycémique et le stress',
          'Objectif OMS : 150 min d\'activité modérée par semaine minimum',
        ],
      },
      {
        type: 'list',
        title: '⚠️ Précautions importantes',
        items: [
          '🩸 Mesurer la glycémie AVANT l\'exercice',
          'Si glycémie < 100 mg/dL : prendre une collation (15g de glucides) avant de commencer',
          'Si glycémie > 250 mg/dL : reporter l\'exercice et vérifier la présence de cétones',
          '🧃 Emporter toujours du sucre rapide (jus, bonbons) pendant l\'effort',
          'Mesurer après l\'exercice et 2h après (risque d\'hypoglycémie retardée)',
          '💧 Bien s\'hydrater avant, pendant et après',
          '👟 Inspecter ses pieds avant et après (neuropathie = moins de sensibilité)',
        ],
      },
      {
        type: 'warning',
        text: "⚠️ L'hypoglycémie peut survenir pendant, immédiatement après ou jusqu'à 12–24h après un exercice intense. Soyez vigilant, surtout si vous prenez de l'insuline ou des sulfamides.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'medications',
    emoji: '💊',
    color: '#00897B',
    bg: '#E0F2F1',
    title: 'Les médicaments du diabète',
    subtitle: 'Insulines, antidiabétiques oraux et injections',
    blocks: [
      {
        type: 'paragraph',
        text: "Le traitement médicamenteux du diabète a pour but de maintenir la glycémie dans des valeurs cibles et de prévenir les complications. Il doit toujours être prescrit et adapté par un médecin.",
      },
      {
        type: 'list',
        title: "💉 Les insulines (type 1 obligatoire, type 2 parfois)",
        items: [
          "⚡ Insuline ultra-rapide (Novorapid, Humalog, Apidra) : agit en 10–20 min, dure 3–5h. Se prend juste avant le repas",
          "⚡ Insuline rapide (Actrapid) : agit en 30 min, dure 6–8h",
          "🕐 Insuline intermédiaire NPH (Insulatard) : durée 12–16h",
          "🌙 Insuline lente basale (Lantus, Toujeo, Levemir) : dure 20–24h. Une injection/jour, assure l'insulinémie de base",
          "🔄 Mélanges pré-mélangés (Mixtard, Novomix) : pratique mais moins flexible",
        ],
      },
      {
        type: 'list',
        title: "💊 Médicaments oraux (type 2)",
        items: [
          "🟢 Metformine (Glucophage) : 1ère intention, réduit la production hépatique de glucose, pas d'hypoglycémie, protège le cœur",
          "🟡 Sulfamides (Diamicron, Amarel) : stimulent la sécrétion d'insuline. Risque d'hypoglycémie",
          "🔵 DPP-4 / Gliptines (Januvia, Galvus) : bien tolérés, risque hypo faible",
          "🟣 GLP-1 (Ozempic, Victoza, Trulicity) : injections 1x/semaine, perte de poids significative, protection cardiovasculaire",
          "🟠 SGLT2 / Gliflozines (Jardiance, Forxiga) : éliminent le glucose par les urines. Protection rénale et cardiaque prouvée",
          "🔴 Acarbose (Glucor) : ralentit l'absorption des glucides. Gaz intestinaux fréquents",
        ],
      },
      {
        type: 'list',
        title: "💉 Sites d'injection de l'insuline",
        items: [
          '🤰 Abdomen (zone autour du nombril) : absorption la plus rapide et régulière',
          '🦵 Cuisses (face externe) : absorption plus lente',
          '💪 Bras (face externe) : absorption intermédiaire',
          '🍑 Fesses : absorption la plus lente',
          'Rotation des sites à chaque injection pour éviter la lipodystrophie',
          'Laisser l\'alcool sécher avant de piquer',
          'Ne jamais injecter dans un muscle',
        ],
      },
      {
        type: 'tip',
        text: "💡 Conservation de l'insuline : au réfrigérateur (2–8°C) non ouverte. Une fois ouverte : à température ambiante, à l'abri de la chaleur et de la lumière, max 30 jours. Ne jamais congeler.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'monitoring',
    emoji: '🩸',
    color: '#C62828',
    bg: '#FFEBEE',
    title: 'Surveiller sa glycémie',
    subtitle: 'Fréquence, techniques et appareils',
    blocks: [
      {
        type: 'paragraph',
        text: "L'auto-surveillance glycémique permet d'adapter son traitement, son alimentation et son activité physique en temps réel. Elle est indispensable pour éviter les hypoglycémies et les hyperglycémies prolongées.",
      },
      {
        type: 'list',
        title: "📅 Quand mesurer sa glycémie ?",
        items: [
          '🌅 À jeun le matin (avant tout aliment) : évalue la glycémie basale',
          '🍽️ Avant les repas : pour adapter la dose d\'insuline ou vérifier l\'équilibre',
          '🕐 1–2h après le début du repas : évalue l\'impact de ce repas',
          '🌙 Au coucher : pour détecter un risque d\'hypo nocturne',
          '🏃 Avant et après l\'exercice physique',
          '🤒 En cas de maladie, fièvre, stress important',
          '🚗 Avant de conduire (si insulino-traité)',
        ],
      },
      {
        type: 'list',
        title: "📏 Fréquence recommandée",
        items: [
          'Diabète type 1 sous insuline : 4 à 8 mesures par jour minimum',
          'Diabète type 2 sous insuline : 2 à 4 mesures par jour',
          'Diabète type 2 sous médicaments oraux : 1 à 2 mesures par jour',
          'Objectif HbA1c : dosage tous les 3 mois chez le médecin',
        ],
      },
      {
        type: 'list',
        title: "📱 Technique correcte au glucomètre",
        items: [
          'Bien se laver les mains à l\'eau tiède (pas d\'alcool → fausse valeur)',
          'Piquer sur le côté du bout du doigt (moins douloureux)',
          'La 1ère goutte de sang peut être essuyée pour plus de précision',
          'Ne pas comprimer fort le doigt (dilue le sang)',
          'Calibrer régulièrement l\'appareil',
          'Vérifier la date de péremption des bandelettes',
          'Stocker les bandelettes à l\'abri de l\'humidité et de la chaleur',
        ],
      },
      {
        type: 'list',
        title: '📡 Capteurs de glucose en continu (CGM)',
        items: [
          'FreeStyle Libre (Abbott) : capteur porté 14 jours sur le bras, lecture par scan du smartphone',
          'Dexcom G7 : mesure en continu toutes les 5 min, alertes automatiques hypo/hyper',
          'Medtronic Guardian : intégré aux pompes à insuline',
          'Avantage : détecte les tendances (montée, descente), moins de piqûres du bout du doigt',
          'Remboursé en France pour les diabétiques de type 1 sous insuline',
        ],
      },
      {
        type: 'tip',
        text: "💡 Consignez vos mesures dans un carnet ou une application comme NikSanté. Notez le contexte (repas, exercice, stress) pour mieux comprendre les variations de votre glycémie.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'complications',
    emoji: '⚠️',
    color: '#E65100',
    bg: '#FFF3E0',
    title: 'Complications du diabète',
    subtitle: 'Risques à long terme et prévention',
    blocks: [
      {
        type: 'paragraph',
        text: "Un diabète mal équilibré sur plusieurs années endommage progressivement les vaisseaux sanguins et les nerfs. Ces complications sont les principales causes de mortalité et d'handicap chez les diabétiques. La bonne nouvelle : elles sont largement évitables avec un contrôle glycémique strict.",
      },
      {
        type: 'list',
        title: '👁️ Rétinopathie diabétique (yeux)',
        items: [
          'Atteinte des petits vaisseaux de la rétine',
          '1ère cause de cécité chez les adultes actifs',
          'Asymptomatique longtemps, puis vision floue, taches',
          'Prévention : contrôle glycémique + bilan ophtalmologique annuel',
          'Traitement : laser, injections intra-vitréennes',
        ],
      },
      {
        type: 'list',
        title: '🫘 Néphropathie diabétique (reins)',
        items: [
          'Atteinte des glomérules rénaux (filtres du sang)',
          '1ère cause d\'insuffisance rénale en France',
          'Détectée par une microalbuminurie dans les urines',
          'Peut évoluer vers la dialyse ou la transplantation',
          'Prévention : contrôle glycémique + tensionnel + éviter les anti-inflammatoires',
        ],
      },
      {
        type: 'list',
        title: '⚡ Neuropathie diabétique (nerfs)',
        items: [
          'Atteinte des nerfs périphériques et végétatifs',
          'Symptômes : fourmillements, brûlures, douleurs dans les pieds/mains',
          'Peut provoquer une perte de sensibilité (risque blessures non ressenties)',
          'Neuropathie végétative : hypotension orthostatique, troubles digestifs, cardiaques',
          'Prévention : contrôle glycémique, arrêt tabac, soins des pieds quotidiens',
        ],
      },
      {
        type: 'list',
        title: '❤️ Maladies cardiovasculaires',
        items: [
          'Risque d\'infarctus x2 à x4 chez les diabétiques',
          'Risque d\'AVC x2',
          'Artériopathie des membres inférieurs (douleurs à la marche)',
          'Prévention : contrôle glycémique + tensionnel + statines + activité physique + arrêt tabac',
        ],
      },
      {
        type: 'list',
        title: '🦶 Pied diabétique',
        items: [
          'Combinaison de neuropathie (perte de sensibilité) + artériopathie (mauvaise cicatrisation)',
          'Risque d\'ulcères chroniques, infections graves, gangrène',
          '1ère cause d\'amputation non traumatique',
          'Inspection quotidienne des pieds indispensable',
          'Consultation podologue régulièrement',
          'Chaussures adaptées, ne jamais marcher pieds nus',
        ],
      },
      {
        type: 'table',
        rows: [
          { label: '👁️ Fond d\'œil',          value: '1 fois par an',        color: '#1565C0' },
          { label: '🫘 Créatinine / albumine', value: '1 fois par an',        color: '#1565C0' },
          { label: '❤️ Bilan cardiovasculaire', value: '1 fois par an',       color: '#1565C0' },
          { label: '🦶 Examen des pieds',      value: '1 fois par an (podo)', color: '#1565C0' },
          { label: '🩸 HbA1c',                value: 'Tous les 3 mois',      color: '#388E3C' },
          { label: '💊 Consultation diabéto',  value: '2 à 4 fois par an',    color: '#388E3C' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'emergencies',
    emoji: '🚨',
    color: '#B71C1C',
    bg: '#FFEBEE',
    title: 'Urgences glycémiques',
    subtitle: 'Hypoglycémie, hyperglycémie et cétoacidose',
    blocks: [
      {
        type: 'list',
        title: '📉 Hypoglycémie (glycémie < 70 mg/dL)',
        items: [
          '⚡ Causes : repas sauté, dose d\'insuline trop forte, exercice non prévu, alcool',
          '😰 Symptômes légers : tremblements, sueurs froides, palpitations, faim, irritabilité',
          '😵 Symptômes sévères : confusion, vision trouble, convulsions, perte de conscience',
          '🍬 Traitement : 15g de glucides rapides (3 morceaux de sucre, 150 ml jus, 1 cuillère de miel)',
          '⏱️ Attendre 15 minutes et remesurer',
          '🔁 Si toujours < 70 mg/dL : répéter la prise de sucre',
          '🍞 Stabiliser avec une collation complexe (pain + fromage)',
          '🚑 Inconscience : glucagon IM/SC (kit Glucagen) — appeler le 15',
        ],
      },
      {
        type: 'warning',
        text: "⚠️ Ne JAMAIS forcer une personne inconsciente à boire ou manger. La mettre en position latérale de sécurité (PLS) et appeler le 15 (SAMU).",
      },
      {
        type: 'list',
        title: '📈 Hyperglycémie (glycémie > 200 mg/dL)',
        items: [
          '⚡ Causes : oubli de traitement, infection, stress, excès alimentaire',
          '🥤 Symptômes : soif intense, urines fréquentes, fatigue, vision floue',
          '💧 Action : boire de l\'eau, prendre son traitement habituel si prescrit',
          '🚶 Marche 15–20 min si possible (fait baisser la glycémie)',
          '🔁 Remesurer après 1–2 heures',
          'Si > 300 mg/dL malgré traitement : consulter rapidement',
        ],
      },
      {
        type: 'list',
        title: '☠️ Acidocétose diabétique (ACD) — URGENCE',
        items: [
          'Surtout dans le diabète de type 1',
          'Survient quand l\'organisme manque d\'insuline et brûle les graisses (cétones)',
          'Signes : nausées, vomissements, douleurs abdominales, haleine fruitée (acétonée), hyperventilation',
          'Glycémie souvent > 300 mg/dL + présence de cétones dans les urines',
          '🚑 APPELER LE 15 IMMÉDIATEMENT — hospitalisation en urgence nécessaire',
        ],
      },
      {
        type: 'list',
        title: '🏥 Quand appeler le 15 (SAMU) ?',
        items: [
          'Perte de conscience ou convulsions',
          'Impossibilité de faire avaler du sucre',
          'Glycémie > 300 mg/dL malgré le traitement',
          'Vomissements répétés + glycémie très élevée',
          'Haleine fruitée + malaise général',
          'Confusion mentale persistante',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'lifestyle',
    emoji: '🌟',
    color: '#5C6BC0',
    bg: '#E8EAF6',
    title: 'Bien vivre avec le diabète',
    subtitle: 'Bien-être mental, conseils quotidiens et suivi',
    blocks: [
      {
        type: 'paragraph',
        text: "Le diabète est une maladie chronique qui touche non seulement le corps mais aussi le mental. Apprendre à vivre avec implique de trouver un équilibre entre les contraintes médicales et une vie épanouissante.",
      },
      {
        type: 'list',
        title: '🧠 Santé mentale et diabète',
        items: [
          '😟 La détresse diabétique (Diabetes Distress) touche 35–40 % des diabétiques',
          '😔 Le risque de dépression est 2 à 3 fois plus élevé que dans la population générale',
          '💬 Parler de ses difficultés à son médecin, un psychologue ou un groupe de soutien',
          '🧘 Techniques de gestion du stress : respiration, méditation, yoga',
          '🤝 Rejoindre une association de patients (AFD, Aide aux Jeunes Diabétiques)',
          'Un stress chronique élève la glycémie via le cortisol',
        ],
      },
      {
        type: 'list',
        title: '✈️ Voyager avec le diabète',
        items: [
          '💊 Médicaments et matériel en bagage cabine (jamais en soute → température)',
          '📄 Ordonnance et certificat médical en anglais (et dans la langue du pays)',
          '🆔 Carte de diabétique / bracelet médical',
          '🧊 Pochette isotherme pour l\'insuline',
          '🍬 Sucres rapides toujours accessibles dans le sac à main',
          'Décalage horaire : adapter les horaires d\'injection avec le médecin',
          'Assurance voyage adaptée aux maladies chroniques',
        ],
      },
      {
        type: 'list',
        title: '😴 Sommeil et diabète',
        items: [
          'Un manque de sommeil (< 6h) augmente la résistance à l\'insuline',
          'L\'apnée du sommeil aggrave le diabète (à dépister)',
          'Glycémie élevée la nuit peut perturber le sommeil (réveils, nycturie)',
          'Objectif : 7–8h de sommeil par nuit',
          'Éviter les écrans et les repas copieux avant le coucher',
        ],
      },
      {
        type: 'list',
        title: "📋 Suivi médical annuel recommandé",
        items: [
          '👨‍⚕️ Diabétologue ou médecin traitant : 2 à 4 fois/an',
          '👁️ Ophtalmologue : 1 fois/an (fond d\'œil)',
          '🦶 Podologue : 1 fois/an minimum',
          '🫀 Cardiologue : selon le profil de risque',
          '🫘 Néphrologue : si atteinte rénale',
          '🦷 Dentiste : 2 fois/an (infections dentaires aggravent le diabète)',
          '💉 Vaccinations : grippe, pneumocoque (infections plus graves chez les diabétiques)',
        ],
      },
      {
        type: 'tip',
        text: "💡 Portez toujours sur vous : une carte mentionnant votre diabète et vos traitements, des sucres rapides, votre glucomètre et votre téléphone. En cas d'urgence, ces informations peuvent sauver votre vie.",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function DiabetesGuideScreen() {
  const router     = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);

  const toggle = (id: string) => setOpenId(openId === id ? null : id);

  return (
    <SafeAreaView style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ThemedText style={styles.backText}>← Retour</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Guide Diabète</ThemedText>
        <View style={{ width: s(60) }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={styles.hero}>
          <ThemedText style={styles.heroEmoji}>📚</ThemedText>
          <ThemedText style={styles.heroTitle}>Tout savoir sur le diabète</ThemedText>
          <ThemedText style={styles.heroSub}>
            {CHAPTERS.length} chapitres · Guide médical complet
          </ThemedText>
          <View style={styles.heroBadge}>
            <ThemedText style={styles.heroBadgeText}>
              ℹ️  Informations à titre éducatif — consultez toujours votre médecin
            </ThemedText>
          </View>
        </View>

        {/* Chapters */}
        {CHAPTERS.map((ch, index) => (
          <ChapterCard
            key={ch.id}
            chapter={ch}
            index={index + 1}
            isOpen={openId === ch.id}
            onToggle={() => toggle(ch.id)}
          />
        ))}

        <View style={{ height: vs(40) }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// ChapterCard
// ---------------------------------------------------------------------------

function ChapterCard({
  chapter, index, isOpen, onToggle,
}: {
  chapter: Chapter;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.chapterWrapper}>
      <TouchableOpacity
        style={[styles.chapterHeader, { borderLeftColor: chapter.color }]}
        onPress={onToggle}
        activeOpacity={0.8}
      >
        <View style={[styles.chapterNumBadge, { backgroundColor: chapter.color }]}>
          <ThemedText style={styles.chapterNum}>{index}</ThemedText>
        </View>
        <ThemedText style={styles.chapterEmoji}>{chapter.emoji}</ThemedText>
        <View style={styles.chapterInfo}>
          <ThemedText style={[styles.chapterTitle, { color: chapter.color }]}>
            {chapter.title}
          </ThemedText>
          <ThemedText style={styles.chapterSubtitle}>{chapter.subtitle}</ThemedText>
        </View>
        <ThemedText style={[styles.chapterArrow, { color: chapter.color }]}>
          {isOpen ? '▲' : '▼'}
        </ThemedText>
      </TouchableOpacity>

      {isOpen && (
        <View style={[styles.chapterBody, { backgroundColor: chapter.bg }]}>
          {chapter.blocks.map((block, i) => (
            <BlockRenderer key={i} block={block} accentColor={chapter.color} />
          ))}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// BlockRenderer
// ---------------------------------------------------------------------------

function BlockRenderer({ block, accentColor }: { block: Block; accentColor: string }) {
  switch (block.type) {

    case 'paragraph':
      return (
        <ThemedText style={styles.paragraph}>{block.text}</ThemedText>
      );

    case 'list':
      return (
        <View style={styles.listBlock}>
          {block.title && (
            <ThemedText style={[styles.listTitle, { color: accentColor }]}>
              {block.title}
            </ThemedText>
          )}
          {block.items.map((item, i) => (
            <View key={i} style={styles.listItem}>
              <ThemedText style={[styles.listBullet, { color: accentColor }]}>•</ThemedText>
              <ThemedText style={styles.listItemText}>{item}</ThemedText>
            </View>
          ))}
        </View>
      );

    case 'tip':
      return (
        <View style={styles.tipBox}>
          <ThemedText style={styles.tipText}>{block.text}</ThemedText>
        </View>
      );

    case 'warning':
      return (
        <View style={styles.warningBox}>
          <ThemedText style={styles.warningText}>{block.text}</ThemedText>
        </View>
      );

    case 'table':
      return (
        <View style={styles.tableBlock}>
          {block.rows.map((row, i) => (
            <View key={i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
              <ThemedText style={styles.tableLabel}>{row.label}</ThemedText>
              <ThemedText style={[styles.tableValue, row.color ? { color: row.color } : {}]}>
                {row.value}
              </ThemedText>
            </View>
          ))}
        </View>
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: s(20), paddingTop: vs(16), paddingBottom: vs(12),
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backBtn:     { padding: 4 },
  backText:    { color: '#388E3C', fontWeight: '600', fontSize: fs(15) },
  headerTitle: { fontSize: fs(17), fontWeight: 'bold', color: '#1a1a1a' },

  // Hero
  hero: {
    backgroundColor: '#1565C0', padding: s(24), alignItems: 'center',
    marginBottom: vs(8),
  },
  heroEmoji: { fontSize: fs(36), marginBottom: vs(6) },
  heroTitle: { fontSize: fs(22), fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: vs(4) },
  heroSub:   { fontSize: fs(13), color: 'rgba(255,255,255,0.8)', marginBottom: vs(12) },
  heroBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10,
    paddingVertical: vs(6), paddingHorizontal: s(12),
  },
  heroBadgeText: { fontSize: fs(11), color: 'rgba(255,255,255,0.9)', textAlign: 'center' },

  // Chapter card
  chapterWrapper: {
    marginHorizontal: s(16), marginBottom: vs(8),
    borderRadius: 14, overflow: 'hidden',
    elevation: 2, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3,
  },
  chapterHeader: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', padding: s(14),
    borderLeftWidth: 4, gap: s(10),
  },
  chapterNumBadge: {
    width: s(26), height: s(26), borderRadius: s(13),
    alignItems: 'center', justifyContent: 'center',
  },
  chapterNum:     { color: '#fff', fontWeight: 'bold', fontSize: fs(12) },
  chapterEmoji:   { fontSize: fs(22) },
  chapterInfo:    { flex: 1 },
  chapterTitle:   { fontSize: fs(14), fontWeight: 'bold', marginBottom: vs(2) },
  chapterSubtitle:{ fontSize: fs(11), color: '#888' },
  chapterArrow:   { fontSize: fs(12), fontWeight: 'bold' },

  // Chapter body
  chapterBody: {
    padding: s(16), gap: vs(16),
  },

  // Paragraph
  paragraph: {
    fontSize: fs(15), color: '#333', lineHeight: vs(24),
  },

  // List
  listBlock: { gap: vs(4) },
  listTitle: { fontSize: fs(15), fontWeight: '700', marginBottom: vs(6) },
  listItem:  { flexDirection: 'row', gap: s(8), alignItems: 'flex-start' },
  listBullet:    { fontSize: fs(15), fontWeight: 'bold', lineHeight: vs(23), marginTop: vs(1) },
  listItemText:  { flex: 1, fontSize: fs(15), color: '#333', lineHeight: vs(23) },

  // Tip
  tipBox: {
    backgroundColor: '#E8F5E9', borderRadius: 10,
    padding: s(12), borderLeftWidth: 3, borderLeftColor: '#388E3C',
  },
  tipText: { fontSize: fs(14), color: '#2E7D32', lineHeight: vs(22) },

  // Warning
  warningBox: {
    backgroundColor: '#FFF8E1', borderRadius: 10,
    padding: s(12), borderLeftWidth: 3, borderLeftColor: '#F57C00',
  },
  warningText: { fontSize: fs(14), color: '#E65100', lineHeight: vs(22) },

  // Table
  tableBlock: { borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#e0e0e0' },
  tableRow:    { flexDirection: 'row', alignItems: 'center', padding: s(10) },
  tableRowAlt: { backgroundColor: 'rgba(0,0,0,0.03)' },
  tableLabel:  { flex: 1, fontSize: fs(14), color: '#444' },
  tableValue:  { fontSize: fs(14), fontWeight: '700', textAlign: 'right' },
});
