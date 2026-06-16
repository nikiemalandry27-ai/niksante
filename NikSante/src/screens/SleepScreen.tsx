import { useEffect, useState } from 'react';
import {
  View, ScrollView, TouchableOpacity, StyleSheet, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  useSleepStore,
  computeSleepDuration,
  SLEEP_QUALITY_META,
  WAKE_FEELING_META,
  SleepEntry,
  SleepQuality,
  WakeFeeling,
} from '@/store/sleepStore';
import { useGlucoseStore } from '@/store/glucoseStore';
import {
  generateInsights,
  computeHealthScore,
  computeSleepDebt,
  detectChronotype,
  getDailyTip,
} from '@/utils/insightEngine';
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
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatDuration(h: number): string {
  const hours   = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

// ---------------------------------------------------------------------------
// TimePicker
// ---------------------------------------------------------------------------

interface TimePickerProps {
  label:    string;
  value:    string;
  onChange: (v: string) => void;
}

function TimePicker({ label, value, onChange }: TimePickerProps) {
  const [h, m] = value.split(':').map(Number);

  const setH = (next: number) => {
    const c = ((next % 24) + 24) % 24;
    onChange(`${String(c).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  };
  const setM = (next: number) => {
    const c = ((next % 60) + 60) % 60;
    onChange(`${String(h).padStart(2, '0')}:${String(c).padStart(2, '0')}`);
  };

  return (
    <View style={tp.container}>
      <ThemedText style={tp.label}>{label}</ThemedText>
      <View style={tp.row}>
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
  const entries        = useSleepStore(s => s.entries);
  const initSleep      = useSleepStore(s => s.initSleep);
  const addSleep       = useSleepStore(s => s.addSleep);
  const deleteSleep    = useSleepStore(s => s.deleteSleep);
  const avgDuration    = useSleepStore(s => s.getAverageDuration)();
  const glucoseHistory = useGlucoseStore(s => s.glucoseHistory);

  // ── Date sélectionnée ──────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState(todayStr());

  const goToPrevDay = () => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };
  const goToNextDay = () => {
    if (selectedDate >= todayStr()) return;
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const existingEntry = entries.find(e => e.date === selectedDate) ?? null;

  // ── État du formulaire ─────────────────────────────────────────────────────
  const [bedTime,      setBedTime]      = useState('22:30');
  const [wakeTime,     setWakeTime]     = useState('06:30');
  const [quality,      setQuality]      = useState<SleepQuality>(3);
  const [wakeFeeling,  setWakeFeeling]  = useState<WakeFeeling | null>(null);
  const [notes,        setNotes]        = useState('');
  const [saved,        setSaved]        = useState(false);
  const [showScoreInfo, setShowScoreInfo] = useState(false);

  useEffect(() => { initSleep(); }, []);

  useEffect(() => {
    if (existingEntry) {
      setBedTime(existingEntry.bedTime);
      setWakeTime(existingEntry.wakeTime);
      setQuality(existingEntry.quality);
      setWakeFeeling(existingEntry.wakeFeeling ?? null);
      setNotes(existingEntry.notes ?? '');
    } else {
      setBedTime('22:30');
      setWakeTime('06:30');
      setQuality(3);
      setWakeFeeling(null);
      setNotes('');
    }
    setSaved(false);
  }, [selectedDate, existingEntry?.id]);

  // ── Données calculées ──────────────────────────────────────────────────────
  const duration  = computeSleepDuration(bedTime, wakeTime);
  const insights  = generateInsights(entries, glucoseHistory);
  const score     = computeHealthScore(entries, glucoseHistory);
  const debt      = entries.length > 0 ? computeSleepDebt(entries) : null;
  const chronotype = detectChronotype(entries);
  const dailyTip  = getDailyTip(entries, debt);
  const recent7   = entries.slice(0, 7);

  // ── Sauvegarde ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    await addSleep({
      date: selectedDate,
      bedTime,
      wakeTime,
      duration,
      quality,
      wakeFeeling: wakeFeeling ?? undefined,
      notes: notes.trim() || undefined,
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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <ThemedText style={styles.title}>🌙 Suivi du Sommeil</ThemedText>
            {chronotype && (
              <View style={styles.chronoBadge}>
                <ThemedText style={styles.chronoEmoji}>{chronotype.emoji}</ThemedText>
                <ThemedText style={styles.chronoLabel}>{chronotype.label}</ThemedText>
              </View>
            )}
          </View>
          {debt && debt.personalGoal > 0 && (
            <ThemedText style={styles.goalLabel}>
              Objectif personnel : <ThemedText style={styles.goalValue}>{debt.personalGoal}h</ThemedText>
            </ThemedText>
          )}
        </View>

        {/* ── Conseil du jour ── */}
        <View style={[styles.tipCard, { borderLeftColor: dailyTip.color }]}>
          <ThemedText style={styles.tipTitle}>CONSEIL DU JOUR</ThemedText>
          <ThemedText style={styles.tipText}>{dailyTip.icon}  {dailyTip.text}</ThemedText>
        </View>

        {/* ── Score de santé ── */}
        {score ? (
          <View style={[styles.scoreCard, { borderLeftColor: score.color }]}>
            <View style={styles.scoreRow}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
                  <ThemedText style={styles.scoreLabel}>SCORE DE SANTÉ</ThemedText>
                  <TouchableOpacity onPress={() => setShowScoreInfo(v => !v)} style={styles.infoBtn}>
                    <ThemedText style={styles.infoBtnText}>?</ThemedText>
                  </TouchableOpacity>
                </View>
                <ThemedText style={[styles.scoreValue, { color: score.color }]}>{score.total}<ThemedText style={[styles.scoreOver, { color: score.color }]}>/100</ThemedText></ThemedText>
                <ThemedText style={[styles.scoreTag, { color: score.color }]}>{score.label}</ThemedText>
              </View>
              <View style={styles.scoreBreakdown}>
                <ScoreBar label="Sommeil"  value={score.sleepScore}   color="#1565C0" />
                <ScoreBar label="Glycémie" value={score.glucoseScore} color="#388E3C" />
              </View>
            </View>
            {showScoreInfo && (
              <View style={styles.scoreInfo}>
                <ThemedText style={styles.scoreInfoTitle}>Comment ce score est calculé</ThemedText>

                <ThemedText style={styles.scoreInfoSection}>Sommeil (40% du total)</ThemedText>
                <ThemedText style={styles.scoreInfoLine}>• Durée vs objectif perso — 40%</ThemedText>
                <ThemedText style={styles.scoreInfoLine}>• Qualité ressentie (1-5) — 40%</ThemedText>
                <ThemedText style={styles.scoreInfoLine}>• Régularité des horaires — 20%</ThemedText>
                <ThemedText style={styles.scoreInfoHint}>Si l'énergie au réveil est renseignée, elle remplace 30% du calcul pour plus de précision.</ThemedText>

                <ThemedText style={styles.scoreInfoSection}>Glycémie (60% du total)</ThemedText>
                <ThemedText style={styles.scoreInfoLine}>• Temps dans la cible 70-180 mg/dL — 60%</ThemedText>
                <ThemedText style={styles.scoreInfoLine}>• Stabilité (faible variabilité) — 40%</ThemedText>

                <ThemedText style={styles.scoreInfoHint}>Si une seule source est disponible, elle représente 100% du score.</ThemedText>
              </View>
            )}
          </View>
        ) : null}

        {/* ── Dette de sommeil ── */}
        {debt && debt.debt7d >= 0.5 && (
          <View style={styles.debtCard}>
            <View style={styles.debtHeader}>
              <ThemedText style={styles.debtTitle}>💤 DETTE DE SOMMEIL</ThemedText>
              <View style={styles.debtBadges}>
                <View style={styles.debtBadge}>
                  <ThemedText style={styles.debtBadgeVal}>{debt.debt7d}h</ThemedText>
                  <ThemedText style={styles.debtBadgeLbl}>7 jours</ThemedText>
                </View>
                {debt.debt14d > 0 && (
                  <View style={[styles.debtBadge, { backgroundColor: '#FFF0F0' }]}>
                    <ThemedText style={[styles.debtBadgeVal, { color: '#B71C1C' }]}>{debt.debt14d}h</ThemedText>
                    <ThemedText style={styles.debtBadgeLbl}>14 jours</ThemedText>
                  </View>
                )}
              </View>
            </View>
            {debt.recoveryNights > 0 && (
              <ThemedText style={styles.debtRecovery}>
                Plan récupération : +{debt.recoveryExtra} min/soir pendant {debt.recoveryNights} nuit{debt.recoveryNights > 1 ? 's' : ''}
              </ThemedText>
            )}
          </View>
        )}

        {/* ── Formulaire ── */}
        <View style={styles.formCard}>
          <ThemedText style={styles.sectionTitle}>Enregistrer votre nuit</ThemedText>

          {/* Sélecteur de date */}
          <View style={styles.dateNav}>
            <TouchableOpacity onPress={goToPrevDay} style={styles.dateNavBtn}>
              <ThemedText style={styles.dateNavArrow}>‹</ThemedText>
            </TouchableOpacity>
            <ThemedText style={styles.dateNavLabel}>
              {selectedDate === todayStr() ? "Aujourd'hui" : formatDate(selectedDate)}
            </ThemedText>
            <TouchableOpacity
              onPress={goToNextDay}
              style={styles.dateNavBtn}
              disabled={selectedDate >= todayStr()}
            >
              <ThemedText style={[styles.dateNavArrow, selectedDate >= todayStr() && { color: '#ccc' }]}>›</ThemedText>
            </TouchableOpacity>
          </View>

          {/* Sélecteurs d'heure */}
          <View style={styles.timeRow}>
            <TimePicker label="COUCHER"  value={bedTime}  onChange={setBedTime}  />
            <View style={styles.durationPill}>
              <ThemedText style={styles.durationText}>{formatDuration(duration)}</ThemedText>
            </View>
            <TimePicker label="RÉVEIL"   value={wakeTime} onChange={setWakeTime} />
          </View>

          {/* Qualité du sommeil */}
          <ThemedText style={styles.selectorLabel}>QUALITÉ DU SOMMEIL</ThemedText>
          <View style={styles.qualityRow}>
            {([1, 2, 3, 4, 5] as SleepQuality[]).map(q => {
              const meta   = SLEEP_QUALITY_META[q];
              const active = q === quality;
              return (
                <TouchableOpacity
                  key={q}
                  style={[styles.qualityBtn, active && { backgroundColor: meta.color + '22', borderColor: meta.color }]}
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

          {/* Énergie au réveil */}
          <ThemedText style={styles.selectorLabel}>ÉNERGIE AU RÉVEIL</ThemedText>
          <View style={styles.qualityRow}>
            {([1, 2, 3, 4, 5] as WakeFeeling[]).map(w => {
              const meta   = WAKE_FEELING_META[w];
              const active = w === wakeFeeling;
              return (
                <TouchableOpacity
                  key={w}
                  style={[styles.qualityBtn, active && { backgroundColor: meta.color + '22', borderColor: meta.color }]}
                  onPress={() => setWakeFeeling(active ? null : w)}
                >
                  <ThemedText style={styles.qualityEmoji}>{meta.emoji}</ThemedText>
                  <ThemedText style={[styles.qualityBtnLabel, active && { color: meta.color, fontWeight: '700' }]}>
                    {meta.label}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
          <ThemedText style={styles.optionalHint}>optionnel — appuyez à nouveau pour désélectionner</ThemedText>

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
              {saved ? '✓ Enregistré !' : existingEntry ? 'Mettre à jour' : 'Enregistrer'}
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* ── Statistiques ── */}
        <View style={styles.statsRow}>
          <StatBox label="MOY. DURÉE"   value={avgDuration > 0 ? formatDuration(avgDuration) : '—'} />
          <StatBox label="NUITS (7J)"   value={`${recent7.length}`} />
          <StatBox label="OBJECTIF"     value={debt ? `${debt.personalGoal}h` : '7.5h'} highlight />
        </View>

        {/* ── Insights (max 2) ── */}
        {insights.length > 0 && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Analyse</ThemedText>
            {insights.map(ins => (
              <View key={ins.id} style={[styles.insightCard, { borderLeftColor: ins.color }]}>
                <ThemedText style={[styles.insightTitle, { color: ins.color }]}>
                  {ins.icon}  {ins.title}
                </ThemedText>
                <ThemedText style={styles.insightMsg}>{ins.message}</ThemedText>
              </View>
            ))}
          </View>
        )}

        {/* ── Historique récent ── */}
        {recent7.length > 0 && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Historique (7 dernières nuits)</ThemedText>
            {recent7.map(entry => {
              const meta = SLEEP_QUALITY_META[entry.quality];
              const wf   = entry.wakeFeeling ? WAKE_FEELING_META[entry.wakeFeeling] : null;
              return (
                <View key={entry.id} style={[styles.historyItem, { borderLeftColor: meta.color }]}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.historyTop}>
                      <ThemedText style={styles.historyDate}>{formatDate(entry.date)}</ThemedText>
                      <View style={[styles.qualityTag, { backgroundColor: meta.color + '22' }]}>
                        <ThemedText style={[styles.qualityTagText, { color: meta.color }]}>
                          {meta.emoji} {meta.label}
                        </ThemedText>
                      </View>
                    </View>
                    <ThemedText style={styles.historyDuration}>
                      🛏️ {entry.bedTime} → {entry.wakeTime} · <ThemedText style={{ fontWeight: 'bold', color: '#388E3C' }}>{formatDuration(entry.duration)}</ThemedText>
                    </ThemedText>
                    {wf && (
                      <ThemedText style={styles.historyWake}>
                        Réveil : {wf.emoji} {wf.label}
                      </ThemedText>
                    )}
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

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={[styles.statBox, highlight && styles.statBoxHighlight]}>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
      <ThemedText style={[styles.statValue, highlight && { color: '#1565C0' }]}>{value}</ThemedText>
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

  // Header
  header:    { paddingHorizontal: s(20), paddingTop: vs(20), paddingBottom: vs(8) },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: vs(4) },
  title:     { fontSize: fs(20), fontWeight: 'bold', color: '#1a1a1a' },
  chronoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: s(4),
    backgroundColor: '#EDE7F6', borderRadius: 20,
    paddingVertical: vs(4), paddingHorizontal: s(10),
  },
  chronoEmoji: { fontSize: fs(14) },
  chronoLabel: { fontSize: fs(11), color: '#512DA8', fontWeight: '700' },
  goalLabel:   { fontSize: fs(11), color: '#999' },
  goalValue:   { fontWeight: '700', color: '#388E3C' },

  // Conseil du jour
  tipCard: {
    marginHorizontal: s(20), marginBottom: vs(10),
    backgroundColor: '#fff', borderRadius: 14, padding: s(14), borderLeftWidth: 4,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  tipTitle: { fontSize: fs(9), color: '#aaa', fontWeight: '700', letterSpacing: 0.8, marginBottom: vs(6) },
  tipText:  { fontSize: fs(13), color: '#333', lineHeight: vs(20) },

  // Score
  scoreCard: {
    marginHorizontal: s(20), marginVertical: vs(6),
    backgroundColor: '#fff', borderRadius: 16, padding: s(16), borderLeftWidth: 5,
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  scoreRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scoreLabel:     { fontSize: fs(10), color: '#999', fontWeight: '700', letterSpacing: 0.6, marginBottom: vs(4) },
  scoreValue:     { fontSize: fs(44), fontWeight: 'bold', lineHeight: vs(48) },
  scoreOver:      { fontSize: fs(16), fontWeight: '600' },
  scoreTag:       { fontSize: fs(13), fontWeight: '700' },
  scoreBreakdown: { flex: 1, marginLeft: s(20) },

  infoBtn:      { width: s(18), height: s(18), borderRadius: s(9), backgroundColor: '#e8e8e8', alignItems: 'center', justifyContent: 'center' },
  infoBtnText:  { fontSize: fs(10), fontWeight: '800', color: '#888' },

  scoreInfo:        { marginTop: vs(12), paddingTop: vs(12), borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  scoreInfoTitle:   { fontSize: fs(12), fontWeight: '800', color: '#444', marginBottom: vs(10) },
  scoreInfoSection: { fontSize: fs(11), fontWeight: '700', color: '#666', marginTop: vs(6), marginBottom: vs(2) },
  scoreInfoLine:    { fontSize: fs(11), color: '#777', marginBottom: vs(2), paddingLeft: s(4) },
  scoreInfoHint:    { fontSize: fs(10), color: '#aaa', fontStyle: 'italic', marginTop: vs(4) },

  // Dette de sommeil
  debtCard: {
    marginHorizontal: s(20), marginBottom: vs(10),
    backgroundColor: '#FFF3E0', borderRadius: 14, padding: s(14),
    borderLeftWidth: 4, borderLeftColor: '#F57C00',
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2,
  },
  debtHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: vs(6) },
  debtTitle:    { fontSize: fs(11), fontWeight: '800', color: '#E65100' },
  debtBadges:   { flexDirection: 'row', gap: s(8) },
  debtBadge:    { backgroundColor: '#FFE0B2', borderRadius: 10, paddingVertical: vs(4), paddingHorizontal: s(10), alignItems: 'center' },
  debtBadgeVal: { fontSize: fs(14), fontWeight: 'bold', color: '#F57C00' },
  debtBadgeLbl: { fontSize: fs(9), color: '#888', fontWeight: '600' },
  debtRecovery: { fontSize: fs(12), color: '#5D4037', fontStyle: 'italic' },

  // Formulaire
  formCard: {
    marginHorizontal: s(20), marginBottom: vs(10),
    backgroundColor: '#fff', borderRadius: 16, padding: s(18),
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  sectionTitle: { fontSize: fs(13), fontWeight: '700', color: '#555', letterSpacing: 0.3, marginBottom: vs(14) },

  dateNav:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: vs(16), backgroundColor: '#f5f5f5', borderRadius: 12, paddingVertical: vs(8) },
  dateNavBtn:   { paddingHorizontal: s(16), paddingVertical: vs(4) },
  dateNavArrow: { fontSize: fs(22), color: '#388E3C', fontWeight: 'bold' },
  dateNavLabel: { fontSize: fs(13), fontWeight: '700', color: '#333', textTransform: 'capitalize', flex: 1, textAlign: 'center' },

  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: vs(18) },
  durationPill: { backgroundColor: '#E8F5E9', borderRadius: 20, paddingVertical: vs(8), paddingHorizontal: s(12), alignItems: 'center' },
  durationText: { fontSize: fs(16), fontWeight: 'bold', color: '#388E3C' },

  selectorLabel: { fontSize: fs(10), color: '#999', fontWeight: '700', letterSpacing: 0.6, marginBottom: vs(8) },
  qualityRow:    { flexDirection: 'row', gap: s(6), marginBottom: vs(14) },
  qualityBtn: {
    flex: 1, alignItems: 'center', paddingVertical: vs(8), borderRadius: 10,
    borderWidth: 1.5, borderColor: '#eee', backgroundColor: '#fafafa',
  },
  qualityEmoji:    { fontSize: fs(18) },
  qualityBtnLabel: { fontSize: fs(9), color: '#aaa', marginTop: vs(2), textAlign: 'center' },
  optionalHint:    { fontSize: fs(10), color: '#bbb', fontStyle: 'italic', marginTop: vs(-8), marginBottom: vs(12), textAlign: 'center' },

  notesInput: {
    backgroundColor: '#f8f8f8', borderRadius: 10, borderWidth: 1, borderColor: '#eee',
    padding: s(12), fontSize: fs(13), color: '#333', minHeight: vs(60),
    marginBottom: vs(14), textAlignVertical: 'top',
  },
  saveBtn:      { backgroundColor: '#388E3C', borderRadius: 12, paddingVertical: vs(14), alignItems: 'center' },
  saveBtnDone:  { backgroundColor: '#2E7D32' },
  saveBtnText:  { color: '#fff', fontWeight: 'bold', fontSize: fs(15) },

  // Stats
  statsRow: { flexDirection: 'row', marginHorizontal: s(20), marginBottom: vs(10), gap: s(10) },
  statBox: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: s(12), alignItems: 'center',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  statBoxHighlight: { backgroundColor: '#E8EAF6', borderWidth: 1, borderColor: '#3F51B5' },
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
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#fff', borderRadius: 12, padding: s(12),
    borderLeftWidth: 4, marginBottom: vs(8),
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2,
  },
  historyTop:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: vs(4) },
  historyDate:     { fontSize: fs(12), fontWeight: '700', color: '#333', flex: 1 },
  historyDuration: { fontSize: fs(12), color: '#666', marginBottom: vs(2) },
  historyWake:     { fontSize: fs(11), color: '#888', marginBottom: vs(2) },
  historyNote:     { fontSize: fs(11), color: '#999', fontStyle: 'italic', marginTop: vs(2) },
  qualityTag:      { borderRadius: 8, paddingVertical: vs(2), paddingHorizontal: s(8) },
  qualityTagText:  { fontSize: fs(10), fontWeight: '700' },
  deleteBtn:       { padding: s(8) },
  deleteBtnText:   { fontSize: fs(16), color: '#ccc' },
});
