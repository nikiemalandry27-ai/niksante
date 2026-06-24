import { useState, useEffect } from 'react';
import {
  View, ScrollView, TouchableOpacity, TextInput, Text,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInsulinStore } from '@/store/insulinStore';
import { InsulinType, InsulinEntry } from '@/services/api';
import { ThemedText } from '@/components/themed-text';
import { s, fs, vs } from '@/utils/responsive';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const TYPE_META: Record<InsulinType, { label: string; color: string; desc: string; icon: string; placeholder: string }> = {
  rapide:   { label: 'Rapide',   color: '#1565C0', icon: '⚡', desc: 'Agit rapidement en 1 à 4h — à prendre avant les repas', placeholder: 'Ex : NovoRapid, Humalog, Apidra…' },
  lente:    { label: 'Lente',    color: '#388E3C', icon: '🐢', desc: 'Agit sur la durée, 12 à 24h — maintient la glycémie de fond', placeholder: 'Ex : Lantus, Levemir, Toujeo…' },
  premixte: { label: 'Prémixée', color: '#7B1FA2', icon: '🔀', desc: 'Mélange insuline rapide + lente en une seule injection', placeholder: 'Ex : NovoMix, Mixtard, Ryzodeg…' },
};

const DAY_LABELS = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];

function formatTime(d: Date): string {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(d: Date): string {
  const today     = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
  const dStr      = new Date(d).toISOString().split('T')[0];
  if (dStr === today)     return "Aujourd'hui";
  if (dStr === yesterday) return 'Hier';
  const dt = new Date(d);
  return `${DAY_LABELS[dt.getDay()]} ${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export default function InsulinScreen() {
  const fetchHistory = useInsulinStore(s => s.fetchHistory);
  const addEntry     = useInsulinStore(s => s.addEntry);
  const deleteEntry  = useInsulinStore(s => s.deleteEntry);
  const history      = useInsulinStore(s => s.history);
  const isLoading    = useInsulinStore(s => s.isLoading);
  const getTodayTotals = useInsulinStore(s => s.getTodayTotals);

  const [type, setType]             = useState<InsulinType>('rapide');
  const [dose, setDose]             = useState(10);
  const [hour, setHour]             = useState(new Date().getHours());
  const [minute, setMinute]         = useState(Math.round(new Date().getMinutes() / 5) * 5 % 60);
  const [note, setNote]             = useState('');
  const [productName, setProductName] = useState('');
  const [saving, setSaving]         = useState(false);

  useEffect(() => { fetchHistory(30); }, []);

  const totals = getTodayTotals();

  const handleAdd = async () => {
    if (dose <= 0) return;
    setSaving(true);
    try {
      const now   = new Date();
      const dated = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
      await addEntry(dose, type, dated, note.trim() || undefined, productName.trim() || undefined);
      setNote('');
      setProductName('');
      Alert.alert('Enregistré', `${dose} u de ${TYPE_META[type].label}${productName.trim() ? ` (${productName.trim()})` : ''} — ${String(hour).padStart(2,'0')}h${String(minute).padStart(2,'0')}`);
    } catch {
      Alert.alert('Erreur', 'Impossible d\'enregistrer. Vérifiez votre connexion.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (entry: InsulinEntry) => {
    Alert.alert(
      'Supprimer',
      `${entry.doseUnits} u · ${TYPE_META[entry.type].label} · ${formatTime(new Date(entry.administeredAt))}`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteEntry(entry.id) },
      ],
    );
  };

  // Regroupe l'historique par jour
  const byDay = history.reduce<Record<string, InsulinEntry[]>>((acc, e) => {
    const key = new Date(e.administeredAt).toISOString().split('T')[0];
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  const todayKey = new Date().toISOString().split('T')[0];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <ThemedText style={styles.title}>Suivi de l'insuline 💉</ThemedText>
          <ThemedText style={styles.subtitle}>Enregistrez vos injections au quotidien</ThemedText>
        </View>

        {/* ── Bannière info rapport médical ── */}
        <View style={styles.infoBanner}>
          <ThemedText style={styles.infoIcon}>📋</ThemedText>
          <ThemedText style={styles.infoText}>
            Vos injections enregistrées sont automatiquement incluses dans votre rapport médical, exportable depuis l'onglet <ThemedText style={styles.infoTextBold}>Profil</ThemedText>.
          </ThemedText>
        </View>

        {/* ── Totaux du jour ── */}
        <View style={styles.totalsCard}>
          <ThemedText style={styles.totalsLabel}>AUJOURD'HUI — doses en unités (u)</ThemedText>
          <View style={styles.totalsRow}>
            {(Object.keys(TYPE_META) as InsulinType[]).map(t => (
              <View key={t} style={[styles.totalBox, { borderColor: TYPE_META[t].color + '40' }]}>
                <ThemedText style={{ fontSize: fs(18) }}>{TYPE_META[t].icon}</ThemedText>
                <ThemedText style={[styles.totalDose, { color: TYPE_META[t].color }]}>
                  {totals[t] > 0 ? `${totals[t]} u` : '—'}
                </ThemedText>
                <ThemedText style={styles.totalType}>{TYPE_META[t].label}</ThemedText>
              </View>
            ))}
          </View>
        </View>

        {/* ── Formulaire ── */}
        <View style={styles.formCard}>
          <ThemedText style={styles.sectionLabel}>NOUVELLE INJECTION</ThemedText>

          {/* Sélecteur de type */}
          <View style={styles.typeRow}>
            {(Object.keys(TYPE_META) as InsulinType[]).map(t => (
              <TouchableOpacity
                key={t}
                onPress={() => setType(t)}
                style={[styles.typeBtn, type === t && { backgroundColor: TYPE_META[t].color, borderColor: TYPE_META[t].color }]}
              >
                <ThemedText style={{ fontSize: fs(16) }}>{TYPE_META[t].icon}</ThemedText>
                <ThemedText style={[styles.typeBtnLabel, type === t && { color: '#fff' }]}>
                  {TYPE_META[t].label}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
          <ThemedText style={[styles.typeDesc, { color: TYPE_META[type].color }]}>
            {TYPE_META[type].desc}
          </ThemedText>

          {/* Nom du produit */}
          <ThemedText style={styles.fieldLabel}>Nom du produit (optionnel)</ThemedText>
          <TextInput
            style={styles.noteInput}
            value={productName}
            onChangeText={setProductName}
            placeholder={TYPE_META[type].placeholder}
            placeholderTextColor="#ccc"
            maxLength={60}
          />

          {/* Dose */}
          <ThemedText style={styles.fieldLabel}>Dose (unités)</ThemedText>
          <View style={styles.doseRow}>
            <TouchableOpacity
              style={styles.doseBtn}
              onPress={() => setDose(d => Math.max(0.5, d - 0.5))}
            >
              <Text style={styles.doseBtnText}>−</Text>
            </TouchableOpacity>
            <View style={styles.doseDisplay}>
              <Text style={styles.doseValue}>{dose}</Text>
              <Text style={styles.doseUnit}>u</Text>
            </View>
            <TouchableOpacity
              style={styles.doseBtn}
              onPress={() => setDose(d => Math.min(300, d + 0.5))}
            >
              <Text style={styles.doseBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          {/* Heure */}
          <ThemedText style={styles.fieldLabel}>Heure d'injection</ThemedText>
          <View style={styles.timeRow}>
            {/* Heures */}
            <View style={styles.timeCol}>
              <TouchableOpacity onPress={() => setHour(h => (h + 1) % 24)} style={styles.timeArrowBtn}>
                <ThemedText style={styles.timeArrow}>▲</ThemedText>
              </TouchableOpacity>
              <ThemedText style={styles.timeDigit}>{String(hour).padStart(2, '0')}</ThemedText>
              <TouchableOpacity onPress={() => setHour(h => (h - 1 + 24) % 24)} style={styles.timeArrowBtn}>
                <ThemedText style={styles.timeArrow}>▼</ThemedText>
              </TouchableOpacity>
            </View>
            <ThemedText style={styles.timeColon}>:</ThemedText>
            {/* Minutes */}
            <View style={styles.timeCol}>
              <TouchableOpacity onPress={() => setMinute(m => (m + 5) % 60)} style={styles.timeArrowBtn}>
                <ThemedText style={styles.timeArrow}>▲</ThemedText>
              </TouchableOpacity>
              <ThemedText style={styles.timeDigit}>{String(minute).padStart(2, '0')}</ThemedText>
              <TouchableOpacity onPress={() => setMinute(m => (m - 5 + 60) % 60)} style={styles.timeArrowBtn}>
                <ThemedText style={styles.timeArrow}>▼</ThemedText>
              </TouchableOpacity>
            </View>
          </View>

          {/* Note optionnelle */}
          <ThemedText style={styles.fieldLabel}>Note (optionnel)</ThemedText>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Ex : avant le repas, injection à l'abdomen, à la cuisse…"
            placeholderTextColor="#ccc"
            maxLength={120}
          />

          {/* Bouton enregistrer */}
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: TYPE_META[type].color }]}
            onPress={handleAdd}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <ThemedText style={styles.saveBtnText}>
                  Enregistrer — {dose} u {TYPE_META[type].icon}
                </ThemedText>
            }
          </TouchableOpacity>
        </View>

        {/* ── Historique ── */}
        {history.length > 0 && (
          <View style={styles.historySection}>
            <ThemedText style={styles.sectionLabel}>HISTORIQUE (30 jours)</ThemedText>

            {isLoading && <ActivityIndicator color="#388E3C" style={{ marginVertical: vs(16) }} />}

            {Object.entries(byDay)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([day, entries]) => (
                <View key={day} style={styles.dayGroup}>
                  <ThemedText style={styles.dayLabel}>
                    {formatDateShort(new Date(day + 'T12:00:00'))}
                    {day === todayKey && (
                      <ThemedText style={styles.todayTag}>  · Aujourd'hui</ThemedText>
                    )}
                  </ThemedText>

                  {entries.map(e => (
                    <TouchableOpacity
                      key={e.id}
                      style={[styles.entryItem, { borderLeftColor: TYPE_META[e.type].color }]}
                      onLongPress={() => handleDelete(e)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.entryLeft}>
                        <View style={styles.entryTopRow}>
                          <ThemedText style={[styles.entryDose, { color: TYPE_META[e.type].color }]}>
                            {e.doseUnits} u
                          </ThemedText>
                          <View style={[styles.typePill, { backgroundColor: TYPE_META[e.type].color + '18' }]}>
                            <ThemedText style={[styles.typePillText, { color: TYPE_META[e.type].color }]}>
                              {TYPE_META[e.type].icon} {TYPE_META[e.type].label}
                            </ThemedText>
                          </View>
                        </View>
                        {e.productName ? (
                          <ThemedText style={[styles.entryProduct, { color: TYPE_META[e.type].color }]}>
                            💊 {e.productName}
                          </ThemedText>
                        ) : null}
                        <ThemedText style={styles.entryTime}>
                          {formatTime(new Date(e.administeredAt))}
                        </ThemedText>
                        {e.note ? (
                          <ThemedText style={styles.entryNote}>{e.note}</ThemedText>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}

            <ThemedText style={styles.deleteHint}>
              Appuyez longuement sur une injection pour la supprimer
            </ThemedText>
          </View>
        )}

        {history.length === 0 && !isLoading && (
          <View style={styles.emptyState}>
            <ThemedText style={styles.emptyIcon}>💉</ThemedText>
            <ThemedText style={styles.emptyText}>
              Aucune injection enregistrée.{'\n'}Utilisez le formulaire ci-dessus pour commencer.
            </ThemedText>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f5f5f5' },

  header: { paddingHorizontal: s(20), paddingTop: vs(20), paddingBottom: vs(8) },
  title:    { fontSize: fs(22), fontWeight: 'bold', color: '#1a1a1a' },
  subtitle: { fontSize: fs(13), color: '#999', marginTop: vs(4) },

  // Bannière info
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: s(10),
    marginHorizontal: s(20), marginBottom: vs(10),
    backgroundColor: '#E8F5E9', borderRadius: 12,
    padding: s(12), borderLeftWidth: 3, borderLeftColor: '#388E3C',
  },
  infoIcon:      { fontSize: fs(16), marginTop: vs(1) },
  infoText:      { flex: 1, fontSize: fs(12), color: '#2E7D32', lineHeight: vs(18) },
  infoTextBold:  { fontWeight: '700', color: '#1B5E20' },

  // Totaux
  totalsCard: {
    marginHorizontal: s(20), marginVertical: vs(12),
    backgroundColor: '#fff', borderRadius: 16, padding: s(16),
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  totalsLabel: { fontSize: fs(11), color: '#999', fontWeight: '700', letterSpacing: 0.8, marginBottom: vs(12) },
  totalsRow:   { flexDirection: 'row', gap: s(10) },
  totalBox: {
    flex: 1, alignItems: 'center', paddingVertical: vs(10),
    borderRadius: 12, borderWidth: 1.5, backgroundColor: '#fafafa',
  },
  totalDose: { fontSize: fs(18), fontWeight: 'bold', marginTop: vs(4) },
  totalType: { fontSize: fs(10), color: '#aaa', marginTop: vs(2), fontWeight: '600' },

  // Formulaire
  formCard: {
    marginHorizontal: s(20), marginBottom: vs(12),
    backgroundColor: '#fff', borderRadius: 16, padding: s(16),
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  sectionLabel: { fontSize: fs(11), color: '#999', fontWeight: '700', letterSpacing: 0.8, marginBottom: vs(14) },

  typeRow: { flexDirection: 'row', gap: s(8), marginBottom: vs(6) },
  typeBtn: {
    flex: 1, alignItems: 'center', paddingVertical: vs(8), borderRadius: 10,
    borderWidth: 1.5, borderColor: '#e0e0e0', backgroundColor: '#fafafa',
  },
  typeBtnLabel: { fontSize: fs(11), fontWeight: '700', color: '#555', marginTop: vs(2) },
  typeDesc: { fontSize: fs(11), marginBottom: vs(14), fontStyle: 'italic' },

  fieldLabel: { fontSize: fs(12), color: '#888', fontWeight: '600', marginBottom: vs(8), marginTop: vs(4) },

  // Dose stepper
  doseRow:    { flexDirection: 'row', alignItems: 'center', gap: s(12), marginBottom: vs(14) },
  doseBtn:    { width: s(48), height: s(48), borderRadius: 24, backgroundColor: '#388E3C', alignItems: 'center', justifyContent: 'center' },
  doseBtnText:{ fontSize: fs(28), color: '#fff', fontWeight: 'bold', lineHeight: vs(32) },
  doseDisplay:{
    flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: s(4),
    backgroundColor: '#fff', borderWidth: 2, borderColor: '#388E3C',
    borderRadius: 12, paddingVertical: vs(12), marginHorizontal: s(4),
  },
  doseValue:  { fontSize: fs(32), fontWeight: 'bold', color: '#000' },
  doseUnit:   { fontSize: fs(16), color: '#388E3C', fontWeight: '700', alignSelf: 'flex-end', marginBottom: vs(2) },

  // Time picker
  timeRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s(8), marginBottom: vs(14) },
  timeCol:      { alignItems: 'center' },
  timeArrowBtn: { padding: s(8) },
  timeArrow:    { fontSize: fs(16), color: '#388E3C', fontWeight: 'bold' },
  timeDigit:    { fontSize: fs(32), fontWeight: 'bold', color: '#1a1a1a', minWidth: s(52), textAlign: 'center' },
  timeColon:    { fontSize: fs(28), color: '#ccc', fontWeight: 'bold', marginTop: vs(-4) },

  // Note
  noteInput: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10,
    padding: s(12), fontSize: fs(13), color: '#333',
    backgroundColor: '#fafafa', marginBottom: vs(16), minHeight: vs(44),
  },

  // Bouton save
  saveBtn: {
    borderRadius: 12, paddingVertical: vs(14), alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: fs(15) },

  // Historique
  historySection: { marginHorizontal: s(20), marginBottom: vs(12) },
  dayGroup:    { marginBottom: vs(12) },
  dayLabel:    { fontSize: fs(12), fontWeight: '700', color: '#888', marginBottom: vs(6), textTransform: 'capitalize' },
  todayTag:    { color: '#388E3C' },

  entryItem: {
    backgroundColor: '#fff', borderRadius: 10, padding: s(12),
    marginBottom: vs(6), borderLeftWidth: 4,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2,
  },
  entryLeft:   { flex: 1 },
  entryTopRow: { flexDirection: 'row', alignItems: 'center', gap: s(8), marginBottom: vs(2) },
  entryDose:   { fontSize: fs(16), fontWeight: 'bold' },
  typePill:    { borderRadius: 8, paddingVertical: vs(2), paddingHorizontal: s(8) },
  typePillText:{ fontSize: fs(11), fontWeight: '700' },
  entryProduct:{ fontSize: fs(12), fontWeight: '600', marginBottom: vs(1) },
  entryTime:   { fontSize: fs(11), color: '#bbb' },
  entryNote:   { fontSize: fs(11), color: '#999', fontStyle: 'italic', marginTop: vs(2) },

  deleteHint:  { fontSize: fs(10), color: '#ccc', textAlign: 'center', marginTop: vs(8), fontStyle: 'italic' },

  emptyState:  { alignItems: 'center', marginTop: vs(40), paddingHorizontal: s(40) },
  emptyIcon:   { fontSize: fs(48), marginBottom: vs(12) },
  emptyText:   { fontSize: fs(14), color: '#bbb', textAlign: 'center', lineHeight: vs(22) },
});
