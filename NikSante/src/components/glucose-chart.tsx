/**
 * NikSanté — GlucoseChart
 *
 * Courbe de glycémie 100 % React Native (pas de lib externe).
 * Segments de ligne calculés via trigonométrie + transform: rotate.
 */

import React, { useState } from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import { GlucoseEntry } from '@/store/glucoseStore';
import {
  getGlucoseStatus,
  getStatusColor,
  formatGlucose,
  toDisplay,
  GlucoseUnit,
} from '@/utils/glucoseHelper';
import { GLUCOSE_THRESHOLDS } from '@/utils/constants';
import { ThemedText } from '@/components/themed-text';
import { s, fs, vs } from '@/utils/responsive';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  data: GlucoseEntry[];
  maxBars?: number;
  unit?: GlucoseUnit;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const TOP_PAD  = 20; // espace pour les labels de valeur au-dessus des points
const CHART_H  = 150; // hauteur de la zone de courbe
const BOT_PAD  = 22; // espace pour les dates en dessous
const TOTAL_H  = TOP_PAD + CHART_H + BOT_PAD;
const H_PAD    = 10; // marge gauche/droite dans la zone du graphique
const DOT_R    = 5;  // rayon des points sur la courbe

function calcYMax(values: number[]): number {
  return Math.max(Math.max(...values), 300) * 1.15;
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export default function GlucoseChart({ data, maxBars = 12, unit = 'mg_dl' }: Props) {
  const [chartWidth, setChartWidth] = useState(0);

  // Du plus récent au plus ancien dans data → on inverse pour avoir oldest→newest
  const entries = [...data].slice(0, maxBars).reverse();

  if (entries.length === 0) {
    return (
      <View style={emptyStyle}>
        <ThemedText style={{ fontSize: fs(13), color: '#bbb', textAlign: 'center' }}>
          Ajoutez des mesures pour voir l'évolution 📈
        </ThemedText>
      </View>
    );
  }

  const n    = entries.length;
  const yMax = calcYMax(entries.map((e) => e.value));

  const getX = (i: number): number => {
    if (chartWidth <= 0) return 0;
    if (n === 1) return chartWidth / 2;
    return H_PAD + (i / (n - 1)) * (chartWidth - H_PAD * 2);
  };

  const getY = (value: number): number =>
    TOP_PAD + (1 - value / yMax) * CHART_H;

  const points = entries.map((entry, i) => ({
    x: getX(i),
    y: getY(entry.value),
    entry,
  }));

  // Y des lignes de référence
  const yRefHigh = getY(GLUCOSE_THRESHOLDS.NORMAL_MAX); // 140
  const yRefLow  = getY(GLUCOSE_THRESHOLDS.HYPO_ALERT);  // 70

  // Décider si on affiche la date à chaque point (toutes / 1 sur 2 / 1 sur 3)
  const dateStep = n <= 6 ? 1 : n <= 10 ? 2 : 3;

  return (
    <View style={wrapperStyle}>

      {/* ── Titre ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: vs(12) }}>
        <ThemedText style={{ fontSize: fs(11), fontWeight: '700', color: '#999', letterSpacing: 0.6 }}>
          ÉVOLUTION DE LA GLYCÉMIE
        </ThemedText>
        <ThemedText style={{ fontSize: fs(10), color: '#bbb' }}>
          {n} mesure{n > 1 ? 's' : ''}
        </ThemedText>
      </View>

      {/* ── Zone de la courbe ── */}
      <View
        style={{ height: TOTAL_H, position: 'relative' }}
        onLayout={(e: LayoutChangeEvent) => setChartWidth(e.nativeEvent.layout.width)}
      >
        {chartWidth > 0 && (
          <>
            {/* Zone normale (fond vert très léger) */}
            <View style={{
              position:        'absolute',
              left:            0,
              right:           0,
              top:             yRefHigh,
              height:          yRefLow - yRefHigh,
              backgroundColor: '#388E3C',
              opacity:         0.07,
            }} />

            {/* Ligne de référence 140 mg/dL (vert) */}
            <View style={{ position: 'absolute', left: 0, right: 0, top: yRefHigh, height: 1, backgroundColor: '#388E3C', opacity: 0.3 }} />
            <ThemedText style={{
              position:  'absolute',
              left:      4,
              top:       yRefHigh - 11,
              fontSize:  fs(8),
              color:     '#388E3C',
              opacity:   0.8,
            }}>
              {toDisplay(GLUCOSE_THRESHOLDS.NORMAL_MAX, unit)}
            </ThemedText>

            {/* Ligne de référence 70 mg/dL (orange) */}
            <View style={{ position: 'absolute', left: 0, right: 0, top: yRefLow, height: 1, backgroundColor: '#F57C00', opacity: 0.4 }} />
            <ThemedText style={{
              position: 'absolute',
              left:     4,
              top:      yRefLow + 3,
              fontSize: fs(8),
              color:    '#F57C00',
              opacity:  0.8,
            }}>
              {toDisplay(GLUCOSE_THRESHOLDS.HYPO_ALERT, unit)}
            </ThemedText>

            {/* ── Segments de ligne entre les points ── */}
            {points.map((pt, i) => {
              if (i === 0) return null;
              const prev  = points[i - 1];
              const dx    = pt.x - prev.x;
              const dy    = pt.y - prev.y;
              const len   = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx) * (180 / Math.PI);
              const midX  = (pt.x + prev.x) / 2;
              const midY  = (pt.y + prev.y) / 2;
              const color = getStatusColor(getGlucoseStatus(prev.entry.value));
              return (
                <View
                  key={`seg-${i}`}
                  style={{
                    position:        'absolute',
                    width:           len,
                    height:          2,
                    backgroundColor: color,
                    left:            midX - len / 2,
                    top:             midY - 1,
                    transform:       [{ rotate: `${angle}deg` }],
                    opacity:         0.8,
                  }}
                />
              );
            })}

            {/* ── Points + labels valeur + labels date ── */}
            {points.map((pt, i) => {
              const status = getGlucoseStatus(pt.entry.value);
              const color  = getStatusColor(status);
              const date   = new Date(pt.entry.date);
              const showDate = i % dateStep === 0 || i === n - 1;

              return (
                <React.Fragment key={`pt-${i}`}>

                  {/* Label valeur au-dessus du point */}
                  <ThemedText
                    style={{
                      position:  'absolute',
                      width:     s(34),
                      left:      pt.x - s(17),
                      top:       pt.y - DOT_R - vs(14),
                      fontSize:  fs(9),
                      fontWeight:'700',
                      color,
                      textAlign: 'center',
                    }}
                  >
                    {formatGlucose(pt.entry.value, unit)}
                  </ThemedText>

                  {/* Point coloré */}
                  <View
                    style={{
                      position:        'absolute',
                      width:           DOT_R * 2,
                      height:          DOT_R * 2,
                      borderRadius:    DOT_R,
                      backgroundColor: color,
                      left:            pt.x - DOT_R,
                      top:             pt.y - DOT_R,
                      borderWidth:     2,
                      borderColor:     '#fff',
                      elevation:       3,
                    }}
                  />

                  {/* Label date en dessous */}
                  {showDate && (
                    <ThemedText
                      style={{
                        position:  'absolute',
                        width:     s(34),
                        left:      pt.x - s(17),
                        top:       TOP_PAD + CHART_H + vs(4),
                        fontSize:  fs(8.5),
                        color:     '#bbb',
                        textAlign: 'center',
                      }}
                    >
                      {date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                    </ThemedText>
                  )}
                </React.Fragment>
              );
            })}
          </>
        )}
      </View>

      {/* ── Légende ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: s(16), marginTop: vs(6) }}>
        {[
          { color: '#1565C0', label: 'Trop bas' },
          { color: '#388E3C', label: 'Normal'   },
          { color: '#F57C00', label: 'Élevé'    },
          { color: '#B71C1C', label: 'Critique' },
        ].map(({ color, label }) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: s(4) }}>
            <View style={{ width: s(8), height: s(8), borderRadius: 4, backgroundColor: color }} />
            <ThemedText style={{ fontSize: fs(10), color: '#888' }}>{label}</ThemedText>
          </View>
        ))}
      </View>

    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles inline (simples objets pour éviter StyleSheet)
// ---------------------------------------------------------------------------

const wrapperStyle = {
  backgroundColor: '#fff',
  borderRadius:    16,
  padding:         16,
  marginHorizontal: 20,
  marginBottom:    12,
  elevation:       2,
  shadowColor:     '#000',
  shadowOffset:    { width: 0, height: 1 },
  shadowOpacity:   0.06,
  shadowRadius:    3,
} as const;

const emptyStyle = {
  backgroundColor: '#fff',
  borderRadius:    16,
  padding:         24,
  marginHorizontal: 20,
  marginBottom:    12,
  alignItems:      'center' as const,
  elevation:       2,
  shadowColor:     '#000',
  shadowOffset:    { width: 0, height: 1 },
  shadowOpacity:   0.06,
  shadowRadius:    3,
};
