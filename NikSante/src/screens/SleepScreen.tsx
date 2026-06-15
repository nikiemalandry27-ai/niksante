import { useEffect, useState } from 'react';
import {
  View, ScrollView, TouchableOpacity, StyleSheet, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  useSleepStore,
  computeSleepDuration,
  SLEEP_QUALITY_META,
  SleepEntry,
  SleepQuality,
} from '@/store/sleepStore';
import { useGlucoseStore } from '@/store/glucoseStore';
import { generateInsights, computeHealthScore } from '@/utils/insightEngine';
import { ThemedText } from '@/components/themed-text';
import { s, fs, vs } from '@/utils/responsive';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDuration(h: number): string {
  const hours   = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

// ---------------------------------------------------------------------------
// TimePicker — sélecteur d'heure simple (sans dépendance native)
// ---------------------------------------------------------------------------

interface TimePickerProps {
  label:    string;
  value:    string; // HH:MM
  onChange: (v: string) => void;
}

function TimePicker({ label, value, onChange }: TimePickerProps) {
  const [h, m] = value.split(':').map(Number);

  const setH = (next: number) => {
    const clamped = ((next % 24) + 24) % 24;
    onChange(`${String(clamped).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  };
  const setM = (next: number) => {
    const clamped = ((next % 60) + 60) % 60;
    onChange(`${String(h).padStart(2, '0')}:${String(clamped).padStart(2, '0')}`);
  };

  return (
    <View style={tp.container}>
      <ThemedText style={tp.label}>{label}</ThemedText>
      <View style={tp.row}>
        {/* Heures */}
        <View style={tp.col}>
          <TouchableOpacity style={tp.btn} onPress={() => setH(h + 1)}>
            <ThemedText style={tp.arrow}>▲</ThemedText>
          </TouchableOpacity>
          <View style={tp.display}>
            <ThemedText style={tp.digit}>{String(h).padStart(2, '0')}</ThemedText>
          </View>
          <TouchableOpacity style={tp.btn} onPress={() => setH(h - 1)}>
            <ThemedText style={tp.arrow}>▼</ThemedText>
          </TouchableOpacity>
        </View>

        <ThemedText style={tp.colon}>:</ThemedText>

        {/* Minutes */}
        <View style={tp.col}>
          <TouchableOpacity style={tp.btn} onPress={() => setM(m + 5)}>
            <ThemedText style={tp.arrow}>▲</ThemedText>
          </TouchableOpacity>
          <View style={tp.display}>
            <ThemedText style={tp.digit}>{String(m).padStart(2, '0')}</ThemedText>
          </View>
          <TouchableOpacity style={tp.btn} onPress={() => setM(m - 5)}>
            <ThemedText style={tp.arrow}>▼</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const tp = StyleSheet.create({
  container: { alignItems: 'center', flex: 1 },
  label:     { fontSize: fs(11), color: '#999', fontWeight: '700', letterSpacing: 0.5, marginBottom: vs(8) },
  row:       { flexDirection: 'row', alignItems: 'center', gap: s(4) },
  col:       { alignItems: 'center', gap: vs(4) },
  btn:       { width: s(36), height: vs(28), alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#f0f0f0' },
  arrow:     { fontSize: fs(14), color: '#388E3C', fontWeight: 'bold' },
  display:   { width: s(48), height: vs(44), alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 10, borderWidth: 1.5, borderColor: '#e0e0e0' },
  digit:     { fontSize: fs(24), fontWeight: 'bold', color: '#1a1a1a' },
  colon:     { fontSize: fs(24), fontWeight: 'bold', color: '#1a1a1a', marginBottom: vs(2) },
});

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function SleepScreen() {
  const entries         = useSleepStore(s => s.entries);
  const initSleep       = useSleepStore(s => s.initSleep);
  const addSleep        = useSleepStore(s => s.addSleep);
  const deleteSleep     = useSleepStore(s => s.deleteSleep);
  const getTodaySleep   = useSleepStore(s => s.getTodaySleep);
  const avgDuration     = useSleepStore(s => s.getAverageDuration)();
  const regularity      = useSleepStore(s => s.getSleepRegularity)();
  const glucoseHistory  = useGlucoseStore(s => s.glucoseHistory);

  // ── État du formulaire ──────────────────────────────────────────────────
  const [bedTime,  setBedTime]  = useState('22:30');
  const [wakeTime, setWakeTime] = useState('06:30');
  const [quality,  setQuality]  = useState<SleepQuality>(3);
  const [notes,    setNotes]    = useState('');
  const [saved,    setSaved]    = useState(false);

  useEffect(() => { initSleep(); }, []);

  // Pré-remplit si entrée aujourd'hui existe
  const todaySleep = getTodaySleep();
  useEffect(() => {
    if (todaySleep) {
      setBedTime(todaySleep.bedTime);
      setWakeTime(todaySleep.wakeTime);
      setQuality(todaySleep.quality);
      setNotes(todaySleep.notes ?? '');
    }
  }, [todaySleep?.id]);

  const duration = computeSleepDuration(bedTime, wakeTime);
  const insights = generateInsights(entries, glucoseHistory);
  const score    = computeHealthScore(entries, glucoseHistory);

  const handleSave = async () => {
    await addSleep({
      date:     todayStr(),
      bedTime,
      wakeTime,
      duration,
      quality,
      notes:    notes.trim() || undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDelete = (entry: SleepEntry) => {
    Alert.alert(
      'Supprimer',
      `Supprimer l'entrée du ${formatDate(entry.date)} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteSleep(entry.id) },
      ],
    );
  };

  const recent7 = entries.slice(0, 7);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <ThemedText style={styles.title}>🌙 Suivi du Sommeil</ThemedText>
          <ThemedText style={styles.subtitle}>
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </ThemedText>
        </View>

        {/* ── Score de santé ── */}
        <View style={[styles.scoreCard, { borderLeftColor: score.color }]}>
          <View style={styles.scoreRow}>
            <View>
              <ThemedText style={styles.scoreLabel}>SCORE DE SANTÉ</ThemedText>
              <ThemedText style={[styles.scoreValue, { color: score.color }]}>{score.total}</ThemedText>
              <ThemedText style={[styles.scoreTag, { color: score.color }]}>{score.label}</ThemedText>
            </View>
            <View style={styles.scoreBreakdown}>
              <ScoreBar label="Sommeil"  value={score.sleepScore}   color="#1565C0" />
              <ScoreBar label="Glycémie" value={score.glucoseScore} color="#388E3C" />
            </View>
          </View>
        </View>

        {/* ── Formulaire ── */}
        <View style={styles.formCard}>
          <ThemedText style={styles.sectionTitle}>Enregistrer votre nuit</ThemedText>

          {/* Sélecteurs d'heure */}
          <View style={styles.timeRow}>
            <TimePicker label="COUCHER"  value={bedTime}  onChange={setBedTime}  />
            <View style={styles.durationPill}>
              <ThemedText style={styles.durationText}>{formatDuration(duration)}</ThemedText>
            </View>
            <TimePicker label="RÉVEIL"   value={wakeTime} onChange={setWakeTime} />
          </View>

          {/* Qualité */}
          <ThemedText style={styles.qualityLabel}>QUALITÉ DU SOMMEIL</ThemedText>
          <View style={styles.qualityRow}>
            {([1, 2, 3, 4, 5] as SleepQuality[]).map(q => {
              const meta    = SLEEP_QUALITY_META[q];
              const active  = q === quality;
              return (
                <TouchableOpacity
                  key={q}
                  style={[
                    styles.qualityBtn,
                    active && { backgroundColor: meta.color + '22', borderColor: meta.color },
                  ]}
                  onPress={() => setQuality(q)}
                >
                  <ThemedText style={styles.qualityEmoji}>{meta.emoji}</ThemedText>
                  <ThemedText style={[styles.qualityBtnLabel, active && { color: meta.color, fontWeight: '700' }]}>
                    {meta.label}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Notes */}
          <TextInput
            style={styles.notesInput}
            placeholder="Notes (optionnel)..."
            placeholderTextColor="#bbb"
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={200}
          />

          {/* Bouton sauvegarder */}
          <TouchableOpacity
            style={[styles.saveBtn, saved && styles.saveBtnDone]}
            onPress={handleSave}
          >
            <ThemedText style={styles.saveBtnText}>
              {saved ? '✓ Enregistré !' : todaySleep ? 'Mettre à jour' : 'Enregistrer'}
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* ── Statistiques ── */}
        <View style={styles.statsRow}>
          <StatBox label="MOY. DURÉE"    value={avgDuration > 0 ? formatDuration(avgDuration) : '—'} />
          <StatBox label="RÉGULARITÉ"    value={`${regularity}%`} />
          <StatBox label="NUITS (7J)"    value={`${recent7.length}`} />
        </View>

        {/* ── Insights ── */}
        {insights.length > 0 && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Insights</ThemedText>
            {insights.slice(0, 3).map(ins => (
              <View key={ins.id} style={[styles.insightCard, { borderLeftColor: ins.color }]}>
                <ThemedText style={[styles.insightTitle, { color: ins.color }]}>
                  {ins.icon} {ins.title}
                </ThemedText>
                <ThemedText style={styles.insightMsg}>{ins.message}</ThemedText>
              </View>
            ))}
          </View>
        )}

        {/* ── Historique récent ── */}
        {recent7.length > 0 && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Historique (7 derniers jours)</ThemedText>
            {recent7.map(entry => {
              const meta = SLEEP_QUALITY_META[entry.quality];
              const isToday = entry.date === todayStr();
              return (
                <View key={entry.id} style={[styles.historyItem, { borderLeftColor: meta.color }]}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.historyTop}>
                      <ThemedText style={styles.historyDate}>
                        {isToday ? "Aujourd'hui" : formatDate(entry.date)}
                      </ThemedText>
                      <View style={[styles.qualityTag, { backgroundColor: meta.color + '22' }]}>
                        <ThemedText style={[styles.qualityTagText, { color: meta.color }]}>
                          {meta.emoji} {meta.label}
                        </ThemedText>
                      </View>
                    </View>
                    <ThemedText style={styles.historyDuration}>
                      🛏️ {entry.bedTime} → {entry.wakeTime} · <ThemedText style={{ fontWeight: 'bold', color: '#388E3C' }}>{formatDuration(entry.duration)}</ThemedText>
                    </ThemedText>
                    {entry.notes ? (
                      <ThemedText style={styles.historyNote}>📝 {entry.notes}</ThemedText>
                    ) : null}
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(entry)} style={styles.deleteBtn}>
                    <ThemedText style={styles.deleteBtnText}>✕</ThemedText>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// StatBox
// ---------------------------------------------------------------------------

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
      <ThemedText style={styles.statValue}>{value}</ThemedText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ScoreBar
// ---------------------------------------------------------------------------

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ marginBottom: vs(6) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: vs(2) }}>
        <ThemedText style={{ fontSize: fs(10), color: '#999' }}>{label}</ThemedText>
        <ThemedText style={{ fontSize: fs(10), color, fontWeight: '700' }}>{value}</ThemedText>
      </View>
      <View style={{ height: vs(6), backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
        <View style={{ width: `${value}%`, height: vs(6), backgroundColor: color, borderRadius: 3 }} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },

  header: { paddingHorizontal: s(20), paddingTop: vs(20), paddingBottom: vs(8) },
  title:    { fontSize: fs(22), fontWeight: 'bold', color: '#1a1a1a' },
  subtitle: { fontSize: fs(12), color: '#999', marginTop: vs(4), textTransform: 'capitalize' },

  // Score card
  scoreCard: {
    marginHorizontal: s(20), marginVertical: vs(10),
    backgroundColor: '#fff', borderRadius: 16, padding: s(16), borderLeftWidth: 5,
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  scoreRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scoreLabel:    { fontSize: fs(10), color: '#999', fontWeight: '700', letterSpacing: 0.6, marginBottom: vs(4) },
  scoreValue:    { fontSize: fs(44), fontWeight: 'bold', lineHeight: vs(48) },
  scoreTag:      { fontSize: fs(13), fontWeight: '700' },
  scoreBreakdown:{ flex: 1, marginLeft: s(20) },

  // Formulaire
  formCard: {
    marginHorizontal: s(20), marginBottom: vs(10),
    backgroundColor: '#fff', borderRadius: 16, padding: s(18),
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  sectionTitle: { fontSize: fs(13), fontWeight: '700', color: '#555', letterSpacing: 0.3, marginBottom: vs(14) },

  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: vs(18) },
  durationPill: {
    backgroundColor: '#E8F5E9', borderRadius: 20,
    paddingVertical: vs(8), paddingHorizontal: s(12),
    alignItems: 'center',
  },
  durationText: { fontSize: fs(16), fontWeight: 'bold', color: '#388E3C' },

  qualityLabel: { fontSize: fs(10), color: '#999', fontWeight: '700', letterSpacing: 0.6, marginBottom: vs(8) },
  qualityRow:   { flexDirection: 'row', gap: s(6), marginBottom: vs(14) },
  qualityBtn: {
    flex: 1, alignItems: 'center', paddingVertical: vs(8), borderRadius: 10,
    borderWidth: 1.5, borderColor: '#eee', backgroundColor: '#fafafa',
  },
  qualityEmoji:    { fontSize: fs(18) },
  qualityBtnLabel: { fontSize: fs(9), color: '#aaa', marginTop: vs(2), textAlign: 'center' },

  notesInput: {
    backgroundColor: '#f8f8f8', borderRadius: 10, borderWidth: 1, borderColor: '#eee',
    padding: s(12), fontSize: fs(13), color: '#333', minHeight: vs(60),
    marginBottom: vs(14), textAlignVertical: 'top',
  },

  saveBtn: {
    backgroundColor: '#388E3C', borderRadius: 12,
    paddingVertical: vs(14), alignItems: 'center',
  },
  saveBtnDone:  { backgroundColor: '#2E7D32' },
  saveBtnText:  { color: '#fff', fontWeight: 'bold', fontSize: fs(15) },

  // Stats
  statsRow: { flexDirection: 'row', marginHorizontal: s(20), marginBottom: vs(10), gap: s(10) },
  statBox: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: s(12), alignItems: 'center',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  statLabel: { fontSize: fs(9), color: '#aaa', fontWeight: '700', letterSpacing: 0.4, marginBottom: vs(4), textAlign: 'center' },
  statValue: { fontSize: fs(18), fontWeight: 'bold', color: '#388E3C' },

  // Section
  section: { marginHorizontal: s(20), marginBottom: vs(10) },

  // Insights
  insightCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: s(14),
    borderLeftWidth: 4, marginBottom: vs(8),
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2,
  },
  insightTitle: { fontSize: fs(13), fontWeight: 'bold', marginBottom: vs(4) },
  insightMsg:   { fontSize: fs(12), color: '#555', lineHeight: vs(18) },

  // Historique
  historyItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12, padding: s(12),
    borderLeftWidth: 4, marginBottom: vs(8),
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2,
  },
  historyTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: vs(4) },
  historyDate:    { fontSize: fs(12), fontWeight: '700', color: '#333' },
  historyDuration:{ fontSize: fs(12), color: '#666' },
  historyNote:    { fontSize: fs(11), color: '#999', fontStyle: 'italic', marginTop: vs(2) },
  qualityTag: { borderRadius: 8, paddingVertical: vs(2), paddingHorizontal: s(8) },
  qualityTagText: { fontSize: fs(10), fontWeight: '700' },

  deleteBtn:     { padding: s(8) },
  deleteBtnText: { fontSize: fs(16), color: '#ccc' },
});
