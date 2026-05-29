/**
 * NikSanté — MentalHealthScreen
 *
 * Fonctionnalités :
 *  1. Journal d'humeur quotidien (emoji 1–5) avec persistance
 *  2. Historique des 7 derniers jours
 *  3. Exercice de respiration 4-7-8 avec minuterie
 */

import { useState, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useMoodStore, MoodLevel, MOOD_META, MoodEntry } from '@/store/moodStore';
import { ThemedText } from '@/components/themed-text';
import { s, fs, vs } from '@/utils/responsive';

// ---------------------------------------------------------------------------
// Phases de l'exercice 4-7-8
// ---------------------------------------------------------------------------

type Phase = 'idle' | 'inhale' | 'hold' | 'exhale';

const PHASES: Record<Exclude<Phase, 'idle'>, { label: string; duration: number; color: string }> = {
  inhale:  { label: 'Inspirez',   duration: 4, color: '#1565C0' },
  hold:    { label: 'Retenez',    duration: 7, color: '#7B1FA2' },
  exhale:  { label: 'Expirez',    duration: 8, color: '#388E3C' },
};

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export default function MentalHealthScreen() {
  const router      = useRouter();
  const { entries, initMood, addMood, getTodayMood } = useMoodStore();

  const [note,       setNote]       = useState('');
  const [phase,      setPhase]      = useState<Phase>('idle');
  const [countdown,  setCountdown]  = useState(0);
  const [cycles,     setCycles]     = useState(0);

  const phaseRef   = useRef<Phase>('idle');
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const circleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => { initMood(); }, []);

  const todayMood = getTodayMood();

  // ── Animation cercle ──────────────────────────────────────────────────────

  function animateCircle(toValue: number, duration: number) {
    Animated.timing(circleAnim, {
      toValue,
      duration: duration * 1000,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  }

  // ── Minuterie ─────────────────────────────────────────────────────────────

  function runPhase(p: Exclude<Phase, 'idle'>, remaining: number) {
    phaseRef.current = p;
    setPhase(p);
    setCountdown(remaining);

    if (remaining === PHASES[p].duration) {
      // Début de la phase → lancer l'animation
      animateCircle(p === 'inhale' ? 1 : p === 'hold' ? 1 : 0, PHASES[p].duration);
    }

    if (remaining > 0) {
      timerRef.current = setTimeout(() => {
        if (phaseRef.current === 'idle') return; // arrêté
        runPhase(p, remaining - 1);
      }, 1000);
    } else {
      // Passer à la phase suivante
      const next: Exclude<Phase, 'idle'>[] = ['inhale', 'hold', 'exhale'];
      const idx = next.indexOf(p);
      const nextPhase = next[(idx + 1) % 3];
      if (nextPhase === 'inhale') setCycles((c) => c + 1);
      runPhase(nextPhase, PHASES[nextPhase].duration);
    }
  }

  function startBreathing() {
    setCycles(0);
    runPhase('inhale', PHASES.inhale.duration);
  }

  function stopBreathing() {
    if (timerRef.current) clearTimeout(timerRef.current);
    phaseRef.current = 'idle';
    setPhase('idle');
    setCountdown(0);
    circleAnim.setValue(0);
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // ── Historique 7 jours ────────────────────────────────────────────────────

  const last7: (MoodEntry | null)[] = [];
  for (let i = 6; i >= 0; i--) {
    const target = new Date();
    target.setDate(target.getDate() - i);
    const found = entries.find(
      (e) => new Date(e.date).toDateString() === target.toDateString()
    );
    last7.push(found ?? null);
  }

  const DAY_LABELS = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];

  // ── Circle radius interpolation ───────────────────────────────────────────

  const circleSize = circleAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [vs(80), vs(140)],
  });

  const phaseColor = phase !== 'idle' ? PHASES[phase].color : '#ddd';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ThemedText style={styles.backText}>← Retour</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.title}>Bien-être mental</ThemedText>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Humeur du jour ── */}
        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>
            {todayMood ? '✅  Humeur enregistrée aujourd\'hui' : '😊  Comment vous sentez-vous ?'}
          </ThemedText>

          <View style={styles.moodRow}>
            {([1, 2, 3, 4, 5] as MoodLevel[]).map((lvl) => {
              const meta      = MOOD_META[lvl];
              const isSelected = todayMood?.mood === lvl;
              return (
                <TouchableOpacity
                  key={lvl}
                  style={[styles.moodBtn, isSelected && { borderColor: meta.color, borderWidth: 2 }]}
                  onPress={() => {
                    addMood(lvl, note);
                    setNote('');
                  }}
                >
                  <ThemedText style={styles.moodEmoji}>{meta.emoji}</ThemedText>
                  <ThemedText style={[styles.moodLabel, { color: meta.color }]}>{meta.label}</ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>

          {!todayMood && (
            <TextInput
              style={styles.noteInput}
              placeholder="Note optionnelle (ex: nuit courte, stress…)"
              placeholderTextColor="#bbb"
              value={note}
              onChangeText={setNote}
              multiline
            />
          )}

          {todayMood && (
            <ThemedText style={[styles.todayMoodText, { color: MOOD_META[todayMood.mood].color }]}>
              {MOOD_META[todayMood.mood].emoji}  {MOOD_META[todayMood.mood].label}
              {todayMood.note ? `  ·  "${todayMood.note}"` : ''}
            </ThemedText>
          )}
        </View>

        {/* ── Historique 7 jours ── */}
        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>📅  7 derniers jours</ThemedText>
          <View style={styles.weekRow}>
            {last7.map((entry, i) => {
              const dayIdx = new Date(new Date().setDate(new Date().getDate() - (6 - i))).getDay();
              const meta   = entry ? MOOD_META[entry.mood] : null;
              return (
                <View key={i} style={styles.dayCol}>
                  <View style={[
                    styles.dayDot,
                    { backgroundColor: meta ? meta.color : '#eee' },
                  ]}>
                    {entry && <ThemedText style={styles.dayEmoji}>{meta!.emoji}</ThemedText>}
                  </View>
                  <ThemedText style={styles.dayLabel}>{DAY_LABELS[dayIdx]}</ThemedText>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Exercice de respiration 4-7-8 ── */}
        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>🧘  Respiration 4-7-8</ThemedText>
          <ThemedText style={styles.breathDesc}>
            Inspirez 4s · Retenez 7s · Expirez 8s{'\n'}
            Réduit le stress et stabilise la glycémie.
          </ThemedText>

          {/* Cercle animé */}
          <View style={styles.circleWrapper}>
            <Animated.View style={[
              styles.circle,
              { width: circleSize, height: circleSize, borderRadius: circleSize, backgroundColor: phaseColor + '30', borderColor: phaseColor },
            ]}>
              {phase !== 'idle' ? (
                <>
                  <ThemedText style={[styles.phaseLabel, { color: phaseColor }]}>
                    {PHASES[phase].label}
                  </ThemedText>
                  <ThemedText style={[styles.phaseCount, { color: phaseColor }]}>
                    {countdown}
                  </ThemedText>
                </>
              ) : (
                <ThemedText style={styles.idleText}>🫁</ThemedText>
              )}
            </Animated.View>
          </View>

          {cycles > 0 && phase !== 'idle' && (
            <ThemedText style={styles.cyclesText}>Cycle {cycles + 1}</ThemedText>
          )}

          {phase === 'idle' ? (
            <TouchableOpacity style={styles.breathBtn} onPress={startBreathing}>
              <ThemedText style={styles.breathBtnText}>▶  Commencer</ThemedText>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.breathBtn, { backgroundColor: '#B71C1C' }]} onPress={stopBreathing}>
              <ThemedText style={styles.breathBtnText}>■  Arrêter</ThemedText>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Conseils ── */}
        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>💡  Le saviez-vous ?</ThemedText>
          {[
            '😤  Le stress chronique élève la glycémie via le cortisol.',
            '💤  Un manque de sommeil diminue la sensibilité à l\'insuline.',
            '🚶  20 min de marche après un repas réduit la glycémie postprandiale.',
            '🧘  La méditation peut améliorer le contrôle glycémique.',
          ].map((tip) => (
            <ThemedText key={tip} style={styles.tip}>{tip}</ThemedText>
          ))}
        </View>

        <View style={{ height: 40 }} />
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
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: s(20), paddingTop: vs(16), paddingBottom: vs(12),
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backBtn:  { padding: 4 },
  backText: { color: '#388E3C', fontWeight: '600', fontSize: fs(15) },
  title:    { fontSize: fs(18), fontWeight: 'bold', color: '#1a1a1a' },

  card: {
    margin: s(16), marginBottom: 0, backgroundColor: '#fff', borderRadius: 16, padding: s(18),
    elevation: 2, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
    marginTop: vs(16),
  },
  cardTitle: { fontSize: fs(14), fontWeight: 'bold', color: '#1a1a1a', marginBottom: vs(14) },

  // Humeur
  moodRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: vs(12) },
  moodBtn: {
    alignItems: 'center', padding: s(8), borderRadius: 12,
    borderWidth: 2, borderColor: 'transparent', flex: 1, marginHorizontal: s(2),
  },
  moodEmoji: { fontSize: fs(26), marginBottom: vs(4) },
  moodLabel: { fontSize: fs(9), fontWeight: '700', textAlign: 'center' },
  noteInput: {
    backgroundColor: '#f5f5f5', borderRadius: 10,
    padding: s(12), fontSize: fs(13), color: '#333',
    minHeight: vs(60), textAlignVertical: 'top',
  },
  todayMoodText: { fontSize: fs(14), fontWeight: '600', textAlign: 'center', marginTop: vs(4) },

  // Semaine
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol:  { alignItems: 'center', flex: 1 },
  dayDot: {
    width: s(36), height: s(36), borderRadius: s(18),
    alignItems: 'center', justifyContent: 'center', marginBottom: vs(4),
  },
  dayEmoji:  { fontSize: fs(18) },
  dayLabel:  { fontSize: fs(10), color: '#aaa', fontWeight: '600' },

  // Respiration
  breathDesc:    { fontSize: fs(13), color: '#888', lineHeight: vs(20), marginBottom: vs(20), textAlign: 'center' },
  circleWrapper: { alignItems: 'center', justifyContent: 'center', height: vs(180), marginBottom: vs(12) },
  circle: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3,
  },
  phaseLabel: { fontSize: fs(14), fontWeight: '700', marginBottom: vs(4) },
  phaseCount: { fontSize: fs(32), fontWeight: 'bold' },
  idleText:   { fontSize: fs(48) },
  cyclesText: { textAlign: 'center', fontSize: fs(12), color: '#aaa', marginBottom: vs(8) },
  breathBtn: {
    backgroundColor: '#388E3C', borderRadius: 12,
    paddingVertical: vs(14), alignItems: 'center',
  },
  breathBtnText: { color: '#fff', fontWeight: 'bold', fontSize: fs(15) },

  // Conseils
  tip: { fontSize: fs(13), color: '#555', lineHeight: vs(22), marginBottom: vs(6) },
});
