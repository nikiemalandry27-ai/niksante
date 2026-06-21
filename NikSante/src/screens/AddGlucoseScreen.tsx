/**
 * NikSanté — AddGlucoseScreen (Step 4)
 *
 * Nouveautés :
 *  - Sélecteur de contexte repas (MealContext)
 *  - addGlucose() reçoit maintenant mealContext
 */

import { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Keyboard,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useGlucoseStore, MealContext, MEAL_CONTEXT_META } from '@/store/glucoseStore';
import { getGlucoseStatus, getAIMessage, getStatusColor, toDisplay, fromDisplay, unitLabel } from '@/utils/glucoseHelper';
import { GLUCOSE_THRESHOLDS } from '@/utils/constants';
import { useSettingsStore } from '@/store/settingsStore';
import { ThemedText } from '@/components/themed-text';
import { s, fs, vs } from '@/utils/responsive';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const MG_DL_PRESETS = [70, 100, 150, 200];

const MEAL_CONTEXTS = Object.entries(MEAL_CONTEXT_META) as [
  NonNullable<MealContext>,
  { label: string; icon: string },
][];

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export default function AddGlucoseScreen() {
  const router     = useRouter();
  const addGlucose = useGlucoseStore((state) => state.addGlucose);

  const glucoseUnit = useSettingsStore((s) => s.glucoseUnit);

  const [glucoseValue, setGlucoseValue] = useState('');
  const [note,         setNote]         = useState('');
  const [mealContext,  setMealContext]  = useState<MealContext>(null);
  const [loading,      setLoading]      = useState(false);

  // Presets in the current display unit
  const QUICK_PRESETS = MG_DL_PRESETS.map((v) => ({
    value: v,
    label: glucoseUnit === 'mmol_l'
      ? (Math.round((v / 18) * 10) / 10).toFixed(1)
      : String(v),
  }));

  // Aperçu en temps réel (convert display → mg/dL for status calc)
  const numDisplay  = parseFloat(glucoseValue);
  const hasValue    = !isNaN(numDisplay) && numDisplay > 0;
  const numMgDl     = hasValue ? fromDisplay(numDisplay, glucoseUnit) : 0;
  const status      = hasValue ? getGlucoseStatus(numMgDl) : 'normal';
  const statusColor = hasValue ? getStatusColor(status) : '#ccc';
  const aiMessage   = getAIMessage(status, mealContext);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSave = async () => {
    if (!glucoseValue.trim()) {
      Alert.alert('Valeur manquante', 'Veuillez entrer une valeur de glycémie.');
      return;
    }
    const minDisplay = glucoseUnit === 'mmol_l' ? 1.1 : 20;
    const maxDisplay = glucoseUnit === 'mmol_l' ? 33.3 : 600;
    if (isNaN(numDisplay) || numDisplay < minDisplay || numDisplay > maxDisplay) {
      Alert.alert('Valeur invalide', `Entrez une valeur entre ${minDisplay} et ${maxDisplay} ${unitLabel(glucoseUnit)}.`);
      return;
    }

    setLoading(true);
    try {
      addGlucose(numMgDl, new Date(), note.trim() || undefined, mealContext);

      Alert.alert(
        '✅ Mesure enregistrée',
        `${glucoseValue} ${unitLabel(glucoseUnit)}${mealContext ? ' — ' + MEAL_CONTEXT_META[mealContext].label : ''}\n\n${aiMessage.message}`,
        [{ text: 'Voir le dashboard', onPress: () => router.navigate('/(tabs)/dashboard') }],
      );

      setGlucoseValue('');
      setNote('');
      setMealContext(null);
    } catch {
      Alert.alert('Erreur', 'Impossible d\'enregistrer la mesure.');
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        contentContainerStyle={{ paddingBottom: vs(40) }}
      >
          {/* ── Header ── */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <ThemedText style={styles.backText}>← Retour</ThemedText>
            </TouchableOpacity>
            <ThemedText style={styles.title}>Nouvelle mesure</ThemedText>
            <View style={{ width: 60 }} />
          </View>

          <View style={styles.form}>

            {/* ── Saisie valeur ── */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Glycémie ({unitLabel(glucoseUnit)}) *</ThemedText>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, hasValue && { borderColor: statusColor }]}
                  placeholder={glucoseUnit === 'mmol_l' ? 'Ex : 6.7' : 'Ex : 120'}
                  placeholderTextColor="#bbb"
                  keyboardType={glucoseUnit === 'mmol_l' ? 'decimal-pad' : 'number-pad'}
                  value={glucoseValue}
                  onChangeText={(v) => setGlucoseValue(v.replace(/[^0-9.]/g, ''))}
                  editable={!loading}
                  maxLength={glucoseUnit === 'mmol_l' ? 5 : 3}
                />
                {hasValue && (
                  <View style={[styles.badge, { backgroundColor: statusColor + '22', borderColor: statusColor }]}>
                    <ThemedText style={[styles.badgeText, { color: statusColor }]}>
                      {glucoseValue}
                    </ThemedText>
                  </View>
                )}
              </View>
            </View>

            {/* ── Présets rapides ── */}
            <View style={styles.section}>
              <ThemedText style={styles.label}>Présets rapides</ThemedText>
              <View style={styles.presetRow}>
                {QUICK_PRESETS.map((p) => (
                  <TouchableOpacity
                    key={p.value}
                    style={[
                      styles.presetBtn,
                      glucoseValue === p.label && styles.presetBtnActive,
                    ]}
                    onPress={() => setGlucoseValue(p.label)}
                    disabled={loading}
                  >
                    <ThemedText
                      style={[
                        styles.presetBtnText,
                        glucoseValue === p.label && { color: '#388E3C' },
                      ]}
                    >
                      {p.label}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── Contexte repas ── */}
            <View style={styles.section}>
              <ThemedText style={styles.label}>Contexte</ThemedText>
              <View style={styles.mealGrid}>
                {MEAL_CONTEXTS.map(([key, meta]) => (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.mealBtn,
                      mealContext === key && styles.mealBtnActive,
                    ]}
                    onPress={() => setMealContext(mealContext === key ? null : key)}
                    disabled={loading}
                  >
                    <ThemedText style={styles.mealIcon}>{meta.icon}</ThemedText>
                    <ThemedText
                      style={[
                        styles.mealLabel,
                        mealContext === key && styles.mealLabelActive,
                      ]}
                    >
                      {meta.label}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── Note ── */}
            <View style={styles.section}>
              <ThemedText style={styles.label}>Note (optionnelle)</ThemedText>
              <TextInput
                style={[styles.input, styles.noteInput]}
                placeholder="Ex : après le jogging, symptômes ressentis…"
                placeholderTextColor="#bbb"
                value={note}
                onChangeText={setNote}
                editable={!loading}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* ── Tableau de référence ── */}
            <View style={styles.thresholdsCard}>
              <ThemedText style={styles.thresholdsTitle}>Repères cliniques</ThemedText>
              {[
                { label: 'Hypoglycémie critique', range: `< ${toDisplay(GLUCOSE_THRESHOLDS.HYPO_CRITICAL, glucoseUnit)}`,                                                                                               color: '#B71C1C' },
                { label: 'Hypoglycémie',          range: `${toDisplay(GLUCOSE_THRESHOLDS.HYPO_CRITICAL, glucoseUnit)} – ${toDisplay(GLUCOSE_THRESHOLDS.HYPO_ALERT - 1, glucoseUnit)}`,                                  color: '#1565C0' },
                { label: 'Normal (optimal)',       range: `${toDisplay(GLUCOSE_THRESHOLDS.NORMAL_MIN, glucoseUnit)} – ${toDisplay(GLUCOSE_THRESHOLDS.NORMAL_MAX, glucoseUnit)}`,                                          color: '#388E3C' },
                { label: 'Élevé post-repas',       range: `${toDisplay(GLUCOSE_THRESHOLDS.NORMAL_MAX + 1, glucoseUnit)} – ${toDisplay(GLUCOSE_THRESHOLDS.HYPER_WARNING, glucoseUnit)}`,                                  color: '#F9A825' },
                { label: 'Hyperglycémie',          range: `${toDisplay(GLUCOSE_THRESHOLDS.HYPER_WARNING + 1, glucoseUnit)} – ${toDisplay(GLUCOSE_THRESHOLDS.HYPER_CRITICAL, glucoseUnit)}`,                              color: '#E65100' },
                { label: 'Hyperglycémie critique', range: `> ${toDisplay(GLUCOSE_THRESHOLDS.HYPER_CRITICAL, glucoseUnit)}`,                                                                                               color: '#B71C1C' },
              ].map((row) => (
                <View key={row.label} style={styles.thresholdRow}>
                  <View style={[styles.dot, { backgroundColor: row.color }]} />
                  <ThemedText style={styles.thresholdLabel}>{row.label}</ThemedText>
                  <ThemedText style={[styles.thresholdValue, { color: row.color }]}>
                    {row.range} {unitLabel(glucoseUnit)}
                  </ThemedText>
                </View>
              ))}
            </View>

            {/* ── Aperçu IA ── */}
            {hasValue && (
              <View style={[styles.previewCard, { borderLeftColor: statusColor }]}>
                <ThemedText style={[styles.previewTitle, { color: statusColor }]}>
                  {aiMessage.title}
                </ThemedText>
                <ThemedText style={styles.previewMsg}>{aiMessage.message}</ThemedText>
                {aiMessage.suggestion ? (
                  <ThemedText style={styles.previewSuggestion}>💡 {aiMessage.suggestion}</ThemedText>
                ) : null}
              </View>
            )}

            {/* ── Boutons ── */}
            <TouchableOpacity
              style={[styles.saveBtn, (!hasValue || loading) && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!hasValue || loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <ThemedText style={styles.saveBtnText}>Enregistrer</ThemedText>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => router.back()}
              disabled={loading}
            >
              <ThemedText style={styles.cancelBtnText}>Annuler</ThemedText>
            </TouchableOpacity>

          </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    paddingHorizontal: s(20),
    paddingTop:      vs(16),
    paddingBottom:   vs(12),
  },
  backBtn:  { padding: 4 },
  backText: { color: '#388E3C', fontWeight: '600', fontSize: fs(15) },
  title:    { fontSize: fs(18), fontWeight: 'bold', color: '#1a1a1a' },
  form:     { paddingHorizontal: s(20), paddingTop: vs(8) },
  section:  { marginBottom: vs(20) },
  inputGroup: { marginBottom: vs(20) },
  label: {
    fontSize: fs(13), fontWeight: '700', color: '#555',
    marginBottom: vs(8), letterSpacing: 0.3,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: s(12) },
  input: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: s(16), paddingVertical: vs(14),
    borderColor: '#ddd', borderWidth: 1.5,
    fontSize: fs(18), fontWeight: '700', color: '#222',
  },
  noteInput: {
    fontSize: fs(14), fontWeight: '400',
    minHeight: vs(80), textAlignVertical: 'top', paddingTop: vs(12),
  },
  badge: {
    width: s(72), height: s(72), borderRadius: 10, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center',
  },
  badgeText: { fontSize: fs(22), fontWeight: 'bold' },
  // Présets
  presetRow: { flexDirection: 'row', gap: s(10) },
  presetBtn: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10,
    paddingVertical: vs(12), alignItems: 'center',
    borderWidth: 1.5, borderColor: '#ddd',
  },
  presetBtnActive: { borderColor: '#388E3C', backgroundColor: '#E8F5E9' },
  presetBtnText: { fontSize: fs(15), fontWeight: '700', color: '#555' },
  // Contexte repas
  mealGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: s(10) },
  mealBtn: {
    width: '47%', backgroundColor: '#fff', borderRadius: 10,
    paddingVertical: vs(12), paddingHorizontal: s(12),
    flexDirection: 'row', alignItems: 'center', gap: s(8),
    borderWidth: 1.5, borderColor: '#ddd',
  },
  mealBtnActive: { borderColor: '#388E3C', backgroundColor: '#E8F5E9' },
  mealIcon:  { fontSize: fs(18) },
  mealLabel: { fontSize: fs(13), fontWeight: '600', color: '#555', flex: 1 },
  mealLabelActive: { color: '#388E3C' },
  // Seuils
  thresholdsCard: {
    backgroundColor: '#fff', borderRadius: 12,
    padding: s(14), marginBottom: vs(20),
  },
  thresholdsTitle: {
    fontSize: fs(12), fontWeight: '700', color: '#999',
    marginBottom: vs(10), letterSpacing: 0.5,
  },
  thresholdRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: vs(6) },
  dot: { width: s(8), height: s(8), borderRadius: 4, marginRight: s(10) },
  thresholdLabel: { flex: 1, fontSize: fs(12), color: '#555' },
  thresholdValue: { fontSize: fs(12), fontWeight: '700' },
  // Aperçu IA
  previewCard: {
    backgroundColor: '#FFFDE7', borderRadius: 12,
    padding: s(14), marginBottom: vs(20), borderLeftWidth: 5,
  },
  previewTitle: { fontSize: fs(13), fontWeight: 'bold', marginBottom: vs(6) },
  previewMsg:   { fontSize: fs(12), color: '#444', lineHeight: vs(18) },
  previewSuggestion: { fontSize: fs(11), color: '#666', marginTop: vs(6), lineHeight: vs(16) },
  // Boutons
  saveBtn: {
    backgroundColor: '#388E3C', borderRadius: 10,
    paddingVertical: vs(16), alignItems: 'center', marginBottom: vs(12),
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: fs(16) },
  cancelBtn: {
    backgroundColor: '#fff', borderRadius: 10,
    paddingVertical: vs(13), alignItems: 'center',
    borderWidth: 1, borderColor: '#ddd',
  },
  cancelBtnText: { color: '#888', fontWeight: '600', fontSize: fs(14) },
});
