/**
 * NikSanté — Emergency Screen
 *
 * Conseils d'urgence selon le type de crise :
 *  - Hypoglycémie  (glycémie trop basse)
 *  - Hyperglycémie (glycémie trop haute)
 */

import { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemedText } from '@/components/themed-text';
import { s, fs, vs } from '@/utils/responsive';

// ---------------------------------------------------------------------------
// Données conseils
// ---------------------------------------------------------------------------

const HYPO = {
  type:     'Hypoglycémie',
  subtitle: 'Glycémie trop basse  (<  70 mg/dL)',
  emoji:    '📉',
  color:    '#1565C0',
  bg:       '#E3F2FD',
  symptoms: [
    '😰  Tremblements, sueurs froides',
    '💓  Palpitations, cœur qui s\'emballe',
    '😵  Vertiges, confusion, vision trouble',
    '😤  Faim soudaine et intense',
    '😟  Irritabilité, anxiété',
  ],
  actions: [
    { step: '1', text: 'Boire 150–200 ml de jus de fruit ou soda sucré' },
    { step: '2', text: 'Manger 3–4 morceaux de sucre ou des bonbons' },
    { step: '3', text: 'Attendre 15 minutes puis remesurer la glycémie' },
    { step: '4', text: 'Si pas d\'amélioration, répéter l\'étape 1 et 2' },
    { step: '5', text: 'Une fois stabilisé, consommer une collation plus consistante (pain, etc.)' },
  ],
  warning: '⚠️ En cas de perte de conscience, NE PAS forcer à boire. Allongez la personne en position latérale de sécurité.',
};

const HYPER = {
  type:     'Hyperglycémie',
  subtitle: 'Glycémie trop haute  (>  200 mg/dL)',
  emoji:    '📈',
  color:    '#E53935',
  bg:       '#FFF3E0',
  symptoms: [
    '🥤  Soif intense et persistante',
    '🚽  Urines fréquentes',
    '😴  Fatigue, manque d\'énergie',
    '👁️  Vision floue',
    '🤕  Maux de tête',
  ],
  actions: [
    { step: '1', text: 'Boire abondamment de l\'eau (sans sucre)' },
    { step: '2', text: 'Prendre votre traitement habituel si prescrit par votre médecin' },
    { step: '3', text: 'Éviter tout aliment sucré ou à index glycémique élevé' },
    { step: '4', text: 'Marcher 15–20 minutes si vous en êtes capable' },
    { step: '5', text: 'Remesurer la glycémie après 1 heure' },
  ],
  warning: '⚠️ Si la glycémie dépasse 300 mg/dL ou si des vomissements apparaissent, consultez rapidement un médecin.',
};

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export default function EmergencyScreen() {
  const router = useRouter();
  const [active, setActive] = useState<'hypo' | 'hyper'>('hypo');

  const data = active === 'hypo' ? HYPO : HYPER;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <ThemedText style={styles.closeText}>✕ Fermer</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>🆘  Conseils d'urgence</ThemedText>
        <View style={{ width: 70 }} />
      </View>

      {/* ── Sélecteur hypo / hyper ── */}
      <View style={styles.selector}>
        <TouchableOpacity
          style={[styles.selectorBtn, active === 'hypo' && selectorBtnActive('#1565C0')]}
          onPress={() => setActive('hypo')}
        >
          <ThemedText style={[styles.selectorText, active === 'hypo' && { color: '#1565C0', fontWeight: '700' }]}>
            📉  Hypoglycémie
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.selectorBtn, active === 'hyper' && selectorBtnActive('#E53935')]}
          onPress={() => setActive('hyper')}
        >
          <ThemedText style={[styles.selectorText, active === 'hyper' && { color: '#E53935', fontWeight: '700' }]}>
            📈  Hyperglycémie
          </ThemedText>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Titre crise ── */}
        <View style={[styles.crisisCard, { backgroundColor: data.bg, borderLeftColor: data.color }]}>
          <ThemedText style={styles.crisisEmoji}>{data.emoji}</ThemedText>
          <View style={{ flex: 1 }}>
            <ThemedText style={[styles.crisisType, { color: data.color }]}>{data.type}</ThemedText>
            <ThemedText style={styles.crisisSubtitle}>{data.subtitle}</ThemedText>
          </View>
        </View>

        {/* ── Symptômes ── */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: data.color }]}>Symptômes</ThemedText>
          <View style={styles.card}>
            {data.symptoms.map((s) => (
              <ThemedText key={s} style={styles.symptomLine}>{s}</ThemedText>
            ))}
          </View>
        </View>

        {/* ── Que faire ── */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: data.color }]}>Que faire ?</ThemedText>
          <View style={styles.card}>
            {data.actions.map((a) => (
              <View key={a.step} style={styles.actionRow}>
                <View style={[styles.stepBadge, { backgroundColor: data.color }]}>
                  <ThemedText style={styles.stepText}>{a.step}</ThemedText>
                </View>
                <ThemedText style={styles.actionText}>{a.text}</ThemedText>
              </View>
            ))}
          </View>
        </View>

        {/* ── Avertissement ── */}
        <View style={[styles.warningCard, { borderLeftColor: data.color }]}>
          <ThemedText style={styles.warningText}>{data.warning}</ThemedText>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function selectorBtnActive(color: string): ViewStyle {
  return {
    backgroundColor: '#fff',
    shadowColor: color,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#1C1C1E' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: s(16), paddingTop: vs(12), paddingBottom: vs(12),
  },
  closeBtn: {
    paddingVertical: vs(8), paddingHorizontal: s(12),
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20,
  },
  closeText:   { color: '#fff', fontWeight: '600', fontSize: fs(13) },
  headerTitle: { fontSize: fs(16), fontWeight: 'bold', color: '#fff' },

  // Sélecteur
  selector: {
    flexDirection: 'row', marginHorizontal: s(16), marginBottom: vs(8),
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: s(4),
  },
  selectorBtn: {
    flex: 1, paddingVertical: vs(10), alignItems: 'center', borderRadius: 11,
  },
  selectorText: { fontSize: fs(13), color: 'rgba(255,255,255,0.6)', fontWeight: '600' },

  // Scroll
  scroll: { paddingHorizontal: s(16), paddingTop: vs(8) },

  // Crise card
  crisisCard: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 16,
    padding: s(16), marginBottom: vs(16), borderLeftWidth: 5, gap: s(14),
  },
  crisisEmoji:    { fontSize: fs(40) },
  crisisType:     { fontSize: fs(20), fontWeight: 'bold', marginBottom: vs(4) },
  crisisSubtitle: { fontSize: fs(12), color: '#555' },

  // Sections
  section:      { marginBottom: vs(14) },
  sectionTitle: { fontSize: fs(12), fontWeight: '700', letterSpacing: 0.6, marginBottom: vs(8) },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: s(16),
    elevation: 2, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3,
  },

  // Symptômes
  symptomLine: { fontSize: fs(14), color: '#333', lineHeight: vs(26) },

  // Actions
  actionRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: vs(14), gap: s(12) },
  stepBadge: {
    width: s(28), height: s(28), borderRadius: s(14),
    alignItems: 'center', justifyContent: 'center', marginTop: vs(1),
  },
  stepText:   { color: '#fff', fontWeight: 'bold', fontSize: fs(13) },
  actionText: { flex: 1, fontSize: fs(14), color: '#333', lineHeight: vs(22) },

  // Warning
  warningCard: {
    backgroundColor: '#FFF8E1', borderRadius: 14,
    padding: s(14), borderLeftWidth: 4, marginBottom: vs(8),
  },
  warningText: { fontSize: fs(13), color: '#555', lineHeight: vs(20) },
});
