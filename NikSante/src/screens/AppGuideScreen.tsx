import { useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { s, fs, vs } from '@/utils/responsive';

type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'step';      items: { num: string; text: string }[] }
  | { type: 'tip';       text: string }
  | { type: 'list';      title?: string; items: string[] };

interface Section {
  id:       string;
  icon:     string;
  color:    string;
  bg:       string;
  title:    string;
  subtitle: string;
  blocks:   Block[];
}

const SECTIONS: Section[] = [
  {
    id: 'dashboard',
    icon: '🏠',
    color: '#388E3C',
    bg: '#E8F5E9',
    title: 'Tableau de bord',
    subtitle: "Vue d'ensemble de votre santé au quotidien",
    blocks: [
      {
        type: 'paragraph',
        text: "Le tableau de bord est l'écran principal de NikSanté. Il résume votre état de santé du moment : dernière mesure de glycémie, temps de sommeil de la nuit dernière, estimation de l'HbA1c et évolution de la glycémie sur plusieurs périodes.",
      },
      {
        type: 'list',
        title: 'Ce que vous y trouvez',
        items: [
          'Carte glycémie : dernière mesure avec son niveau (normal, élevé, critique…) et un conseil personnalisé selon le contexte du repas',
          'Carte HbA1c estimée : estimation calculée à partir de vos mesures des 90 derniers jours (14 mesures minimum requises)',
          'Courbe d\'évolution : graphique glissable sur 7, 30 ou 90 jours',
          'Carte sommeil : durée et qualité de la nuit précédente',
          'Actions rapides : ajouter une mesure, scanner un aliment, enregistrer une injection',
        ],
      },
      {
        type: 'tip',
        text: "La courbe glycémie est glissable : faites-la défiler de droite à gauche pour voir les données les plus anciennes.",
      },
    ],
  },
  {
    id: 'glucose',
    icon: '🩸',
    color: '#C62828',
    bg: '#FFEBEE',
    title: 'Enregistrer une glycémie',
    subtitle: 'Saisir et contextualiser chaque mesure',
    blocks: [
      {
        type: 'paragraph',
        text: "Appuyez sur l'action rapide \"+ Mesure\" depuis le tableau de bord pour enregistrer une nouvelle valeur de glycémie.",
      },
      {
        type: 'step',
        items: [
          { num: '1', text: 'Saisissez votre valeur (en mg/dL ou mmol/L selon vos réglages)' },
          { num: '2', text: 'Choisissez le contexte : à jeun, avant repas, après repas, au coucher ou lors d\'un sport' },
          { num: '3', text: 'Ajoutez une note optionnelle (aliment consommé, symptôme, activité…)' },
          { num: '4', text: 'Appuyez sur "Enregistrer" — la mesure apparaît immédiatement sur le tableau de bord' },
        ],
      },
      {
        type: 'tip',
        text: "Le contexte de mesure est important : il permet à l'application de vous donner un conseil adapté (avant repas = aliments à privilégier, après sport = récupération glycémique, etc.).",
      },
      {
        type: 'list',
        title: 'Niveaux de glycémie',
        items: [
          'Normal : 70 – 140 mg/dL  (3,9 – 7,8 mmol/L)',
          'Légèrement élevé : 141 – 180 mg/dL  (7,8 – 10,0 mmol/L)',
          'Hyperglycémie : > 180 mg/dL  (> 10,0 mmol/L)',
          'Hyperglycémie critique : > 250 mg/dL  (> 13,9 mmol/L)',
          'Hypoglycémie : < 70 mg/dL  (< 3,9 mmol/L)',
          'Hypoglycémie critique : < 54 mg/dL  (< 3,0 mmol/L)',
        ],
      },
    ],
  },
  {
    id: 'scanner',
    icon: '📷',
    color: '#E65100',
    bg: '#FFF3E0',
    title: 'Scanner alimentaire IA',
    subtitle: 'Analyser l\'impact d\'un aliment sur votre glycémie',
    blocks: [
      {
        type: 'paragraph',
        text: "La fonctionnalité de scan vous permet de photographier un aliment ou un plat pour obtenir une estimation de son impact sur votre glycémie, basée sur son contenu en glucides.",
      },
      {
        type: 'step',
        items: [
          { num: '1', text: 'Appuyez sur l\'action rapide "Scanner" depuis le tableau de bord' },
          { num: '2', text: 'Autorisez l\'accès à la caméra si demandé' },
          { num: '3', text: 'Photographiez l\'aliment ou le plat' },
          { num: '4', text: 'L\'IA analyse l\'image et estime l\'impact glycémique (faible, modéré, élevé)' },
          { num: '5', text: 'Vous recevez des conseils pour adapter votre repas ou votre dose si nécessaire' },
        ],
      },
      {
        type: 'tip',
        text: "Pour un meilleur résultat, photographiez l'aliment de face avec une bonne luminosité. Les aliments transformés (emballages visibles) sont mieux reconnus.",
      },
    ],
  },
  {
    id: 'insulin',
    icon: '💉',
    color: '#1565C0',
    bg: '#E3F2FD',
    title: 'Suivi de l\'insuline',
    subtitle: 'Enregistrer et suivre vos injections',
    blocks: [
      {
        type: 'paragraph',
        text: "L'onglet Insuline vous permet de consigner chaque injection : type d'insuline, dose en unités et heure d'administration. Vos injections sont automatiquement incluses dans le rapport médical PDF.",
      },
      {
        type: 'step',
        items: [
          { num: '1', text: 'Allez sur l\'onglet "Insuline" (icône seringue)' },
          { num: '2', text: 'Choisissez le type : Rapide (avant repas), Lente (fond), ou Prémixée' },
          { num: '3', text: 'Réglez la dose en unités avec les boutons + et −' },
          { num: '4', text: 'Ajustez l\'heure d\'injection avec les flèches haut/bas' },
          { num: '5', text: 'Ajoutez une note optionnelle (site d\'injection, contexte…)' },
          { num: '6', text: 'Appuyez sur "Enregistrer"' },
        ],
      },
      {
        type: 'list',
        title: 'Types d\'insuline',
        items: [
          'Rapide ⚡ : agit en 1 à 4h — NovoRapid, Humalog, Apidra. À prendre avant les repas',
          'Lente 🐢 : agit sur 12 à 24h — Lantus, Levemir, Toujeo. Maintient la glycémie de fond',
          'Prémixée 🔀 : mélange rapide + lente en une injection — NovoMix, Mixtard',
        ],
      },
      {
        type: 'tip',
        text: "Pour supprimer une injection enregistrée par erreur, appuyez longuement dessus dans l'historique.",
      },
    ],
  },
  {
    id: 'sleep',
    icon: '🌙',
    color: '#6A1B9A',
    bg: '#F3E5F5',
    title: 'Suivi du sommeil',
    subtitle: 'Enregistrer vos nuits et comprendre leur impact',
    blocks: [
      {
        type: 'paragraph',
        text: "Le manque de sommeil perturbe directement la glycémie. L'onglet Sommeil vous permet de consigner vos nuits et de visualiser leur impact sur votre équilibre glycémique.",
      },
      {
        type: 'step',
        items: [
          { num: '1', text: 'Allez sur l\'onglet "Sommeil" (icône lune)' },
          { num: '2', text: 'Sélectionnez la date de la nuit (hier ou avant-hier si oublié)' },
          { num: '3', text: 'Indiquez l\'heure de coucher et l\'heure de réveil' },
          { num: '4', text: 'Évaluez la qualité perçue (excellente, bonne, moyenne, mauvaise)' },
          { num: '5', text: 'Appuyez sur "Enregistrer"' },
        ],
      },
      {
        type: 'list',
        title: 'Ce que vous obtenez',
        items: [
          'Durée calculée automatiquement et affichée sur le tableau de bord',
          'Score de sommeil sur 100 basé sur les 7 derniers jours',
          'Conseil sur l\'impact glycémique selon la durée (< 6h = risque élevé)',
          'Historique des 30 dernières nuits',
        ],
      },
      {
        type: 'tip',
        text: "Enregistrez votre sommeil chaque matin pour que le tableau de bord affiche toujours la nuit la plus récente.",
      },
    ],
  },
  {
    id: 'report',
    icon: '📋',
    color: '#00695C',
    bg: '#E0F2F1',
    title: 'Rapport médical PDF',
    subtitle: 'Exporter vos données pour votre médecin',
    blocks: [
      {
        type: 'paragraph',
        text: "NikSanté génère un rapport médical PDF complet que vous pouvez partager directement avec votre médecin ou diabétologue lors d'une consultation.",
      },
      {
        type: 'list',
        title: 'Contenu du rapport',
        items: [
          'Historique de glycémie avec contextes de mesure',
          'Statistiques : moyenne, temps dans la cible (TIR), HbA1c estimée',
          'Injections d\'insuline enregistrées (type, dose, heure)',
          'Données de sommeil sur la période',
          'Graphique d\'évolution de la glycémie',
        ],
      },
      {
        type: 'step',
        items: [
          { num: '1', text: 'Allez dans "Profil" puis "Rapport médical"' },
          { num: '2', text: 'Choisissez la période : 7 jours, 14 jours ou 30 jours' },
          { num: '3', text: 'Appuyez sur "Générer le rapport"' },
          { num: '4', text: 'Partagez ou enregistrez le fichier PDF généré' },
        ],
      },
      {
        type: 'tip',
        text: "Plus vous enregistrez de mesures régulièrement, plus le rapport sera riche et utile pour votre suivi médical.",
      },
    ],
  },
  {
    id: 'reminders',
    icon: '🔔',
    color: '#F57C00',
    bg: '#FFF8E1',
    title: 'Rappels de mesure',
    subtitle: 'Ne jamais oublier de mesurer sa glycémie',
    blocks: [
      {
        type: 'paragraph',
        text: "Configurez des rappels journaliers pour être notifié aux moments clés : avant les repas, le matin à jeun, au coucher ou après le sport.",
      },
      {
        type: 'step',
        items: [
          { num: '1', text: 'Allez dans "Profil" puis "Rappels glycémie"' },
          { num: '2', text: 'Activez les rappels souhaités avec le bouton bascule' },
          { num: '3', text: 'Ajustez les heures selon votre routine' },
          { num: '4', text: 'Sur certains téléphones (Samsung, Xiaomi…), autorisez le démarrage automatique dans les paramètres système pour que les rappels fonctionnent en arrière-plan' },
        ],
      },
      {
        type: 'tip',
        text: "Si les rappels ne s'affichent pas, vérifiez que NikSanté est autorisée à envoyer des notifications dans les paramètres de votre téléphone.",
      },
    ],
  },
];

export default function AppGuideScreen() {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(SECTIONS[0].id);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ThemedText style={styles.backArrow}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Guide d'utilisation</ThemedText>
          <ThemedText style={styles.headerSub}>Comment utiliser chaque fonctionnalité</ThemedText>
        </View>

        {/* Sections */}
        {SECTIONS.map(section => {
          const isOpen = expanded === section.id;
          return (
            <View key={section.id} style={styles.card}>
              <TouchableOpacity
                style={[styles.cardHeader, { backgroundColor: section.bg }]}
                onPress={() => setExpanded(isOpen ? null : section.id)}
                activeOpacity={0.8}
              >
                <View style={styles.cardHeaderLeft}>
                  <ThemedText style={styles.cardIcon}>{section.icon}</ThemedText>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={[styles.cardTitle, { color: section.color }]}>{section.title}</ThemedText>
                    <ThemedText style={styles.cardSubtitle}>{section.subtitle}</ThemedText>
                  </View>
                </View>
                <ThemedText style={[styles.chevron, { color: section.color }]}>{isOpen ? '▲' : '▼'}</ThemedText>
              </TouchableOpacity>

              {isOpen && (
                <View style={styles.cardBody}>
                  {section.blocks.map((block, bi) => {
                    if (block.type === 'paragraph') {
                      return (
                        <ThemedText key={bi} style={styles.paragraph}>{block.text}</ThemedText>
                      );
                    }
                    if (block.type === 'step') {
                      return (
                        <View key={bi} style={styles.stepList}>
                          {block.items.map((item, si) => (
                            <View key={si} style={styles.stepRow}>
                              <View style={[styles.stepNum, { backgroundColor: section.color }]}>
                                <ThemedText style={styles.stepNumText}>{item.num}</ThemedText>
                              </View>
                              <ThemedText style={styles.stepText}>{item.text}</ThemedText>
                            </View>
                          ))}
                        </View>
                      );
                    }
                    if (block.type === 'list') {
                      return (
                        <View key={bi} style={styles.listBlock}>
                          {block.title && (
                            <ThemedText style={[styles.listTitle, { color: section.color }]}>{block.title}</ThemedText>
                          )}
                          {block.items.map((item, ii) => (
                            <View key={ii} style={styles.listRow}>
                              <ThemedText style={[styles.bullet, { color: section.color }]}>•</ThemedText>
                              <ThemedText style={styles.listItem}>{item}</ThemedText>
                            </View>
                          ))}
                        </View>
                      );
                    }
                    if (block.type === 'tip') {
                      return (
                        <View key={bi} style={[styles.tip, { backgroundColor: section.bg, borderLeftColor: section.color }]}>
                          <ThemedText style={styles.tipIcon}>💡</ThemedText>
                          <ThemedText style={[styles.tipText, { color: section.color }]}>{block.text}</ThemedText>
                        </View>
                      );
                    }
                    return null;
                  })}
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },

  header: { paddingHorizontal: s(20), paddingTop: vs(16), paddingBottom: vs(20) },
  backBtn: { marginBottom: vs(8) },
  backArrow: { fontSize: fs(28), color: '#388E3C', fontWeight: 'bold' },
  headerTitle: { fontSize: fs(24), fontWeight: 'bold', color: '#1a1a1a' },
  headerSub:   { fontSize: fs(13), color: '#999', marginTop: vs(4) },

  card: {
    marginHorizontal: s(16), marginBottom: vs(10),
    borderRadius: 14, overflow: 'hidden',
    backgroundColor: '#fff',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: s(16), paddingVertical: vs(14),
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: s(12), flex: 1 },
  cardIcon:     { fontSize: fs(24) },
  cardTitle:    { fontSize: fs(15), fontWeight: '800' },
  cardSubtitle: { fontSize: fs(11), color: '#888', marginTop: vs(2) },
  chevron:      { fontSize: fs(12), fontWeight: '700', marginLeft: s(8) },

  cardBody: { paddingHorizontal: s(16), paddingVertical: vs(16) },

  paragraph: { fontSize: fs(13), color: '#444', lineHeight: vs(21), marginBottom: vs(12) },

  stepList: { gap: vs(10), marginBottom: vs(12) },
  stepRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: s(12) },
  stepNum:  { width: s(24), height: s(24), borderRadius: s(12), alignItems: 'center', justifyContent: 'center', marginTop: vs(1) },
  stepNumText: { fontSize: fs(12), fontWeight: '800', color: '#fff' },
  stepText: { flex: 1, fontSize: fs(13), color: '#444', lineHeight: vs(20) },

  listBlock: { marginBottom: vs(12) },
  listTitle: { fontSize: fs(12), fontWeight: '800', marginBottom: vs(8) },
  listRow:   { flexDirection: 'row', gap: s(8), marginBottom: vs(5) },
  bullet:    { fontSize: fs(14), fontWeight: 'bold', marginTop: vs(1) },
  listItem:  { flex: 1, fontSize: fs(13), color: '#444', lineHeight: vs(19) },

  tip: {
    flexDirection: 'row', gap: s(10), alignItems: 'flex-start',
    borderLeftWidth: 3, borderRadius: 8, padding: s(12), marginBottom: vs(8),
  },
  tipIcon: { fontSize: fs(16), marginTop: vs(1) },
  tipText: { flex: 1, fontSize: fs(12), lineHeight: vs(18), fontWeight: '600' },
});
