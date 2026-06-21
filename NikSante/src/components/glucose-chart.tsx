/**
 * NikSanté — GlucoseChart
 *
 * Courbe de glycémie 100 % React Native (pas de lib externe).
 * Supporte 4 modes : Récent (12 mesures brutes) | 7j | 30j | 90j (moyennes/jour).
 * La zone de dessin est scrollable horizontalement si les points sont trop serrés.
 */

import React, { useState, useRef } from 'react';
import { View, TouchableOpacity, LayoutChangeEvent, ScrollView } from 'react-native';
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
  getWeeklyAverages,
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

// Espacement minimum entre deux points (en px) pour éviter le chevauchement
const MIN_POINT_SPACING_RAW  = s(44);
const MIN_POINT_SPACING_AGG  = s(52);

function calcYMax(values: number[]): number {
  return Math.max(Math.max(...values), 300) * 1.15;
}

// Calcule la largeur du canvas : au moins la largeur de l'écran, sinon n * spacing
function canvasWidth(n: number, screenW: number, minSpacing: number): number {
  if (screenW <= 0) return 0;
  return Math.max(screenW, H_PAD * 2 + (n - 1) * minSpacing);
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function GlucoseChart({ data, unit = 'mg_dl' }: Props) {
  const [period, setPeriod]         = useState<Period>('recent');
  const [chartWidth, setChartWidth] = useState(0);

  const isRecent   = period === 'recent';
  const days       = PERIOD_DAYS[period];
  // 90j → moyennes hebdomadaires (13 semaines max) pour éviter 90 points superposés
  const aggregated = isRecent
    ? []
    : period === '90d'
      ? getWeeklyAverages(data, 13)
      : getDailyAverages(data, days);

  // Assez de jours avec données pour un graphique agrégé significatif
  const hasEnoughForAggregated = aggregated.length >= 3;

  // Entrées individuelles filtrées à la période (fallback quand données insuffisantes)
  const periodEntries = isRecent
    ? data
    : data
        .filter(e => {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - days);
          return new Date(e.date) >= cutoff;
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Tendance uniquement si assez de points agrégés
  const trend = (!isRecent && hasEnoughForAggregated)
    ? getTrendFromAverages(aggregated)
    : null;

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

      {/* ── Vue individuelle : Récent OU fallback si données insuffisantes ── */}
      {(isRecent || !hasEnoughForAggregated) && (
        <>
          {!isRecent && periodEntries.length > 0 && (
            <ThemedText style={{ fontSize: fs(10), color: '#bbb', textAlign: 'center', marginBottom: vs(6), fontStyle: 'italic' }}>
              Trop peu de jours avec données — mesures individuelles affichées
            </ThemedText>
          )}
          <RawChart
            data={periodEntries}
            unit={unit}
            screenWidth={chartWidth}
            setScreenWidth={setChartWidth}
            limitTo12={isRecent}
          />
        </>
      )}

      {/* ── Vue agrégée (7j / 30j / 90j) — uniquement si ≥ 3 jours avec données ── */}
      {!isRecent && hasEnoughForAggregated && (
        <>
          {period === '90d' && (
            <ThemedText style={{ fontSize: fs(10), color: '#bbb', textAlign: 'center', marginBottom: vs(4), fontStyle: 'italic' }}>
              Moyenne par semaine
            </ThemedText>
          )}
          <AggregatedChart
            averages={aggregated}
            unit={unit}
            days={days}
            screenWidth={chartWidth}
            setScreenWidth={setChartWidth}
          />
        </>
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
  data, unit, screenWidth, setScreenWidth, limitTo12 = true,
}: {
  data: GlucoseEntry[];
  unit: GlucoseUnit;
  screenWidth: number;
  setScreenWidth: (w: number) => void;
  limitTo12?: boolean;
}) {
  const scrollRef = useRef<ScrollView>(null);

  // En mode "Récent" : 12 dernières mesures triées du plus ancien au plus récent
  // En mode fallback période : toutes les mesures déjà filtrées et triées
  const entries = limitTo12
    ? [...data].slice(0, 12).reverse()
    : [...data];

  if (entries.length === 0) {
    return (
      <View style={emptyStyle}>
        <ThemedText style={{ fontSize: fs(13), color: '#bbb', textAlign: 'center' }}>
          Ajoutez des mesures pour voir l'évolution 📈
        </ThemedText>
      </View>
    );
  }

  const n      = entries.length;
  const cW     = canvasWidth(n, screenWidth, MIN_POINT_SPACING_RAW);
  const scroll = cW > screenWidth && screenWidth > 0;
  const yMax   = calcYMax(entries.map(e => e.value));

  const getX = (i: number) => {
    if (cW <= 0) return 0;
    if (n === 1) return cW / 2;
    return H_PAD + (i / (n - 1)) * (cW - H_PAD * 2);
  };
  const getY = (v: number) => TOP_PAD + (1 - v / yMax) * CHART_H;

  const points    = entries.map((e, i) => ({ x: getX(i), y: getY(e.value), entry: e }));
  const yRefHigh  = getY(GLUCOSE_THRESHOLDS.NORMAL_MAX);
  const yRefLow   = getY(GLUCOSE_THRESHOLDS.HYPO_ALERT);

  const canvas = cW > 0 ? (
    <View style={{ width: cW, height: TOTAL_H, position: 'relative' }}>
      {/* zones de référence */}
      <View style={{ position: 'absolute', left: 0, width: cW, top: yRefHigh, height: yRefLow - yRefHigh, backgroundColor: '#388E3C', opacity: 0.07 }} />
      <View style={{ position: 'absolute', left: 0, width: cW, top: yRefHigh, height: 1, backgroundColor: '#388E3C', opacity: 0.3 }} />
      <ThemedText style={{ position: 'absolute', left: 4, top: yRefHigh - 11, fontSize: fs(8), color: '#388E3C', opacity: 0.8 }}>
        {toDisplay(GLUCOSE_THRESHOLDS.NORMAL_MAX, unit)}
      </ThemedText>
      <View style={{ position: 'absolute', left: 0, width: cW, top: yRefLow, height: 1, backgroundColor: '#F57C00', opacity: 0.4 }} />
      <ThemedText style={{ position: 'absolute', left: 4, top: yRefLow + 3, fontSize: fs(8), color: '#F57C00', opacity: 0.8 }}>
        {toDisplay(GLUCOSE_THRESHOLDS.HYPO_ALERT, unit)}
      </ThemedText>

      {/* segments */}
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

      {/* points + étiquettes */}
      {points.map((pt, i) => {
        const color = getStatusColor(getGlucoseStatus(pt.entry.value));
        const date  = new Date(pt.entry.date);
        return (
          <React.Fragment key={`pt-${i}`}>
            <ThemedText style={{ position: 'absolute', width: s(34), left: pt.x - s(17), top: pt.y - DOT_R - vs(14), fontSize: fs(9), fontWeight: '700', color, textAlign: 'center' }}>
              {formatGlucose(pt.entry.value, unit)}
            </ThemedText>
            <View style={{ position: 'absolute', width: DOT_R * 2, height: DOT_R * 2, borderRadius: DOT_R, backgroundColor: color, left: pt.x - DOT_R, top: pt.y - DOT_R, borderWidth: 2, borderColor: '#fff', elevation: 3 }} />
            <ThemedText style={{ position: 'absolute', width: s(34), left: pt.x - s(17), top: TOP_PAD + CHART_H + vs(4), fontSize: fs(8.5), color: '#bbb', textAlign: 'center' }}>
              {date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
            </ThemedText>
            <ThemedText style={{ position: 'absolute', width: s(34), left: pt.x - s(17), top: TOP_PAD + CHART_H + vs(16), fontSize: fs(8), color: '#ccc', textAlign: 'center' }}>
              {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </ThemedText>
          </React.Fragment>
        );
      })}
    </View>
  ) : null;

  return (
    <View
      style={{ height: TOTAL_H }}
      onLayout={(e: LayoutChangeEvent) => setScreenWidth(e.nativeEvent.layout.width)}
    >
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {canvas}
        </ScrollView>
      ) : (
        canvas
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Vue agrégée (moyennes journalières / hebdomadaires)
// ---------------------------------------------------------------------------

function AggregatedChart({
  averages, unit, days, screenWidth, setScreenWidth,
}: {
  averages: DailyAverage[];
  unit: GlucoseUnit;
  days: number;
  screenWidth: number;
  setScreenWidth: (w: number) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);

  if (averages.length === 0) {
    return (
      <View style={emptyStyle}>
        <ThemedText style={{ fontSize: fs(13), color: '#bbb', textAlign: 'center' }}>
          Aucune mesure sur cette période 📈
        </ThemedText>
      </View>
    );
  }

  const n      = averages.length;
  const cW     = canvasWidth(n, screenWidth, MIN_POINT_SPACING_AGG);
  const scroll = cW > screenWidth && screenWidth > 0;
  const yMax   = calcYMax(averages.map(a => a.avg));

  const getX = (i: number) => {
    if (cW <= 0) return 0;
    if (n === 1) return cW / 2;
    return H_PAD + (i / (n - 1)) * (cW - H_PAD * 2);
  };
  const getY = (v: number) => TOP_PAD + (1 - v / yMax) * CHART_H;

  const points   = averages.map((a, i) => ({ x: getX(i), y: getY(a.avg), avg: a }));
  const yRefHigh = getY(GLUCOSE_THRESHOLDS.NORMAL_MAX);
  const yRefLow  = getY(GLUCOSE_THRESHOLDS.HYPO_ALERT);


  const canvas = cW > 0 ? (
    <View style={{ width: cW, height: TOTAL_H, position: 'relative' }}>
      {/* zones de référence */}
      <View style={{ position: 'absolute', left: 0, width: cW, top: yRefHigh, height: yRefLow - yRefHigh, backgroundColor: '#388E3C', opacity: 0.07 }} />
      <View style={{ position: 'absolute', left: 0, width: cW, top: yRefHigh, height: 1, backgroundColor: '#388E3C', opacity: 0.3 }} />
      <ThemedText style={{ position: 'absolute', left: 4, top: yRefHigh - 11, fontSize: fs(8), color: '#388E3C', opacity: 0.8 }}>
        {toDisplay(GLUCOSE_THRESHOLDS.NORMAL_MAX, unit)}
      </ThemedText>
      <View style={{ position: 'absolute', left: 0, width: cW, top: yRefLow, height: 1, backgroundColor: '#F57C00', opacity: 0.4 }} />
      <ThemedText style={{ position: 'absolute', left: 4, top: yRefLow + 3, fontSize: fs(8), color: '#F57C00', opacity: 0.8 }}>
        {toDisplay(GLUCOSE_THRESHOLDS.HYPO_ALERT, unit)}
      </ThemedText>

      {/* segments */}
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

      {/* points + étiquettes */}
      {points.map((pt, i) => {
        const color = getStatusColor(getGlucoseStatus(pt.avg.avg));
        const date  = new Date(pt.avg.date + 'T12:00:00');
        return (
          <React.Fragment key={`pt-${i}`}>
            <ThemedText style={{ position: 'absolute', width: s(34), left: pt.x - s(17), top: pt.y - DOT_R - vs(14), fontSize: fs(9), fontWeight: '700', color, textAlign: 'center' }}>
              {formatGlucose(pt.avg.avg, unit)}
            </ThemedText>
            <View style={{ position: 'absolute', width: DOT_R * 2, height: DOT_R * 2, borderRadius: DOT_R, backgroundColor: color, left: pt.x - DOT_R, top: pt.y - DOT_R, borderWidth: 2, borderColor: '#fff', elevation: 3 }} />
            <ThemedText style={{ position: 'absolute', width: s(34), left: pt.x - s(17), top: TOP_PAD + CHART_H + vs(4), fontSize: fs(8.5), color: '#bbb', textAlign: 'center' }}>
              {date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
            </ThemedText>
          </React.Fragment>
        );
      })}
    </View>
  ) : null;

  return (
    <View
      style={{ height: TOTAL_H }}
      onLayout={(e: LayoutChangeEvent) => setScreenWidth(e.nativeEvent.layout.width)}
    >
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {canvas}
        </ScrollView>
      ) : (
        canvas
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
