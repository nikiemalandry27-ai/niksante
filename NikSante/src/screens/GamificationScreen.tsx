/**
 * NikSanté — GamificationScreen
 *
 * Système de récompenses calculé en temps réel depuis l'historique de glycémie :
 *  - Points : +10 par mesure, bonus selon TIR
 *  - Niveaux : Débutant → Régulier → Confirmé → Expert → Champion
 *  - Badges : débloqués selon les critères atteints
 */

import { useMemo } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useGlucoseStore, GlucoseEntry } from '@/store/glucoseStore';
import { getTimeInRange } from '@/utils/glucoseAnalysis';
import { GLUCOSE_THRESHOLDS } from '@/utils/constants';
import { ThemedText } from '@/components/themed-text';
import { s, fs, vs } from '@/utils/responsive';

// ---------------------------------------------------------------------------
// Niveaux
// ---------------------------------------------------------------------------

const LEVELS = [
  { name: 'Débutant',  min: 0,    icon: '🌱', color: '#81C784' },
  { name: 'Régulier',  min: 150,  icon: '⭐', color: '#FFD54F' },
  { name: 'Confirmé',  min: 500,  icon: '🌟', color: '#FF8A65' },
  { name: 'Expert',    min: 1000, icon: '💫', color: '#7986CB' },
  { name: 'Champion',  min: 2000, icon: '🏆', color: '#FFD700' },
];

function getLevel(pts: number) {
  return [...LEVELS].reverse().find((l) => pts >= l.min) ?? LEVELS[0];
}

function getNextLevel(pts: number) {
  return LEVELS.find((l) => l.min > pts) ?? null;
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

interface BadgeDef {
  id:     string;
  icon:   string;
  name:   string;
  desc:   string;
  points: number;
  check:  (h: GlucoseEntry[]) => boolean;
}

function hasConsecutiveDays(history: GlucoseEntry[], days: number): boolean {
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const target = new Date(today);
    target.setDate(today.getDate() - i);
    const found = history.some(
      (e) => new Date(e.date).toDateString() === target.toDateString()
    );
    if (!found) return false;
  }
  return true;
}

const BADGE_DEFS: BadgeDef[] = [
  {
    id: 'first',
    icon: '🌱', name: 'Première mesure',
    desc: 'Enregistrez votre 1ère glycémie',
    points: 50,
    check: (h) => h.length >= 1,
  },
  {
    id: 'ten',
    icon: '📊', name: 'Assidu',
    desc: '10 mesures enregistrées',
    points: 100,
    check: (h) => h.length >= 10,
  },
  {
    id: 'thirty',
    icon: '💪', name: 'Hypervigilant',
    desc: '30 mesures enregistrées',
    points: 200,
    check: (h) => h.length >= 30,
  },
  {
    id: 'hundred',
    icon: '💎', name: 'Expert diabète',
    desc: '100 mesures enregistrées',
    points: 500,
    check: (h) => h.length >= 100,
  },
  {
    id: 'tir70',
    icon: '🎯', name: 'Dans la cible',
    desc: 'TIR ≥ 70% sur toutes les mesures',
    points: 300,
    check: (h) => h.length >= 5 && getTimeInRange(h).inRange >= 70,
  },
  {
    id: 'week',
    icon: '🔥', name: '7 jours actifs',
    desc: 'Au moins 1 mesure par jour × 7 jours consécutifs',
    points: 250,
    check: (h) => hasConsecutiveDays(h, 7),
  },
  {
    id: 'stable5',
    icon: '🏅', name: 'Stabilité parfaite',
    desc: '5 dernières mesures toutes dans la cible',
    points: 200,
    check: (h) =>
      h.length >= 5 &&
      h.slice(0, 5).every(
        (e) => e.value >= GLUCOSE_THRESHOLDS.NORMAL_MIN && e.value <= GLUCOSE_THRESHOLDS.NORMAL_MAX
      ),
  },
  {
    id: 'note',
    icon: '📝', name: 'Journaliste',
    desc: '5 mesures avec une note',
    points: 100,
    check: (h) => h.filter((e) => e.note).length >= 5,
  },
  {
    id: 'meal',
    icon: '🍽️', name: 'Contexte repas',
    desc: '10 mesures avec un contexte de repas',
    points: 150,
    check: (h) => h.filter((e) => e.mealContext).length >= 10,
  },
];

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export default function GamificationScreen() {
  const router         = useRouter();
  const glucoseHistory = useGlucoseStore((s) => s.glucoseHistory);

  const { earned, locked, totalPoints } = useMemo(() => {
    const earnedList  = BADGE_DEFS.filter((b) => b.check(glucoseHistory));
    const lockedList  = BADGE_DEFS.filter((b) => !b.check(glucoseHistory));
    const badgePts    = earnedList.reduce((s, b) => s + b.points, 0);
    const readingPts  = glucoseHistory.length * 10;
    return { earned: earnedList, locked: lockedList, totalPoints: badgePts + readingPts };
  }, [glucoseHistory]);

  const level     = getLevel(totalPoints);
  const nextLevel = getNextLevel(totalPoints);
  const progress  = nextLevel
    ? Math.min((totalPoints - level.min) / (nextLevel.min - level.min), 1)
    : 1;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ThemedText style={styles.backText}>← Retour</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.title}>Récompenses</ThemedText>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Carte niveau */}
        <View style={[styles.levelCard, { borderTopColor: level.color }]}>
          <ThemedText style={styles.levelEmoji}>{level.icon}</ThemedText>
          <ThemedText style={[styles.levelName, { color: level.color }]}>{level.name}</ThemedText>
          <ThemedText style={styles.levelPts}>{totalPoints} pts</ThemedText>

          {/* Barre de progression */}
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` as any, backgroundColor: level.color }]} />
          </View>
          <ThemedText style={styles.progressLabel}>
            {nextLevel
              ? `${nextLevel.min - totalPoints} pts avant ${nextLevel.icon} ${nextLevel.name}`
              : '🏆 Niveau maximum atteint !'}
          </ThemedText>
        </View>

        {/* Stats rapides */}
        <View style={styles.statsRow}>
          <StatPill label="Mesures" value={String(glucoseHistory.length)} />
          <StatPill label="Badges"  value={`${earned.length}/${BADGE_DEFS.length}`} />
          <StatPill label="Points"  value={String(totalPoints)} />
        </View>

        {/* Badges débloqués */}
        {earned.length > 0 && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>BADGES OBTENUS ({earned.length})</ThemedText>
            <View style={styles.badgeGrid}>
              {earned.map((b) => (
                <View key={b.id} style={[styles.badgeCard, styles.badgeCardEarned]}>
                  <ThemedText style={styles.badgeIcon}>{b.icon}</ThemedText>
                  <ThemedText style={styles.badgeName}>{b.name}</ThemedText>
                  <ThemedText style={styles.badgeDesc}>{b.desc}</ThemedText>
                  <ThemedText style={styles.badgePts}>+{b.points} pts</ThemedText>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Badges verrouillés */}
        {locked.length > 0 && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>À DÉBLOQUER ({locked.length})</ThemedText>
            <View style={styles.badgeGrid}>
              {locked.map((b) => (
                <View key={b.id} style={[styles.badgeCard, styles.badgeCardLocked]}>
                  <ThemedText style={[styles.badgeIcon, { opacity: 0.3 }]}>{b.icon}</ThemedText>
                  <ThemedText style={[styles.badgeName, { color: '#bbb' }]}>{b.name}</ThemedText>
                  <ThemedText style={[styles.badgeDesc, { color: '#ccc' }]}>{b.desc}</ThemedText>
                  <ThemedText style={[styles.badgePts, { color: '#ccc' }]}>+{b.points} pts</ThemedText>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Sous-composants
// ---------------------------------------------------------------------------

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statPill}>
      <ThemedText style={styles.statPillValue}>{value}</ThemedText>
      <ThemedText style={styles.statPillLabel}>{label}</ThemedText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: s(20), paddingTop: vs(16), paddingBottom: vs(12),
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backBtn:  { padding: 4 },
  backText: { color: '#388E3C', fontWeight: '600', fontSize: fs(15) },
  title:    { fontSize: fs(18), fontWeight: 'bold', color: '#1a1a1a' },

  // Level card
  levelCard: {
    margin: s(16), backgroundColor: '#fff', borderRadius: 16,
    padding: s(20), alignItems: 'center', borderTopWidth: 4,
    elevation: 3, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  levelEmoji:    { fontSize: fs(52), marginBottom: vs(8) },
  levelName:     { fontSize: fs(22), fontWeight: 'bold', marginBottom: vs(4) },
  levelPts:      { fontSize: fs(16), color: '#888', marginBottom: vs(16) },
  progressBar: {
    alignSelf: 'stretch', height: vs(10), backgroundColor: '#f0f0f0',
    borderRadius: 5, overflow: 'hidden', marginBottom: vs(8),
  },
  progressFill:  { height: vs(10), borderRadius: 5 },
  progressLabel: { fontSize: fs(12), color: '#aaa', textAlign: 'center' },

  // Stats
  statsRow: {
    flexDirection: 'row', marginHorizontal: s(16), marginBottom: vs(16), gap: s(10),
  },
  statPill: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12,
    padding: s(12), alignItems: 'center',
    elevation: 1, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2,
  },
  statPillValue: { fontSize: fs(20), fontWeight: 'bold', color: '#388E3C' },
  statPillLabel: { fontSize: fs(10), color: '#aaa', fontWeight: '700', marginTop: vs(2) },

  // Section
  section:      { marginHorizontal: s(16), marginBottom: vs(16) },
  sectionTitle: { fontSize: fs(10), color: '#aaa', fontWeight: '700', letterSpacing: 0.8, marginBottom: vs(10) },

  // Badge grid
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: s(10) },
  badgeCard: {
    width: '47%', borderRadius: 14, padding: s(14), alignItems: 'center',
    elevation: 2, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  badgeCardEarned: { backgroundColor: '#fff' },
  badgeCardLocked: { backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#f0f0f0' },
  badgeIcon: { fontSize: fs(32), marginBottom: vs(6) },
  badgeName: { fontSize: fs(12), fontWeight: '700', color: '#333', textAlign: 'center', marginBottom: vs(4) },
  badgeDesc: { fontSize: fs(10), color: '#888', textAlign: 'center', lineHeight: vs(14), marginBottom: vs(6) },
  badgePts:  { fontSize: fs(11), fontWeight: '700', color: '#388E3C' },
});
