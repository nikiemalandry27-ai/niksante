/**
 * NikSanté — HistoryScreen
 *
 * Historique complet des mesures de glycémie.
 *
 * Fonctionnalités :
 *  - Filtres : Aujourd'hui / Cette semaine / Tout
 *  - Résumé statistique pour le filtre actif (moy, min, max)
 *  - Liste complète avec contexte repas, note, suppression unitaire
 *  - État vide avec CTA
 */

import { useState, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useGlucoseStore, GlucoseEntry, MEAL_CONTEXT_META, MealContext } from '@/store/glucoseStore';
import { getGlucoseStatus, getStatusColor, formatDate, formatGlucose, unitLabel } from '@/utils/glucoseHelper';
import { formatExportText } from '@/utils/glucoseAnalysis';
import { useSettingsStore } from '@/store/settingsStore';
import { ThemedText } from '@/components/themed-text';
import { s, fs, vs } from '@/utils/responsive';

// ---------------------------------------------------------------------------
// Types filtre
// ---------------------------------------------------------------------------

type Filter = 'today' | 'week' | 'all';

const FILTER_LABELS: Record<Filter, string> = {
  today: "Aujourd'hui",
  week:  'Cette semaine',
  all:   'Tout',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isToday(date: Date): boolean {
  return date.toDateString() === new Date().toDateString();
}

function isThisWeek(date: Date): boolean {
  const now  = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return date >= start;
}

function filterEntries(entries: GlucoseEntry[], filter: Filter): GlucoseEntry[] {
  if (filter === 'today') return entries.filter((e) => isToday(new Date(e.date)));
  if (filter === 'week')  return entries.filter((e) => isThisWeek(new Date(e.date)));
  return entries;
}

function computeStats(entries: GlucoseEntry[]) {
  if (entries.length === 0) return null;
  const values = entries.map((e) => e.value);
  return {
    avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export default function HistoryScreen() {
  const router         = useRouter();
  const glucoseHistory = useGlucoseStore((state) => state.glucoseHistory);
  const deleteGlucose  = useGlucoseStore((state) => state.deleteGlucose);

  const [filter, setFilter] = useState<Filter>('all');
  const glucoseUnit = useSettingsStore((s) => s.glucoseUnit);

  const filtered = useMemo(
    () => filterEntries(glucoseHistory, filter),
    [glucoseHistory, filter],
  );

  const stats = useMemo(() => computeStats(filtered), [filtered]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleExport = async () => {
    if (filtered.length === 0) {
      Alert.alert('Aucune mesure', 'Il n\'y a rien à exporter pour ce filtre.');
      return;
    }
    await Share.share({ message: formatExportText(filtered, glucoseUnit) });
  };

  const handleDelete = (entry: GlucoseEntry) => {
    Alert.alert(
      'Supprimer cette mesure ?',
      `${formatGlucose(entry.value, glucoseUnit)} ${unitLabel(glucoseUnit)} — ${formatDate(entry.date)}`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => deleteGlucose(entry.id),
        },
      ],
    );
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ThemedText style={styles.backText}>← Retour</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.title}>Historique</ThemedText>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.reportBtn} onPress={() => router.navigate('/medical-report')}>
            <ThemedText style={styles.reportBtnText}>📋 PDF</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
            <ThemedText style={styles.exportBtnText}>⬆ Texte</ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Filtres ── */}
      <View style={styles.filterBar}>
        {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <ThemedText
              style={[styles.filterText, filter === f && styles.filterTextActive]}
            >
              {FILTER_LABELS[f]}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Stats du filtre actif ── */}
        {stats && (
          <View style={styles.statsRow}>
            <StatMini label="Moyenne" value={formatGlucose(stats.avg, glucoseUnit)} unit={unitLabel(glucoseUnit)} color="#388E3C" />
            <StatMini
              label="Minimum"
              value={formatGlucose(stats.min, glucoseUnit)}
              unit={unitLabel(glucoseUnit)}
              color={getStatusColor(getGlucoseStatus(stats.min))}
            />
            <StatMini
              label="Maximum"
              value={formatGlucose(stats.max, glucoseUnit)}
              unit={unitLabel(glucoseUnit)}
              color={getStatusColor(getGlucoseStatus(stats.max))}
            />
            <StatMini label="Total" value={`${filtered.length}`} unit="mesures" color="#555" />
          </View>
        )}

        {/* ── Liste ── */}
        {filtered.length === 0 ? (
          <EmptyState filter={filter} onAdd={() => router.navigate('/(tabs)/add-glucose')} />
        ) : (
          <View style={styles.list}>
            {filtered.map((entry) => (
              <HistoryItem
                key={entry.id}
                entry={entry}
                unit={glucoseUnit}
                onDelete={() => handleDelete(entry)}
              />
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// HistoryItem
// ---------------------------------------------------------------------------

function HistoryItem({
  entry,
  unit,
  onDelete,
}: {
  entry: GlucoseEntry;
  unit: import('@/utils/glucoseHelper').GlucoseUnit;
  onDelete: () => void;
}) {
  const status = getGlucoseStatus(entry.value);
  const color  = getStatusColor(status);
  const ctx    = entry.mealContext as NonNullable<MealContext> | null;

  return (
    <View style={[styles.item, { borderLeftColor: color }]}>
      <View style={styles.itemLeft}>
        {/* Valeur + badge contexte */}
        <View style={styles.itemTopRow}>
          <ThemedText style={[styles.itemValue, { color }]}>
            {formatGlucose(entry.value, unit)} <ThemedText style={styles.itemUnit}>{unitLabel(unit)}</ThemedText>
          </ThemedText>
          {ctx && (
            <View style={styles.ctxBadge}>
              <ThemedText style={styles.ctxText}>
                {MEAL_CONTEXT_META[ctx].icon} {MEAL_CONTEXT_META[ctx].label}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Date */}
        <ThemedText style={styles.itemDate}>{formatDate(entry.date)}</ThemedText>

        {/* Note */}
        {entry.note ? (
          <ThemedText style={styles.itemNote}>📝 {entry.note}</ThemedText>
        ) : null}

        {/* Statut */}
        <ThemedText style={[styles.itemStatus, { color }]}>
          {status.replace(/_/g, ' ').toUpperCase()}
        </ThemedText>
      </View>

      {/* Bouton supprimer */}
      <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
        <ThemedText style={styles.deleteBtnText}>🗑</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// StatMini
// ---------------------------------------------------------------------------

function StatMini({
  label, value, unit, color,
}: {
  label: string; value: string; unit: string; color: string;
}) {
  return (
    <View style={styles.statMini}>
      <ThemedText style={styles.statMiniLabel}>{label}</ThemedText>
      <ThemedText style={[styles.statMiniValue, { color }]}>{value}</ThemedText>
      <ThemedText style={styles.statMiniUnit}>{unit}</ThemedText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

function EmptyState({ filter, onAdd }: { filter: Filter; onAdd: () => void }) {
  const messages: Record<Filter, string> = {
    today: "Aucune mesure aujourd'hui.",
    week:  'Aucune mesure cette semaine.',
    all:   "Aucune mesure enregistrée pour l'instant.",
  };
  return (
    <View style={styles.emptyState}>
      <ThemedText style={styles.emptyIcon}>📊</ThemedText>
      <ThemedText style={styles.emptyText}>{messages[filter]}</ThemedText>
      <TouchableOpacity style={styles.emptyBtn} onPress={onAdd}>
        <ThemedText style={styles.emptyBtnText}>+ Ajouter une mesure</ThemedText>
      </TouchableOpacity>
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: s(20), paddingTop: vs(16), paddingBottom: vs(12),
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backBtn:  { padding: 4 },
  backText: { color: '#388E3C', fontWeight: '600', fontSize: fs(15) },
  title:    { fontSize: fs(18), fontWeight: 'bold', color: '#1a1a1a' },
  headerActions: { flexDirection: 'row', gap: s(6) },
  reportBtn: {
    paddingVertical: vs(6), paddingHorizontal: s(10),
    borderRadius: 8, backgroundColor: '#EDE7F6',
    borderWidth: 1, borderColor: '#7B1FA2',
  },
  reportBtnText: { fontSize: fs(11), color: '#7B1FA2', fontWeight: '700' },
  exportBtn: {
    paddingVertical: vs(6), paddingHorizontal: s(10),
    borderRadius: 8, backgroundColor: '#E8F5E9',
    borderWidth: 1, borderColor: '#388E3C',
  },
  exportBtnText: { fontSize: fs(11), color: '#388E3C', fontWeight: '700' },

  // Filtres
  filterBar: {
    flexDirection: 'row', paddingHorizontal: s(16), paddingVertical: vs(12),
    backgroundColor: '#fff', gap: s(8),
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  filterBtn: {
    flex: 1, paddingVertical: vs(8), borderRadius: 20,
    alignItems: 'center', backgroundColor: '#f5f5f5',
  },
  filterBtnActive: { backgroundColor: '#388E3C' },
  filterText: { fontSize: fs(12), fontWeight: '600', color: '#888' },
  filterTextActive: { color: '#fff' },

  // Stats
  statsRow: {
    flexDirection: 'row', paddingHorizontal: s(16),
    paddingVertical: vs(12), gap: s(8),
  },
  statMini: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12,
    padding: s(10), alignItems: 'center',
    elevation: 1, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2,
  },
  statMiniLabel: { fontSize: fs(9), color: '#aaa', fontWeight: '700', marginBottom: vs(4) },
  statMiniValue: { fontSize: fs(18), fontWeight: 'bold' },
  statMiniUnit:  { fontSize: fs(9), color: '#bbb', marginTop: vs(2) },

  // Liste
  list: { paddingHorizontal: s(16), paddingTop: vs(4) },

  // Item
  item: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    padding: s(14), marginBottom: vs(10), borderLeftWidth: 4,
    elevation: 2, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  itemLeft: { flex: 1 },
  itemTopRow: { flexDirection: 'row', alignItems: 'center', gap: s(10), marginBottom: vs(4) },
  itemValue: { fontSize: fs(20), fontWeight: 'bold' },
  itemUnit:  { fontSize: fs(13), color: '#999', fontWeight: '400' },
  ctxBadge: {
    backgroundColor: '#f0f0f0', borderRadius: 10,
    paddingVertical: vs(3), paddingHorizontal: s(8),
  },
  ctxText:    { fontSize: fs(11), color: '#666', fontWeight: '600' },
  itemDate:   { fontSize: fs(12), color: '#bbb', marginBottom: vs(4) },
  itemNote:   { fontSize: fs(12), color: '#888', fontStyle: 'italic', marginBottom: vs(4) },
  itemStatus: { fontSize: fs(9), fontWeight: '700', letterSpacing: 0.4 },

  // Delete
  deleteBtn: {
    padding: s(10), borderRadius: 8,
    backgroundColor: '#FFF3F3', marginLeft: s(8),
  },
  deleteBtnText: { fontSize: fs(18) },

  // Empty state
  emptyState: {
    alignItems: 'center', paddingVertical: vs(60), paddingHorizontal: s(32),
  },
  emptyIcon: { fontSize: fs(48), marginBottom: vs(16) },
  emptyText: { fontSize: fs(15), color: '#aaa', textAlign: 'center', marginBottom: vs(24) },
  emptyBtn: {
    backgroundColor: '#388E3C', borderRadius: 10,
    paddingVertical: vs(14), paddingHorizontal: s(28),
  },
  emptyBtnText: { color: '#fff', fontWeight: 'bold', fontSize: fs(15) },
});
