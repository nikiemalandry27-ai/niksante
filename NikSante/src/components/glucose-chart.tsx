/**
 * NikSanté — GlucoseChart
 *
 * Courbe de glycémie 100 % React Native (pas de lib externe).
 * Supporte 4 modes : Récent (12 mesures brutes) | 7j | 30j | 90j (moyennes/jour).
 */

import React, { useState } from 'react';
import { View, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import { GlucoseEntry } from '@/store/glucoseStore';
import {
  getGlucoseStatus,
  getStatusColor,
  formatGlucose,
  toDisplay,
  GlucoseUnit,
} from '@/utils/glucoseHelper';
import {
  getDailyAverages,
  getTrendFromAverages,
  DailyAverage,
} from '@/utils/glucoseAnalysis';
import { GLUCOSE_THRESHOLDS } from '@/utils/constants';
import { ThemedText } from '@/components/themed-text';
import { s, fs, vs } from '@/utils/responsive';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  data: GlucoseEntry[];
  unit?: GlucoseUnit;
}

type Period = 'recent' | '7d' | '30d' | '90d';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'recent', label: 'Récent' },
  { key: '7d',     label: '7 jours' },
  { key: '30d',    label: '30 jours' },
  { key: '90d',    label: '90 jours' },
];

const PERIOD_DAYS: Record<Period, number> = { recent: 0, '7d': 7, '30d': 30, '90d': 90 };

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const TOP_PAD = 20;
const CHART_H = 150;
const BOT_PAD = 36;
const TOTAL_H = TOP_PAD + CHART_H + BOT_PAD;
const H_PAD   = 10;
const DOT_R   = 5;

function calcYMax(values: number[]): number {
  return Math.max(Math.max(...values), 300) * 1.15;
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function GlucoseChart({ data, unit = 'mg_dl' }: Props) {
  const [period, setPeriod]     = useState<Period>('recent');
  const [chartWidth, setChartWidth] = useState(0);

  const isRecent   = period === 'recent';
  const days       = PERIOD_DAYS[period];
  const aggregated = isRecent ? [] : getDailyAverages(data, days);
  const trend      = isRecent ? null : getTrendFromAverages(aggregated);

  const TREND_LABELS: Record<string, string> = {
    up: '↑ Tendance haussière', down: '↓ Tendance baissière', stable: '→ Stable',
  };
  const TREND_COLORS: Record<string, string> = {
    up: '#F57C00', down: '#1565C0', stable: '#388E3C',
  };

  return (
    <View style={wrapperStyle}>

      {/* ── Titre + sélecteur ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: vs(10) }}>
        <ThemedText style={{ fontSize: fs(11), fontWeight: '700', color: '#999', letterSpacing: 0.6 }}>
          ÉVOLUTION DE LA GLYCÉMIE
        </ThemedText>
        {trend && (
          <ThemedText style={{ fontSize: fs(10), fontWeight: '700', color: TREND_COLORS[trend] }}>
            {TREND_LABELS[trend]}
          </ThemedText>
        )}
      </View>

      {/* Sélecteur de période */}
      <View style={{ flexDirection: 'row', gap: s(6), marginBottom: vs(12) }}>
        {PERIODS.map(p => (
          <TouchableOpacity
            key={p.key}
            onPress={() => setPeriod(p.key)}
            style={{
              flex: 1, alignItems: 'center',
              paddingVertical: vs(5),
              borderRadius: 8,
              backgroundColor: period === p.key ? '#388E3C' : '#f0f0f0',
            }}
          >
            <ThemedText style={{ fontSize: fs(10), fontWeight: '700', color: period === p.key ? '#fff' : '#888' }}>
              {p.label}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Vue Récent (brut) ── */}
      {isRecent && (
        <RawChart data={data} unit={unit} chartWidth={chartWidth} setChartWidth={setChartWidth} />
      )}

      {/* ── Vue agrégée (7j / 30j / 90j) ── */}
      {!isRecent && (
        <AggregatedChart averages={aggregated} unit={unit} days={days} chartWidth={chartWidth} setChartWidth={setChartWidth} />
      )}

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
// Vue brut (12 dernières mesures)
// ---------------------------------------------------------------------------

function RawChart({
  data, unit, chartWidth, setChartWidth,
}: {
  data: GlucoseEntry[];
  unit: GlucoseUnit;
  chartWidth: number;
  setChartWidth: (w: number) => void;
}) {
  const entries = [...data].slice(0, 12).reverse();

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
  const yMax = calcYMax(entries.map(e => e.value));

  const getX = (i: number) => {
    if (chartWidth <= 0) return 0;
    if (n === 1) return chartWidth / 2;
    return H_PAD + (i / (n - 1)) * (chartWidth - H_PAD * 2);
  };
  const getY = (v: number) => TOP_PAD + (1 - v / yMax) * CHART_H;

  const points = entries.map((e, i) => ({ x: getX(i), y: getY(e.value), entry: e }));
  const yRefHigh = getY(GLUCOSE_THRESHOLDS.NORMAL_MAX);
  const yRefLow  = getY(GLUCOSE_THRESHOLDS.HYPO_ALERT);
  const dateStep = n <= 6 ? 1 : n <= 10 ? 2 : 3;

  return (
    <View
      style={{ height: TOTAL_H, position: 'relative' }}
      onLayout={(e: LayoutChangeEvent) => setChartWidth(e.nativeEvent.layout.width)}
    >
      {chartWidth > 0 && (
        <>
          <View style={{ position: 'absolute', left: 0, right: 0, top: yRefHigh, height: yRefLow - yRefHigh, backgroundColor: '#388E3C', opacity: 0.07 }} />
          <View style={{ position: 'absolute', left: 0, right: 0, top: yRefHigh, height: 1, backgroundColor: '#388E3C', opacity: 0.3 }} />
          <ThemedText style={{ position: 'absolute', left: 4, top: yRefHigh - 11, fontSize: fs(8), color: '#388E3C', opacity: 0.8 }}>
            {toDisplay(GLUCOSE_THRESHOLDS.NORMAL_MAX, unit)}
          </ThemedText>
          <View style={{ position: 'absolute', left: 0, right: 0, top: yRefLow, height: 1, backgroundColor: '#F57C00', opacity: 0.4 }} />
          <ThemedText style={{ position: 'absolute', left: 4, top: yRefLow + 3, fontSize: fs(8), color: '#F57C00', opacity: 0.8 }}>
            {toDisplay(GLUCOSE_THRESHOLDS.HYPO_ALERT, unit)}
          </ThemedText>

          {points.map((pt, i) => {
            if (i === 0) return null;
            const prev  = points[i - 1];
            const dx    = pt.x - prev.x;
            const dy    = pt.y - prev.y;
            const len   = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            const color = getStatusColor(getGlucoseStatus(prev.entry.value));
            return (
              <View
                key={`seg-${i}`}
                style={{
                  position: 'absolute', width: len, height: 2,
                  backgroundColor: color,
                  left: (pt.x + prev.x) / 2 - len / 2,
                  top:  (pt.y + prev.y) / 2 - 1,
                  transform: [{ rotate: `${angle}deg` }], opacity: 0.8,
                }}
              />
            );
          })}

          {points.map((pt, i) => {
            const color    = getStatusColor(getGlucoseStatus(pt.entry.value));
            const date     = new Date(pt.entry.date);
            const showDate = i % dateStep === 0 || i === n - 1;
            return (
              <React.Fragment key={`pt-${i}`}>
                <ThemedText style={{ position: 'absolute', width: s(34), left: pt.x - s(17), top: pt.y - DOT_R - vs(14), fontSize: fs(9), fontWeight: '700', color, textAlign: 'center' }}>
                  {formatGlucose(pt.entry.value, unit)}
                </ThemedText>
                <View style={{ position: 'absolute', width: DOT_R * 2, height: DOT_R * 2, borderRadius: DOT_R, backgroundColor: color, left: pt.x - DOT_R, top: pt.y - DOT_R, borderWidth: 2, borderColor: '#fff', elevation: 3 }} />
                {showDate && (
                  <>
                    <ThemedText style={{ position: 'absolute', width: s(34), left: pt.x - s(17), top: TOP_PAD + CHART_H + vs(4), fontSize: fs(8.5), color: '#bbb', textAlign: 'center' }}>
                      {date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                    </ThemedText>
                    <ThemedText style={{ position: 'absolute', width: s(34), left: pt.x - s(17), top: TOP_PAD + CHART_H + vs(16), fontSize: fs(8), color: '#ccc', textAlign: 'center' }}>
                      {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </ThemedText>
                  </>
                )}
              </React.Fragment>
            );
          })}
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Vue agrégée (moyennes journalières)
// ---------------------------------------------------------------------------

function AggregatedChart({
  averages, unit, days, chartWidth, setChartWidth,
}: {
  averages: DailyAverage[];
  unit: GlucoseUnit;
  days: number;
  chartWidth: number;
  setChartWidth: (w: number) => void;
}) {
  if (averages.length === 0) {
    return (
      <View style={emptyStyle}>
        <ThemedText style={{ fontSize: fs(13), color: '#bbb', textAlign: 'center' }}>
          Aucune mesure sur cette période 📈
        </ThemedText>
      </View>
    );
  }

  const n    = averages.length;
  const yMax = calcYMax(averages.map(a => a.avg));

  const getX = (i: number) => {
    if (chartWidth <= 0) return 0;
    if (n === 1) return chartWidth / 2;
    return H_PAD + (i / (n - 1)) * (chartWidth - H_PAD * 2);
  };
  const getY = (v: number) => TOP_PAD + (1 - v / yMax) * CHART_H;

  const points = averages.map((a, i) => ({ x: getX(i), y: getY(a.avg), avg: a }));
  const yRefHigh = getY(GLUCOSE_THRESHOLDS.NORMAL_MAX);
  const yRefLow  = getY(GLUCOSE_THRESHOLDS.HYPO_ALERT);

  // Afficher étiquettes de date : début, milieu, fin seulement si beaucoup de points
  const showLabelAt = (i: number) => {
    if (n <= 7) return true;
    if (n <= 15) return i % 3 === 0 || i === n - 1;
    return i === 0 || i === Math.floor(n / 2) || i === n - 1;
  };

  return (
    <View
      style={{ height: TOTAL_H, position: 'relative' }}
      onLayout={(e: LayoutChangeEvent) => setChartWidth(e.nativeEvent.layout.width)}
    >
      {chartWidth > 0 && (
        <>
          <View style={{ position: 'absolute', left: 0, right: 0, top: yRefHigh, height: yRefLow - yRefHigh, backgroundColor: '#388E3C', opacity: 0.07 }} />
          <View style={{ position: 'absolute', left: 0, right: 0, top: yRefHigh, height: 1, backgroundColor: '#388E3C', opacity: 0.3 }} />
          <ThemedText style={{ position: 'absolute', left: 4, top: yRefHigh - 11, fontSize: fs(8), color: '#388E3C', opacity: 0.8 }}>
            {toDisplay(GLUCOSE_THRESHOLDS.NORMAL_MAX, unit)}
          </ThemedText>
          <View style={{ position: 'absolute', left: 0, right: 0, top: yRefLow, height: 1, backgroundColor: '#F57C00', opacity: 0.4 }} />
          <ThemedText style={{ position: 'absolute', left: 4, top: yRefLow + 3, fontSize: fs(8), color: '#F57C00', opacity: 0.8 }}>
            {toDisplay(GLUCOSE_THRESHOLDS.HYPO_ALERT, unit)}
          </ThemedText>

          {points.map((pt, i) => {
            if (i === 0) return null;
            const prev  = points[i - 1];
            const dx    = pt.x - prev.x;
            const dy    = pt.y - prev.y;
            const len   = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            const color = getStatusColor(getGlucoseStatus(prev.avg.avg));
            return (
              <View
                key={`seg-${i}`}
                style={{
                  position: 'absolute', width: len, height: 2,
                  backgroundColor: color,
                  left: (pt.x + prev.x) / 2 - len / 2,
                  top:  (pt.y + prev.y) / 2 - 1,
                  transform: [{ rotate: `${angle}deg` }], opacity: 0.8,
                }}
              />
            );
          })}

          {points.map((pt, i) => {
            const color = getStatusColor(getGlucoseStatus(pt.avg.avg));
            const date  = new Date(pt.avg.date + 'T12:00:00');
            return (
              <React.Fragment key={`pt-${i}`}>
                {n <= 20 && (
                  <ThemedText style={{ position: 'absolute', width: s(34), left: pt.x - s(17), top: pt.y - DOT_R - vs(14), fontSize: fs(9), fontWeight: '700', color, textAlign: 'center' }}>
                    {formatGlucose(pt.avg.avg, unit)}
                  </ThemedText>
                )}
                <View style={{ position: 'absolute', width: DOT_R * 2, height: DOT_R * 2, borderRadius: DOT_R, backgroundColor: color, left: pt.x - DOT_R, top: pt.y - DOT_R, borderWidth: 2, borderColor: '#fff', elevation: 3 }} />
                {showLabelAt(i) && (
                  <ThemedText style={{ position: 'absolute', width: s(34), left: pt.x - s(17), top: TOP_PAD + CHART_H + vs(4), fontSize: fs(8.5), color: '#bbb', textAlign: 'center' }}>
                    {date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                  </ThemedText>
                )}
              </React.Fragment>
            );
          })}
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const wrapperStyle = {
  backgroundColor: '#fff', borderRadius: 16, padding: 16,
  marginHorizontal: 20, marginBottom: 12,
  elevation: 2, shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
} as const;

const emptyStyle = {
  height: TOTAL_H, alignItems: 'center' as const, justifyContent: 'center' as const,
};
