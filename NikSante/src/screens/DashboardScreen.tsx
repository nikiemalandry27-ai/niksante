/**
 * NikSanté — DashboardScreen (Step 5)
 *
 * Nouveautés :
 *  - Carte Time In Range (TIR) avec barre colorée
 *  - Pattern insight IA (tendances récurrentes)
 */

import { useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useGlucoseStore, MEAL_CONTEXT_META, MealContext } from '@/store/glucoseStore';
import { useAuthStore } from '@/store/authStore';
import { useSleepStore, SLEEP_QUALITY_META } from '@/store/sleepStore';
import { computeHealthScore } from '@/utils/insightEngine';
import {
  getGlucoseStatus,
  getAIMessage,
  getStatusColor,
  formatDate,
  formatGlucose,
  unitLabel,
} from '@/utils/glucoseHelper';
import { useSettingsStore } from '@/store/settingsStore';
import {
  getTimeInRange,
  getPatternInsight,
  getConsistencyScore,
} from '@/utils/glucoseAnalysis';
import GlucoseChart from '@/components/glucose-chart';
import { ThemedText } from '@/components/themed-text';
import { s, fs, vs } from '@/utils/responsive';

// ---------------------------------------------------------------------------
// Helpers tendance
// ---------------------------------------------------------------------------

type Trend = 'up' | 'down' | 'stable';

function getTrend(current: number, previous: number): Trend {
  const delta = current - previous;
  if (delta >  5) return 'up';
  if (delta < -5) return 'down';
  return 'stable';
}

const TREND_META: Record<Trend, { icon: string; color: string; label: string }> = {
  up:     { icon: '↑', color: '#F57C00', label: 'En hausse' },
  down:   { icon: '↓', color: '#1565C0', label: 'En baisse' },
  stable: { icon: '→', color: '#388E3C', label: 'Stable'   },
};

const STATUS_LABELS: Record<string, string> = {
  hypo_critical:  'HYPOGLYCÉMIE CRITIQUE',
  hypo:           'GLYCÉMIE BASSE',
  normal:         'NORMAL',
  hyper:          'GLYCÉMIE ÉLEVÉE',
  hyper_critical: 'HYPERGLYCÉMIE CRITIQUE',
};

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export default function DashboardScreen() {
  const router = useRouter();

  // ── Stores ──
  const user             = useAuthStore((state) => state.user);
  const logout           = useAuthStore((state) => state.logout);
  const latestGlucose    = useGlucoseStore((state) => state.latestGlucose);
  const glucoseHistory   = useGlucoseStore((state) => state.glucoseHistory);
  const clearHistory     = useGlucoseStore((state) => state.clearHistory);
  const resetLocalState  = useGlucoseStore((state) => state.resetLocalState);
  const initGlucose      = useGlucoseStore((state) => state.initGlucose);
  const averageGlucose   = useGlucoseStore((state) => state.getAverageGlucose)();
  const isLoadingHistory = useGlucoseStore((state) => state.isLoadingHistory);

  const [loggingOut, setLoggingOut] = useState(false);
  const glucoseUnit = useSettingsStore((s) => s.glucoseUnit);

  const sleepEntries = useSleepStore(s => s.entries);
  const todaySleep   = sleepEntries.find(e => e.date === new Date().toISOString().split('T')[0]) ?? null;
  const healthScore  = computeHealthScore(sleepEntries, glucoseHistory);

  const hasSleepData   = sleepEntries.length > 0;
  const hasGlucoseData = glucoseHistory.length > 0;
  const scoreHint = hasSleepData && hasGlucoseData
    ? 'Score = sommeil + glycémie'
    : hasSleepData
    ? 'Score = sommeil uniquement'
    : 'Score = glycémie uniquement';

  useEffect(() => { initGlucose(); }, []);

  // ── IA + statut ──
  const status      = latestGlucose ? getGlucoseStatus(latestGlucose.value) : 'normal';
  const aiMessage   = getAIMessage(status);
  const statusColor = getStatusColor(status);

  // ── Tendance ──
  const trend = glucoseHistory.length >= 2
    ? getTrend(glucoseHistory[0].value, glucoseHistory[1].value)
    : null;

  const todayCount = glucoseHistory.filter((e) =>
    new Date(e.date).toDateString() === new Date().toDateString()
  ).length;

  // ── Analyse avancée (Step 5) ──
  const tir            = getTimeInRange(glucoseHistory);
  const patternInsight = getPatternInsight(glucoseHistory);
  const score          = getConsistencyScore(glucoseHistory);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleAddGlucose = () => router.navigate('/(tabs)/add-glucose');
  const handleEmergency  = () => router.push('/emergency');
  const handleSeeAll     = () => router.push('/history');
  const handleSleep      = () => router.navigate('/(tabs)/sleep' as any);

  const handleLogout = () => {
    Alert.alert(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnecter', style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            try {
              await resetLocalState();
              await logout();
              router.replace('/login');
            } catch {
              Alert.alert('Erreur', 'Impossible de se déconnecter.');
              setLoggingOut(false);
            }
          },
        },
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
          <View>
            <ThemedText style={styles.greeting}>
              Bonjour, {user?.name ?? 'Utilisateur'} 👋
            </ThemedText>
            <ThemedText style={styles.date}>
              {new Date().toLocaleDateString('fr-FR', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </ThemedText>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} disabled={loggingOut}>
            {loggingOut
              ? <ActivityIndicator color="#388E3C" size="small" />
              : <ThemedText style={styles.logoutText}>Déconnexion</ThemedText>
            }
          </TouchableOpacity>
        </View>

        {/* ── Carte glycémie ── */}
        <View style={[styles.glucoseCard, { borderLeftColor: statusColor }]}>
          <ThemedText style={styles.cardLabel}>GLYCÉMIE ACTUELLE</ThemedText>

          {isLoadingHistory ? (
            <ActivityIndicator color={statusColor} style={{ marginVertical: 16 }} />
          ) : latestGlucose ? (
            <>
              {/* Valeur + tendance + badge statut */}
              <View style={styles.glucoseValueRow}>
                <ThemedText style={[styles.glucoseValue, { color: statusColor }]}>
                  {formatGlucose(latestGlucose.value, glucoseUnit)}
                </ThemedText>

                {/* Indicateur tendance */}
                {trend && (
                  <View style={[styles.trendBadge, { backgroundColor: TREND_META[trend].color + '18' }]}>
                    <ThemedText style={[styles.trendIcon, { color: TREND_META[trend].color }]}>
                      {TREND_META[trend].icon}
                    </ThemedText>
                    <ThemedText style={[styles.trendLabel, { color: TREND_META[trend].color }]}>
                      {TREND_META[trend].label}
                    </ThemedText>
                  </View>
                )}

                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <ThemedText style={styles.unitText}>{unitLabel(glucoseUnit)}</ThemedText>
                  <View style={[styles.statusBadge, {
                    backgroundColor: statusColor + '20',
                    borderColor:     statusColor,
                  }]}>
                    <ThemedText style={[styles.statusBadgeText, { color: statusColor }]}>
                      {STATUS_LABELS[status]}
                    </ThemedText>
                  </View>
                </View>
              </View>

              <ThemedText style={styles.timestamp}>
                Mesurée le {formatDate(latestGlucose.date)}
              </ThemedText>

              {/* Contexte repas */}
              {latestGlucose.mealContext && (
                <View style={styles.mealCtxBadge}>
                  <ThemedText style={styles.mealCtxText}>
                    {MEAL_CONTEXT_META[latestGlucose.mealContext as NonNullable<MealContext>].icon}{' '}
                    {MEAL_CONTEXT_META[latestGlucose.mealContext as NonNullable<MealContext>].label}
                  </ThemedText>
                </View>
              )}

              {latestGlucose.note ? (
                <ThemedText style={styles.noteText}>📝 {latestGlucose.note}</ThemedText>
              ) : null}
            </>
          ) : (
            <ThemedText style={styles.noDataText}>
              Aucune mesure enregistrée.{'\n'}Appuyez sur « + Ajouter » pour commencer.
            </ThemedText>
          )}
        </View>

        {/* ── Message IA ── (seulement si une mesure existe) */}
        {latestGlucose && (
          <View style={[styles.aiCard, { borderLeftColor: statusColor }]}>
            <ThemedText style={[styles.aiTitle, { color: statusColor }]}>{aiMessage.title}</ThemedText>
            <ThemedText style={styles.aiBody}>{aiMessage.message}</ThemedText>
            {aiMessage.suggestion ? (
              <ThemedText style={styles.aiSuggestion}>💡 {aiMessage.suggestion}</ThemedText>
            ) : null}
            {aiMessage.action ? (
              <ThemedText style={styles.aiAction}>🚨 {aiMessage.action}</ThemedText>
            ) : null}
          </View>
        )}

        {/* ── Carte sommeil ── */}
        <TouchableOpacity style={styles.sleepCard} onPress={handleSleep} activeOpacity={0.8}>
          <View style={styles.sleepCardLeft}>
            <ThemedText style={styles.sleepCardLabel}>TEMPS DE SOMMEIL</ThemedText>
            {todaySleep ? (
              <>
                <ThemedText style={styles.sleepCardValue}>
                  {SLEEP_QUALITY_META[todaySleep.quality].emoji}{' '}
                  {todaySleep.duration % 1 === 0
                    ? `${todaySleep.duration}h`
                    : `${Math.floor(todaySleep.duration)}h${Math.round((todaySleep.duration % 1) * 60)}min`}
                </ThemedText>
                <ThemedText style={styles.sleepCardSub}>
                  {'Nuit du '}
                  {new Date(todaySleep.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </ThemedText>
                <ThemedText style={styles.sleepCardSub}>
                  {todaySleep.bedTime} → {todaySleep.wakeTime}
                </ThemedText>
              </>
            ) : (
              <ThemedText style={styles.sleepCardEmpty}>Non enregistré · Appuyez pour ajouter</ThemedText>
            )}
            {healthScore && hasSleepData && (
              <ThemedText style={styles.sleepScoreHint}>{scoreHint} · 7 derniers jours</ThemedText>
            )}
          </View>
          {healthScore && hasSleepData && (
            <View style={[styles.sleepScoreBadge, { borderColor: healthScore.color, backgroundColor: healthScore.color + '18' }]}>
              <ThemedText style={[styles.sleepScoreNum, { color: healthScore.color }]}>{healthScore.total}<ThemedText style={[styles.sleepScoreOver, { color: healthScore.color }]}>/100</ThemedText></ThemedText>
              <ThemedText style={[styles.sleepScoreTag, { color: healthScore.color }]}>{healthScore.label}</ThemedText>
            </View>
          )}
        </TouchableOpacity>

        {/* ── Statistiques ── */}
        <View style={styles.statsRow}>
          <StatBox label="MOYENNE"      value={averageGlucose > 0 ? formatGlucose(averageGlucose, glucoseUnit) : '—'} unit={unitLabel(glucoseUnit)} />
          <StatBox label="MESURES"      value={`${glucoseHistory.length}`} unit="total" />
          <StatBox label="AUJOURD'HUI"  value={`${todayCount}`} unit="mesure(s)" />
        </View>

        {/* ── Time In Range ── */}
        {glucoseHistory.length > 0 && (
          <View style={styles.tirCard}>
            <View style={styles.tirHeader}>
              <ThemedText style={styles.tirTitle}>TEMPS DANS LA CIBLE (TIR)</ThemedText>
              <View style={[styles.scoreBadge, { backgroundColor: score.color + '20', borderColor: score.color }]}>
                <ThemedText style={[styles.scoreBadgeText, { color: score.color }]}>
                  {score.label}
                </ThemedText>
              </View>
            </View>

            {/* Barre segmentée colorée */}
            <View style={styles.tirBarContainer}>
              {tir.below > 0 && (
                <View style={[styles.tirSegment, { flex: tir.below, backgroundColor: '#1565C0' }]} />
              )}
              {tir.inRange > 0 && (
                <View style={[styles.tirSegment, { flex: tir.inRange, backgroundColor: '#388E3C' }]} />
              )}
              {tir.above > 0 && (
                <View style={[styles.tirSegment, { flex: tir.above, backgroundColor: '#F57C00' }]} />
              )}
            </View>

            {/* Légende */}
            <View style={styles.tirLegend}>
              <TIRLegendItem color="#1565C0" label="Trop bas"  pct={tir.below}   />
              <TIRLegendItem color="#388E3C" label="Cible"     pct={tir.inRange} />
              <TIRLegendItem color="#F57C00" label="Trop haut" pct={tir.above}   />
            </View>
          </View>
        )}

        {/* ── Pattern Insight IA ── */}
        {patternInsight && (
          <View style={[styles.patternCard, { borderLeftColor: patternInsight.color }]}>
            <ThemedText style={[styles.patternTitle, { color: patternInsight.color }]}>
              {patternInsight.icon} {patternInsight.title}
            </ThemedText>
            <ThemedText style={styles.patternMsg}>{patternInsight.message}</ThemedText>
            {patternInsight.suggestion ? (
              <ThemedText style={styles.patternSuggestion}>
                💡 {patternInsight.suggestion}
              </ThemedText>
            ) : null}
          </View>
        )}

        {/* ── Courbe d'évolution ── */}
        <GlucoseChart data={glucoseHistory} maxBars={12} unit={glucoseUnit} />

        {/* ── Historique récent ── */}
        {glucoseHistory.length > 0 && (
          <View style={styles.historySection}>
            <View style={styles.sectionHeaderRow}>
              <ThemedText style={styles.sectionTitle}>Historique récent</ThemedText>
              <TouchableOpacity onPress={handleSeeAll} style={styles.seeAllBtn}>
                <ThemedText style={styles.seeAllText}>Voir tout →</ThemedText>
              </TouchableOpacity>
            </View>

            {glucoseHistory.slice(0, 5).map((entry) => {
              const s     = getGlucoseStatus(entry.value);
              const color = getStatusColor(s);
              const ctx   = entry.mealContext as NonNullable<MealContext> | null;
              return (
                <View key={entry.id} style={[styles.historyItem, { borderLeftColor: color }]}>
                  <View style={styles.historyLeft}>
                    <View style={styles.historyTopRow}>
                      <ThemedText style={[styles.historyValue, { color }]}>
                        {formatGlucose(entry.value, glucoseUnit)} {unitLabel(glucoseUnit)}
                      </ThemedText>
                      {ctx && (
                        <View style={styles.ctxBadge}>
                          <ThemedText style={styles.ctxText}>
                            {MEAL_CONTEXT_META[ctx].icon} {MEAL_CONTEXT_META[ctx].label}
                          </ThemedText>
                        </View>
                      )}
                    </View>
                    <ThemedText style={styles.historyTime}>{formatDate(entry.date)}</ThemedText>
                    {entry.note ? (
                      <ThemedText style={styles.historyNote}>{entry.note}</ThemedText>
                    ) : null}
                  </View>
                  <ThemedText style={[styles.historyStatus, { color }]}>
                    {STATUS_LABELS[s]}
                  </ThemedText>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Barre d'action ── */}
      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.emergencyBtn} onPress={handleEmergency}>
          <ThemedText style={styles.emergencyBtnText}>🆘 Hypo/{'\n'}Hyperglycémie</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addBtn} onPress={handleAddGlucose}>
          <ThemedText style={styles.addBtnText}>+ Ajouter</ThemedText>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// StatBox
// ---------------------------------------------------------------------------

function StatBox({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.statBox}>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
      <ThemedText style={styles.statValue}>{value}</ThemedText>
      <ThemedText style={styles.statUnit}>{unit}</ThemedText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// TIRLegendItem
// ---------------------------------------------------------------------------

function TIRLegendItem({ color, label, pct }: { color: string; label: string; pct: number }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: s(10), height: s(10), borderRadius: 5, backgroundColor: color, marginBottom: vs(4) }} />
      <ThemedText style={{ fontSize: fs(10), color: '#888', fontWeight: '600' }}>{label}</ThemedText>
      <ThemedText style={{ fontSize: fs(12), color, fontWeight: 'bold' }}>{pct}%</ThemedText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: s(20), paddingTop: vs(20), paddingBottom: vs(12),
  },
  greeting: { fontSize: fs(20), fontWeight: 'bold', color: '#1a1a1a' },
  date: { fontSize: fs(12), color: '#999', marginTop: vs(4), textTransform: 'capitalize' },
  logoutBtn: {
    paddingVertical: vs(8), paddingHorizontal: s(12),
    borderRadius: 8, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff',
  },
  logoutText: { fontSize: fs(12), color: '#388E3C', fontWeight: '600' },

  // Carte glycémie
  glucoseCard: {
    marginHorizontal: s(20), marginVertical: vs(12),
    backgroundColor: '#fff', borderRadius: 16, padding: s(18), borderLeftWidth: 5,
    elevation: 3, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  cardLabel: { fontSize: fs(11), color: '#999', fontWeight: '700', letterSpacing: 0.8, marginBottom: vs(10) },
  glucoseValueRow: { flexDirection: 'row', alignItems: 'center', marginBottom: vs(8), gap: s(10) },
  glucoseValue: { fontSize: fs(52), fontWeight: 'bold', lineHeight: vs(56) },

  // Tendance
  trendBadge: {
    flexDirection: 'row', alignItems: 'center', gap: s(4),
    borderRadius: 10, paddingVertical: vs(5), paddingHorizontal: s(10),
  },
  trendIcon:  { fontSize: fs(18), fontWeight: 'bold' },
  trendLabel: { fontSize: fs(11), fontWeight: '700' },

  unitText: { fontSize: fs(15), color: '#999', marginBottom: vs(4) },
  statusBadge: {
    borderRadius: 6, paddingVertical: vs(3), paddingHorizontal: s(7), borderWidth: 1,
  },
  statusBadgeText: { fontSize: fs(9), fontWeight: '700', letterSpacing: 0.3 },
  timestamp: { fontSize: fs(12), color: '#aaa' },

  // Contexte repas
  mealCtxBadge: {
    marginTop: vs(8), alignSelf: 'flex-start',
    backgroundColor: '#f0f0f0', borderRadius: 10,
    paddingVertical: vs(4), paddingHorizontal: s(10),
  },
  mealCtxText: { fontSize: fs(12), color: '#555', fontWeight: '600' },
  noteText: { fontSize: fs(12), color: '#888', marginTop: vs(6), fontStyle: 'italic' },
  noDataText: { fontSize: fs(14), color: '#bbb', lineHeight: vs(22), marginTop: vs(8) },

  // IA
  aiCard: {
    marginHorizontal: s(20), marginBottom: vs(12),
    backgroundColor: '#FFFDE7', borderRadius: 16, padding: s(16), borderLeftWidth: 5,
    elevation: 2, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  aiTitle:      { fontSize: fs(14), fontWeight: 'bold', marginBottom: vs(8) },
  aiBody:       { fontSize: fs(13), color: '#444', lineHeight: vs(19) },
  aiSuggestion: { fontSize: fs(12), color: '#555', marginTop: vs(8), lineHeight: vs(18) },
  aiAction:     { fontSize: fs(12), color: '#B71C1C', marginTop: vs(8), fontWeight: '700' },

  // Sommeil
  sleepCard: {
    marginHorizontal: s(20), marginBottom: vs(12),
    backgroundColor: '#EDE7F6', borderRadius: 16, padding: s(16),
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  sleepCardLeft:  { flex: 1 },
  sleepCardLabel: { fontSize: fs(10), color: '#7B1FA2', fontWeight: '700', letterSpacing: 0.6, marginBottom: vs(4) },
  sleepCardValue: { fontSize: fs(22), fontWeight: 'bold', color: '#4A148C' },
  sleepCardSub:   { fontSize: fs(11), color: '#888', marginTop: vs(2) },
  sleepCardEmpty: { fontSize: fs(13), color: '#aaa', fontStyle: 'italic' },
  sleepScoreHint: { fontSize: fs(10), color: '#9C6EBB', marginTop: vs(6), fontStyle: 'italic' },
  sleepScoreBadge: {
    minWidth: s(72), paddingHorizontal: s(10), paddingVertical: vs(6),
    borderRadius: s(12), borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginLeft: s(12),
  },
  sleepScoreNum:  { fontSize: fs(18), fontWeight: 'bold', lineHeight: vs(22) },
  sleepScoreOver: { fontSize: fs(11), fontWeight: '600' },
  sleepScoreTag:  { fontSize: fs(10), fontWeight: '700', marginTop: vs(1) },

  // Stats
  statsRow: { flexDirection: 'row', marginHorizontal: s(20), marginBottom: vs(12), gap: s(10) },
  statBox: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: s(14), alignItems: 'center',
    elevation: 2, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  statLabel: { fontSize: fs(9), color: '#aaa', fontWeight: '700', letterSpacing: 0.4, marginBottom: vs(6), textAlign: 'center' },
  statValue: { fontSize: fs(22), fontWeight: 'bold', color: '#388E3C' },
  statUnit:  { fontSize: fs(10), color: '#bbb', marginTop: vs(2), textAlign: 'center' },

  // Historique
  historySection: { marginHorizontal: s(20), marginBottom: vs(12) },
  sectionHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: vs(10),
  },
  sectionTitle: { fontSize: fs(13), fontWeight: 'bold', color: '#555', letterSpacing: 0.3 },
  seeAllBtn:    { paddingVertical: vs(4), paddingHorizontal: s(8) },
  seeAllText:   { fontSize: fs(12), color: '#388E3C', fontWeight: '700' },

  historyItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10, padding: s(12), marginBottom: vs(8), borderLeftWidth: 4,
    elevation: 1, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2,
  },
  historyLeft: { flex: 1 },
  historyTopRow: { flexDirection: 'row', alignItems: 'center', gap: s(8), marginBottom: vs(2) },
  historyValue:  { fontSize: fs(14), fontWeight: '700', color: '#222' },
  ctxBadge: {
    backgroundColor: '#f0f0f0', borderRadius: 8,
    paddingVertical: vs(2), paddingHorizontal: s(7),
  },
  ctxText:       { fontSize: fs(10), color: '#666', fontWeight: '600' },
  historyTime:   { fontSize: fs(11), color: '#bbb', marginBottom: vs(2) },
  historyNote:   { fontSize: fs(11), color: '#999', fontStyle: 'italic' },
  historyStatus: { fontSize: fs(8), fontWeight: 'bold', letterSpacing: 0.3, textAlign: 'right', maxWidth: s(90) },

  // Action bar
  actionBar: {
    flexDirection: 'row', paddingHorizontal: s(20),
    paddingVertical: vs(14), paddingBottom: vs(24), gap: s(12),
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee',
  },
  emergencyBtn: {
    flex: 1, backgroundColor: '#B71C1C', borderRadius: 12,
    paddingVertical: vs(15), alignItems: 'center',
  },
  emergencyBtnText: { color: '#fff', fontWeight: 'bold', fontSize: fs(12), textAlign: 'center', lineHeight: vs(16) },
  addBtn: {
    flex: 1, backgroundColor: '#388E3C', borderRadius: 12,
    paddingVertical: vs(15), alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: fs(15) },

  // Time In Range
  tirCard: {
    marginHorizontal: s(20), marginBottom: vs(12),
    backgroundColor: '#fff', borderRadius: 16, padding: s(16),
    elevation: 2, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  tirHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: vs(12),
  },
  tirTitle: { fontSize: fs(11), color: '#999', fontWeight: '700', letterSpacing: 0.8 },
  scoreBadge: {
    borderRadius: 20, borderWidth: 1,
    paddingVertical: vs(4), paddingHorizontal: s(10),
  },
  scoreBadgeText: { fontSize: fs(12), fontWeight: '700' },
  tirBarContainer: {
    flexDirection: 'row', height: vs(14), borderRadius: 7,
    overflow: 'hidden', marginBottom: vs(12),
  },
  tirSegment: { height: vs(14) },
  tirLegend: { flexDirection: 'row', justifyContent: 'space-around' },

  // Pattern Insight
  patternCard: {
    marginHorizontal: s(20), marginBottom: vs(12),
    backgroundColor: '#F3E5F5', borderRadius: 16,
    padding: s(16), borderLeftWidth: 5,
    elevation: 2, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  patternTitle:      { fontSize: fs(14), fontWeight: 'bold', marginBottom: vs(8) },
  patternMsg:        { fontSize: fs(13), color: '#444', lineHeight: vs(19) },
  patternSuggestion: { fontSize: fs(12), color: '#555', marginTop: vs(8), lineHeight: vs(16) },
});
