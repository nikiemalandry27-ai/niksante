/**
 * NikSanté — GlucoseChart
 *
 * Graphique à barres pour l'historique de glycémie.
 * 100 % React Native pur : aucune lib externe → compatible Expo Go.
 *
 * Props :
 *  - data     : GlucoseEntry[] (les premières entrées = les plus récentes)
 *  - maxBars  : nombre max de barres affichées (défaut : 7)
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { GlucoseEntry } from '@/store/glucoseStore';
import { getGlucoseStatus, getStatusColor, formatGlucose, toDisplay, GlucoseUnit } from '@/utils/glucoseHelper';
import { GLUCOSE_THRESHOLDS } from '@/utils/constants';
import { ThemedText } from '@/components/themed-text';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  data: GlucoseEntry[];
  maxBars?: number;
  unit?: GlucoseUnit;
}

// ---------------------------------------------------------------------------
// Constantes de rendu
// ---------------------------------------------------------------------------

const CHART_HEIGHT   = 110; // hauteur utile des barres (px)
const BAR_MIN_HEIGHT = 6;   // hauteur minimale visible même pour valeur basse

// Valeur max de l'axe Y (toujours au moins 300 pour la lisibilité)
function getYMax(values: number[]): number {
  return Math.max(Math.max(...values, 0) * 1.15, 300);
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export default function GlucoseChart({ data, maxBars = 7, unit = 'mg_dl' }: Props) {
  // Afficher les N dernières entrées, du plus ancien au plus récent
  const entries = [...data].slice(0, maxBars).reverse();

  // État vide
  if (entries.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <ThemedText style={styles.emptyText}>
          Ajoutez des mesures pour voir l'évolution 📈
        </ThemedText>
      </View>
    );
  }

  const yMax = getYMax(entries.map((e) => e.value));

  return (
    <View style={styles.wrapper}>
      <ThemedText style={styles.chartTitle}>
        Évolution — {entries.length} dernière{entries.length > 1 ? 's' : ''} mesure{entries.length > 1 ? 's' : ''}
      </ThemedText>

      {/* ── Lignes de référence horizontales ── */}
      <View style={styles.chartArea}>

        {/* Lignes guides (normales) */}
        <View
          style={[
            styles.refLine,
            { bottom: (GLUCOSE_THRESHOLDS.NORMAL_MAX / yMax) * CHART_HEIGHT },
          ]}
        />
        <View
          style={[
            styles.refLineLow,
            { bottom: (GLUCOSE_THRESHOLDS.HYPO_ALERT / yMax) * CHART_HEIGHT },
          ]}
        />

        {/* ── Barres ── */}
        <View style={styles.barsRow}>
          {entries.map((entry) => {
            const barHeight = Math.max(
              (entry.value / yMax) * CHART_HEIGHT,
              BAR_MIN_HEIGHT,
            );
            const status = getGlucoseStatus(entry.value);
            const color  = getStatusColor(status);
            const date   = new Date(entry.date);

            return (
              <View key={entry.id} style={styles.barWrapper}>
                {/* Valeur au-dessus */}
                <ThemedText style={[styles.barValueLabel, { color }]}>
                  {formatGlucose(entry.value, unit)}
                </ThemedText>

                {/* Espace flexible pour aligner les barres par le bas */}
                <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height:           barHeight,
                        backgroundColor:  color,
                      },
                    ]}
                  />
                </View>

                {/* Date sous la barre */}
                <ThemedText style={styles.barDateLabel}>
                  {date.toLocaleDateString('fr-FR', {
                    day:   '2-digit',
                    month: '2-digit',
                  })}
                </ThemedText>
              </View>
            );
          })}
        </View>
      </View>

      {/* ── Légende ── */}
      <View style={styles.legend}>
        {[
          { color: '#B71C1C', label: 'Critique' },
          { color: '#F57C00', label: 'Attention' },
          { color: '#388E3C', label: 'Normal' },
        ].map(({ color, label }) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <ThemedText style={styles.legendLabel}>{label}</ThemedText>
          </View>
        ))}
      </View>

      {/* ── Valeurs de référence ── */}
      <View style={styles.refLabels}>
        <ThemedText style={styles.refLabel}>
          Hypo &lt; {toDisplay(GLUCOSE_THRESHOLDS.HYPO_ALERT, unit)} · Normal {toDisplay(GLUCOSE_THRESHOLDS.NORMAL_MIN, unit)}–{toDisplay(GLUCOSE_THRESHOLDS.NORMAL_MAX, unit)} · Hyper &gt; {toDisplay(GLUCOSE_THRESHOLDS.NORMAL_MAX, unit)}
        </ThemedText>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  chartTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  chartArea: {
    height: CHART_HEIGHT + 24, // +24 pour les labels valeur
    position: 'relative',
    marginBottom: 4,
  },
  // Ligne de référence normale (140 mg/dL)
  refLine: {
    position:        'absolute',
    left:            0,
    right:           0,
    height:          1,
    backgroundColor: '#388E3C',
    opacity:         0.25,
  },
  // Ligne de référence hypo (70 mg/dL)
  refLineLow: {
    position:        'absolute',
    left:            0,
    right:           0,
    height:          1,
    backgroundColor: '#F57C00',
    opacity:         0.3,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems:    'flex-end',
    height:        CHART_HEIGHT + 24,
    gap:           4,
  },
  barWrapper: {
    flex:           1,
    alignItems:     'center',
    height:         CHART_HEIGHT + 24,
    justifyContent: 'flex-end',
  },
  barValueLabel: {
    fontSize:   9,
    fontWeight: '700',
    marginBottom: 2,
  },
  bar: {
    width:        '80%',
    borderRadius: 4,
  },
  barDateLabel: {
    fontSize:   9,
    color:      '#aaa',
    marginTop:  4,
    textAlign:  'center',
  },
  // Légende
  legend: {
    flexDirection:  'row',
    justifyContent: 'center',
    gap:            16,
    marginTop:      8,
    marginBottom:   6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  legendDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 10,
    color:    '#888',
  },
  // Labels de référence
  refLabels: {
    alignItems: 'center',
  },
  refLabel: {
    fontSize: 9,
    color:    '#bbb',
    textAlign: 'center',
  },
  // État vide
  emptyContainer: {
    backgroundColor: '#fff',
    borderRadius:    16,
    padding:         24,
    marginHorizontal: 20,
    marginBottom:    12,
    alignItems:      'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  emptyText: {
    fontSize: 13,
    color:    '#bbb',
    textAlign: 'center',
  },
});
