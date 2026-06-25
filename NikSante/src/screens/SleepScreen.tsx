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
  SLEEP_GOAL_MIN,
  SLEEP_GOAL_MAX,
  SLEEP_GOAL_STEP,
  SleepEntry,
  SleepQuality,
  WakeFeeling,
} from '@/store/sleepStore';
import { useGlucoseStore } from '@/store/glucoseStore';
import {
  generateInsights,
  computeSleepDebt,
  detectChronotype,
  getDailyTip,
} from '@/utils/insightEngine';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { s, fs, vs } from '@/utils/responsive';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function yesterdayStr(): string {
  return new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
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
  const theme    = useTheme();
  const [h, m]   = value.split(':').map(Number);

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
          <TouchableOpacity style={[tp.btn, { backgroundColor: theme.backgroundElement }]} onPress={() => setH(h + 1)}>
            <ThemedText style={tp.arrow}>▲</ThemedText>
          </TouchableOpacity>
          <View style={[tp.display, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ThemedText style={[tp.digit, { color: theme.text }]}>{String(h).padStart(2, '0')}</ThemedText>
          </View>
          <TouchableOpacity style={[tp.btn, { backgroundColor: theme.backgroundElement }]} onPress={() => setH(h - 1)}>
            <ThemedText style={tp.arrow}>▼</ThemedText>
          </TouchableOpacity>
        </View>

        <ThemedText style={[tp.colon, { color: theme.text }]}>:</ThemedText>

        <View style={tp.col}>
          <TouchableOpacity style={[tp.btn, { backgroundColor: theme.backgroundElement }]} onPress={() => setM(m + 5)}>
            <ThemedText style={tp.arrow}>▲</ThemedText>
          </TouchableOpacity>
          <View style={[tp.display, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ThemedText style={[tp.digit, { color: theme.text }]}>{String(m).padStart(2, '0')}</ThemedText>
          </View>
          <TouchableOpacity style={[tp.btn, { backgroundColor: theme.backgroundElement }]} onPress={() => setM(m - 5)}>
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
  const theme          = useTheme();
  const entries        = useSleepStore(s => s.entries);
  const initSleep      = useSleepStore(s => s.initSleep);
  const addSleep       = useSleepStore(s => s.addSleep);
  const deleteSleep    = useSleepStore(s => s.deleteSleep);
  const sleepGoal      = useSleepStore(s => s.sleepGoal);
  const setSleepGoal   = useSleepStore(s => s.setSleepGoal);
  const avgDuration    = useSleepStore(s => s.getAverageDuration)();
  const glucoseHistory = useGlucoseStore(s => s.glucoseHistory);

  const [showGoalInfo,  setShowGoalInfo]  = useState(false);

  // ── Date sélectionnée ──────────────────────────────────────────────────────
  // La nuit en cours n'est pas encore terminée — on part d'hier
  const [selectedDate, setSelectedDate] = useState(yesterdayStr());

  const goToPrevDay = () => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };
  const goToNextDay = () => {
    if (selectedDate >= yesterdayStr()) return; // jamais au-delà d'hier
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
  const insights  = generateInsights(entries, glucoseHistory, sleepGoal);
  const debt      = entries.length > 0 ? computeSleepDebt(entries, sleepGoal) : null;
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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.screenBg }]}>
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
        </View>

        {/* ── Objectif de sommeil ── */}
        <View style={[styles.goalCard, { backgroundColor: theme.card }]}>
          <View style={styles.goalHeader}>
            <ThemedText style={styles.goalCardTitle}>OBJECTIF DE SOMMEIL</ThemedText>
            <TouchableOpacity onPress={() => setShowGoalInfo(v => !v)} style={styles.infoBtn}>
              <ThemedText style={styles.infoBtnText}>?</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.goalStepper}>
            <TouchableOpacity
              style={[styles.goalStepBtn, sleepGoal <= SLEEP_GOAL_MIN && styles.goalStepBtnDisabled]}
              onPress={() => setSleepGoal(sleepGoal - SLEEP_GOAL_STEP)}
              disabled={sleepGoal <= SLEEP_GOAL_MIN}
            >
              <ThemedText style={styles.goalStepArrow}>−</ThemedText>
            </TouchableOpacity>

            <View style={styles.goalValueBox}>
              <ThemedText style={styles.goalValueText}>{sleepGoal}h</ThemedText>
              <ThemedText style={styles.goalValueSub}>par nuit</ThemedText>
            </View>

            <TouchableOpacity
              style={[styles.goalStepBtn, sleepGoal >= SLEEP_GOAL_MAX && styles.goalStepBtnDisabled]}
              onPress={() => setSleepGoal(sleepGoal + SLEEP_GOAL_STEP)}
              disabled={sleepGoal >= SLEEP_GOAL_MAX}
            >
              <ThemedText style={styles.goalStepArrow}>+</ThemedText>
            </TouchableOpacity>
          </View>

          {showGoalInfo && (
            <View style={styles.goalInfoBox}>
              <ThemedText style={styles.goalInfoTitle}>Recommandation pour les diabétiques</ThemedText>
              <ThemedText style={styles.goalInfoText}>
                Les experts recommandent <ThemedText style={styles.goalInfoBold}>7 à 9 heures</ThemedText> de sommeil par nuit pour les personnes diabétiques.
              </ThemedText>
              <ThemedText style={styles.goalInfoText}>
                • En dessous de <ThemedText style={styles.goalInfoBold}>6h</ThemedText> : la résistance à l'insuline augmente significativement.
              </ThemedText>
              <ThemedText style={styles.goalInfoText}>
                • Entre <ThemedText style={styles.goalInfoBold}>7h et 8h</ThemedText> : fenêtre optimale pour la régulation glycémique.
              </ThemedText>
              <ThemedText style={styles.goalInfoText}>
                • Au-delà de <ThemedText style={styles.goalInfoBold}>9h</ThemedText> : un excès régulier peut aussi indiquer un déséquilibre métabolique.
              </ThemedText>
            </View>
          )}
        </View>

        {/* ── Conseil du jour ── */}
        <View style={[styles.tipCard, { borderLeftColor: dailyTip.color, backgroundColor: theme.card }]}>
          <ThemedText style={styles.tipTitle}>CONSEIL DU JOUR</ThemedText>
          <ThemedText style={styles.tipText}>{dailyTip.icon}  {dailyTip.text}</ThemedText>
        </View>

        {/* ── Formulaire ── */}
        <View style={[styles.formCard, { backgroundColor: theme.card }]}>
          <ThemedText style={styles.sectionTitle}>Enregistrer votre nuit</ThemedText>

          {/* Sélecteur de date */}
          <View style={[styles.dateNav, { backgroundColor: theme.backgroundElement }]}>
            <TouchableOpacity onPress={goToPrevDay} style={styles.dateNavBtn}>
              <ThemedText style={styles.dateNavArrow}>‹</ThemedText>
            </TouchableOpacity>
            <ThemedText style={styles.dateNavLabel}>
              {selectedDate === yesterdayStr() ? 'Hier' : formatDate(selectedDate)}
            </ThemedText>
            <TouchableOpacity
              onPress={goToNextDay}
              style={styles.dateNavBtn}
              disabled={selectedDate >= yesterdayStr()}
            >
              <ThemedText style={[styles.dateNavArrow, selectedDate >= yesterdayStr() && { color: '#ccc' }]}>›</ThemedText>
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
            style={[styles.notesInput, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
            placeholder="Notes (optionnel)..."
            placeholderTextColor={theme.muted}
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
          <StatBox label="OBJECTIF"     value={`${sleepGoal}h`} highlight />
        </View>

        {/* ── Analyse : insights + dette de sommeil ── */}
        {(insights.length > 0 || (debt && debt.debt7d >= 0.5)) && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Analyse</ThemedText>

            {debt && debt.debt7d >= 0.5 && (
              <View style={styles.debtCard}>
                {/* Titre */}
                <ThemedText style={styles.debtTitle}>💤 DETTE DE SOMMEIL</ThemedText>

                {/* Badges */}
                <View style={styles.debtBadges}>
                  <View style={styles.debtBadge7}>
                    <ThemedText style={styles.debtBadgeVal7}>{debt.debt7d}h</ThemedText>
                    <ThemedText style={styles.debtBadgeLbl}>sur 7 jours</ThemedText>
                  </View>
                  {debt.debt14d > 0 && (
                    <View style={styles.debtBadge14}>
                      <ThemedText style={styles.debtBadgeVal14}>{debt.debt14d}h</ThemedText>
                      <ThemedText style={styles.debtBadgeLbl}>sur 14 jours</ThemedText>
                    </View>
                  )}
                </View>

                {/* Explication */}
                <View style={styles.debtExplain}>
                  <ThemedText style={styles.debtExplainText}>
                    <ThemedText style={styles.debtExplainBold}>7 jours</ThemedText> : total des heures manquantes par rapport à votre objectif ({debt.personalGoal}h/nuit) sur les 7 derniers jours. Les nuits où vous avez dormi plus que l'objectif réduisent ce chiffre.
                  </ThemedText>
                  {debt.debt14d > 0 && (
                    <ThemedText style={[styles.debtExplainText, { marginTop: vs(6) }]}>
                      <ThemedText style={styles.debtExplainBold}>14 jours</ThemedText> : même calcul étendu aux 14 derniers jours.{' '}
                      {debt.debt14d === debt.debt7d
                        ? 'Identique aux 7 jours → la semaine précédente était équilibrée (pas de dette supplémentaire).'
                        : debt.debt14d > debt.debt7d
                          ? `Plus élevé que les 7 jours → la semaine précédente avait déjà ${Math.round((debt.debt14d - debt.debt7d) * 10) / 10}h de manque.`
                          : 'Plus bas que les 7 jours → la semaine précédente vous avez bien récupéré.'}
                    </ThemedText>
                  )}
                </View>

                {/* Plan de récupération */}
                {debt.recoveryNights > 0 && (
                  <View style={styles.debtRecoveryBox}>
                    <ThemedText style={styles.debtRecovery}>
                      Plan récupération : +{debt.recoveryExtra} min/soir pendant {debt.recoveryNights} nuit{debt.recoveryNights > 1 ? 's' : ''}
                    </ThemedText>
                  </View>
                )}
              </View>
            )}

            {insights.map(ins => (
              <View key={ins.id} style={[styles.insightCard, { borderLeftColor: ins.color, backgroundColor: theme.card }]}>
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
                <View key={entry.id} style={[styles.historyItem, { borderLeftColor: meta.color, backgroundColor: theme.card }]}>
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
  const theme = useTheme();
  return (
    <View style={[styles.statBox, { backgroundColor: theme.card }, highlight && styles.statBoxHighlight]}>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
      <ThemedText style={[styles.statValue, highlight && { color: '#1565C0' }]}>{value}</ThemedText>
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
  title:     { fontSize: fs(20), fontWeight: 'bold' },
  chronoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: s(4),
    backgroundColor: '#EDE7F6', borderRadius: 20,
    paddingVertical: vs(4), paddingHorizontal: s(10),
  },
  chronoEmoji: { fontSize: fs(14) },
  chronoLabel: { fontSize: fs(11), color: '#512DA8', fontWeight: '700' },

  // Objectif de sommeil
  goalCard: {
    marginHorizontal: s(20), marginBottom: vs(10),
    backgroundColor: '#fff', borderRadius: 16, padding: s(16),
    borderLeftWidth: 4, borderLeftColor: '#1565C0',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  goalHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: vs(12) },
  goalCardTitle: { fontSize: fs(10), color: '#999', fontWeight: '700', letterSpacing: 0.6 },
  goalStepper:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s(20) },
  goalStepBtn: {
    width: s(44), height: s(44), borderRadius: s(22),
    backgroundColor: '#E3F2FD', alignItems: 'center', justifyContent: 'center',
  },
  goalStepBtnDisabled: { backgroundColor: '#f0f0f0' },
  goalStepArrow: { fontSize: fs(22), fontWeight: 'bold', color: '#1565C0' },
  goalValueBox:  { alignItems: 'center', minWidth: s(80) },
  goalValueText: { fontSize: fs(36), fontWeight: 'bold', color: '#1565C0', lineHeight: vs(40) },
  goalValueSub:  { fontSize: fs(11), color: '#999', marginTop: vs(2) },
  goalInfoBox: {
    marginTop: vs(14), paddingTop: vs(12),
    borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  goalInfoTitle: { fontSize: fs(12), fontWeight: '800', color: '#1565C0', marginBottom: vs(8) },
  goalInfoText:  { fontSize: fs(11), lineHeight: vs(18), marginBottom: vs(4) },
  goalInfoBold:  { fontWeight: '700', color: '#1565C0' },

  // Conseil du jour
  tipCard: {
    marginHorizontal: s(20), marginBottom: vs(10),
    backgroundColor: '#fff', borderRadius: 14, padding: s(14), borderLeftWidth: 4,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  tipTitle: { fontSize: fs(9), color: '#aaa', fontWeight: '700', letterSpacing: 0.8, marginBottom: vs(6) },
  tipText:  { fontSize: fs(13), lineHeight: vs(20) },

  infoBtn:      { width: s(22), height: s(22), borderRadius: s(11), backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center' },
  infoBtnText:  { fontSize: fs(12), fontWeight: '900', color: '#fff' },

  // Dette de sommeil
  debtCard: {
    marginBottom: vs(8),
    backgroundColor: '#FFF3E0', borderRadius: 14, padding: s(14),
    borderLeftWidth: 4, borderLeftColor: '#F57C00',
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2,
  },
  debtTitle:   { fontSize: fs(11), fontWeight: '800', color: '#E65100', marginBottom: vs(12) },
  debtBadges:  { flexDirection: 'row', gap: s(10), marginBottom: vs(12) },
  debtBadge7: {
    flex: 1, alignItems: 'center', paddingVertical: vs(10),
    backgroundColor: '#FFF8F0', borderRadius: 12,
    borderWidth: 2, borderColor: '#F57C00',
  },
  debtBadge14: {
    flex: 1, alignItems: 'center', paddingVertical: vs(10),
    backgroundColor: '#FFF0F0', borderRadius: 12,
    borderWidth: 2, borderColor: '#B71C1C',
  },
  debtBadgeVal7:  { fontSize: fs(28), fontWeight: 'bold', color: '#F57C00', lineHeight: vs(32) },
  debtBadgeVal14: { fontSize: fs(28), fontWeight: 'bold', color: '#B71C1C', lineHeight: vs(32) },
  debtBadgeLbl:   { fontSize: fs(10), color: '#888', fontWeight: '700', marginTop: vs(2) },
  debtExplain:     { backgroundColor: '#FFF8EC', borderRadius: 8, padding: s(10), marginBottom: vs(10) },
  debtExplainText: { fontSize: fs(11), color: '#5D4037', lineHeight: vs(17) },
  debtExplainBold: { fontWeight: '800', color: '#E65100' },
  debtRecoveryBox: { backgroundColor: '#FFE0B2', borderRadius: 8, padding: s(10) },
  debtRecovery:    { fontSize: fs(12), color: '#4E342E', fontWeight: '600' },

  // Formulaire
  formCard: {
    marginHorizontal: s(20), marginBottom: vs(10),
    backgroundColor: '#fff', borderRadius: 16, padding: s(18),
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  sectionTitle: { fontSize: fs(13), fontWeight: '700', letterSpacing: 0.3, marginBottom: vs(14) },

  dateNav:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: vs(16), backgroundColor: '#f5f5f5', borderRadius: 12, paddingVertical: vs(8) },
  dateNavBtn:   { paddingHorizontal: s(16), paddingVertical: vs(4) },
  dateNavArrow: { fontSize: fs(22), color: '#388E3C', fontWeight: 'bold' },
  dateNavLabel: { fontSize: fs(13), fontWeight: '700', textTransform: 'capitalize', flex: 1, textAlign: 'center' },

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
  insightMsg:   { fontSize: fs(12), lineHeight: vs(18) },

  // Historique
  historyItem: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#fff', borderRadius: 12, padding: s(12),
    borderLeftWidth: 4, marginBottom: vs(8),
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2,
  },
  historyTop:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: vs(4) },
  historyDate:     { fontSize: fs(12), fontWeight: '700', flex: 1 },
  historyDuration: { fontSize: fs(12), marginBottom: vs(2) },
  historyWake:     { fontSize: fs(11), color: '#888', marginBottom: vs(2) },
  historyNote:     { fontSize: fs(11), color: '#999', fontStyle: 'italic', marginTop: vs(2) },
  qualityTag:      { borderRadius: 8, paddingVertical: vs(2), paddingHorizontal: s(8) },
  qualityTagText:  { fontSize: fs(10), fontWeight: '700' },
  deleteBtn:       { padding: s(8) },
  deleteBtnText:   { fontSize: fs(16), color: '#ccc' },
});
