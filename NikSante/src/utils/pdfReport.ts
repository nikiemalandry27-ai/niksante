import Constants from 'expo-constants';
import { GlucoseEntry, MEAL_CONTEXT_META, MealContext } from '@/store/glucoseStore';
import { SleepEntry } from '@/store/sleepStore';
import { InsulinEntry, InsulinType } from '@/services/api';
import { getGlucoseStatus, formatDate, GlucoseUnit, formatGlucose, unitLabel } from './glucoseHelper';
import { getTimeInRange, getConsistencyScore, estimateHbA1c } from './glucoseAnalysis';
import { computeSleepDebt } from './insightEngine';
import { GLUCOSE_THRESHOLDS } from './constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReportPeriod = 7 | 14 | 30;

export interface ReportParams {
  patientName:    string;
  patientEmail:   string;
  glucoseEntries: GlucoseEntry[];
  sleepEntries:   SleepEntry[];
  insulinEntries: InsulinEntry[];
  sleepGoal:      number;
  glucoseUnit:    GlucoseUnit;
  period:         ReportPeriod;
}

// ---------------------------------------------------------------------------
// Helpers — filtrage
// ---------------------------------------------------------------------------

export function filterGlucoseByDays(entries: GlucoseEntry[], days: number): GlucoseEntry[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return [...entries]
    .filter(e => new Date(e.date) >= cutoff)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function filterSleepByDays(entries: SleepEntry[], days: number): SleepEntry[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  return [...entries]
    .filter(e => e.date >= cutoffStr)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Helpers — couleurs statut glycémie
// ---------------------------------------------------------------------------

function gStatusColor(status: string): string {
  if (status === 'normal')         return '#1B5E20';
  if (status.includes('hypo'))     return '#0D47A1';
  if (status === 'hyper_mild')     return '#F57F17';
  if (status === 'hyper_critical') return '#B71C1C';
  return '#E65100';
}

function gStatusBg(status: string): string {
  if (status === 'normal')         return '#F1F8F1';
  if (status.includes('hypo'))     return '#EDF3FC';
  if (status === 'hyper_mild')     return '#FFFDE7';
  if (status === 'hyper_critical') return '#FEF0F0';
  return '#FFF8F0';
}

function sleepQualityLabel(q: number): string {
  return ({ 1: 'Mauvais', 2: 'Passable', 3: 'Correct', 4: 'Bon', 5: 'Excellent' } as Record<number, string>)[q] ?? '-';
}

function sleepQualityColor(q: number): string {
  if (q >= 4) return '#1B5E20';
  if (q === 3) return '#E65100';
  return '#B71C1C';
}

// ---------------------------------------------------------------------------
// Courbe glycémique SVG
// ---------------------------------------------------------------------------

function generateGlucoseSVG(entries: GlucoseEntry[], glucoseUnit: GlucoseUnit): string {
  if (entries.length === 0) return '';

  const W = 680, H = 180;
  const ml = 48, mr = 16, mt = 16, mb = 32;
  const pw = W - ml - mr;
  const ph = H - mt - mb;

  // Plage Y en mg/dL internes
  const yMin = 40, yMax = 320;

  const allTimes = entries.map(e => new Date(e.date).getTime());
  const tMin = Math.min(...allTimes);
  const tMax = Math.max(...allTimes);
  const tRange = tMax > tMin ? tMax - tMin : 1;

  const toX = (d: Date | string) =>
    ml + ((new Date(d).getTime() - tMin) / tRange) * pw;

  const toY = (v: number) =>
    mt + (1 - (v - yMin) / (yMax - yMin)) * ph;

  const yNormMin = toY(GLUCOSE_THRESHOLDS.NORMAL_MIN);  // 70 mg/dL
  const yNormMax = toY(GLUCOSE_THRESHOLDS.NORMAL_MAX);  // 180 mg/dL

  // Construire le chemin de ligne
  const pathD = entries
    .map((e, i) => `${i === 0 ? 'M' : 'L'} ${toX(e.date).toFixed(1)} ${toY(e.value).toFixed(1)}`)
    .join(' ');

  // Grille Y
  const yTicks = [50, 70, 100, 140, 180, 220, 280].filter(v => v >= yMin && v <= yMax);

  // Libellés X : max 6 points répartis
  const step = Math.max(1, Math.floor(entries.length / 6));
  const xTickEntries = entries.filter((_, i) => i % step === 0 || i === entries.length - 1);

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block">`;

  // Fond blanc
  svg += `<rect width="${W}" height="${H}" fill="white"/>`;

  // Zone normale (vert pâle)
  svg += `<rect x="${ml}" y="${yNormMax.toFixed(1)}" width="${pw}" height="${(yNormMin - yNormMax).toFixed(1)}" fill="#E8F5E9" opacity="0.7"/>`;

  // Lignes de grille horizontales
  for (const v of yTicks) {
    const y = toY(v).toFixed(1);
    const lbl = glucoseUnit === 'mmol_l' ? (v / 18).toFixed(1) : String(v);
    const isNormBound = v === GLUCOSE_THRESHOLDS.NORMAL_MIN || v === GLUCOSE_THRESHOLDS.NORMAL_MAX;
    svg += `<line x1="${ml}" y1="${y}" x2="${W - mr}" y2="${y}" stroke="${isNormBound ? '#81C784' : '#EEEEEE'}" stroke-width="${isNormBound ? 1.2 : 1}" stroke-dasharray="${isNormBound ? '5,4' : ''}"/>`;
    svg += `<text x="${ml - 4}" y="${parseFloat(y) + 4}" text-anchor="end" font-family="Arial" font-size="10" fill="#AAA">${lbl}</text>`;
  }

  // Ligne reliant les points
  if (entries.length > 1) {
    svg += `<path d="${pathD}" fill="none" stroke="#66BB6A" stroke-width="1.8" stroke-linejoin="round" opacity="0.6"/>`;
  }

  // Points colorés
  for (const e of entries) {
    const status = getGlucoseStatus(e.value);
    const col    = gStatusColor(status);
    const cx     = toX(e.date).toFixed(1);
    const cy     = toY(e.value).toFixed(1);
    svg += `<circle cx="${cx}" cy="${cy}" r="4.5" fill="${col}" stroke="white" stroke-width="1.5"/>`;
  }

  // Axe X
  svg += `<line x1="${ml}" y1="${(mt + ph).toFixed(1)}" x2="${W - mr}" y2="${(mt + ph).toFixed(1)}" stroke="#CCCCCC" stroke-width="1"/>`;

  // Labels X
  for (const e of xTickEntries) {
    const x   = toX(e.date);
    const lbl = new Date(e.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    svg += `<text x="${x.toFixed(1)}" y="${H - 8}" text-anchor="middle" font-family="Arial" font-size="10" fill="#AAA">${lbl}</text>`;
  }

  // Légende unité
  const ul = glucoseUnit === 'mmol_l' ? 'mmol/L' : 'mg/dL';
  svg += `<text x="${ml}" y="${mt - 5}" font-family="Arial" font-size="10" fill="#BBB">${ul}</text>`;

  // Légende couleurs
  const legendY = mt + 4;
  const legendItems = [
    { col: '#1B5E20', lbl: 'Normal' },
    { col: '#E65100', lbl: 'Hyperglycémie' },
    { col: '#0D47A1', lbl: 'Hypoglycémie' },
  ];
  let lx = W - mr;
  for (let i = legendItems.length - 1; i >= 0; i--) {
    const item = legendItems[i];
    const lw   = item.lbl.length * 7 + 16;
    lx -= lw + 4;
    svg += `<circle cx="${lx}" cy="${legendY}" r="4" fill="${item.col}"/>`;
    svg += `<text x="${lx + 8}" y="${legendY + 4}" font-family="Arial" font-size="10" fill="#888">${item.lbl}</text>`;
  }

  svg += '</svg>';
  return svg;
}

// ---------------------------------------------------------------------------
// Générateur HTML principal
// ---------------------------------------------------------------------------

export function generateMedicalReportHTML(params: ReportParams): string {
  const { patientName, patientEmail, glucoseEntries, sleepEntries, insulinEntries, sleepGoal, glucoseUnit, period } = params;

  const filteredGlucose = filterGlucoseByDays(glucoseEntries, period);
  const filteredSleep   = filterSleepByDays(sleepEntries, period);

  const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);
  const startDateStr = startDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const ul = unitLabel(glucoseUnit);

  // ── Statistiques glycémie ──────────────────────────────────────────
  const hasGlucose = filteredGlucose.length > 0;
  const tir   = getTimeInRange(filteredGlucose);
  const score = getConsistencyScore(filteredGlucose);
  const gValues = filteredGlucose.map(e => e.value);
  const gAvg  = hasGlucose ? Math.round(gValues.reduce((a, b) => a + b, 0) / gValues.length) : 0;
  const gMin  = hasGlucose ? Math.min(...gValues) : 0;
  const gMax  = hasGlucose ? Math.max(...gValues) : 0;

  // ── HbA1c estimé (sur tous les 90j, indépendant de la période choisie) ──
  const hba1c = estimateHbA1c(glucoseEntries);

  // ── Insuline ──────────────────────────────────────────────────────
  const filteredInsulin = insulinEntries.filter(e => {
    const d = new Date(e.administeredAt);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - period);
    return d >= cutoff;
  }).sort((a, b) => new Date(b.administeredAt).getTime() - new Date(a.administeredAt).getTime());
  const hasInsulin = filteredInsulin.length > 0;

  const INSULIN_META: Record<InsulinType, { label: string; color: string; icon: string }> = {
    rapide:   { label: 'Rapide',   color: '#1565C0', icon: '⚡' },
    lente:    { label: 'Lente',    color: '#388E3C', icon: '🐢' },
    premixte: { label: 'Prémixée',color: '#7B1FA2', icon: '🔀' },
  };

  const insulinTotals: Record<InsulinType, number> = { rapide: 0, lente: 0, premixte: 0 };
  filteredInsulin.forEach(e => { insulinTotals[e.type] = (insulinTotals[e.type] ?? 0) + e.doseUnits; });

  const insulinRows = filteredInsulin.map(e => {
    const m   = INSULIN_META[e.type];
    const dt  = new Date(e.administeredAt);
    const dtStr = dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                + ' ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `
      <tr>
        <td>${dtStr}</td>
        <td style="font-weight:bold;color:${m.color}">${e.doseUnits} u</td>
        <td><span style="color:${m.color};font-size:10px;font-weight:bold;background:${m.color}15;
            padding:2px 8px;border-radius:10px;border:1px solid ${m.color}35">${m.icon} ${m.label}</span></td>
        <td style="font-size:11px;color:#888;font-style:italic">${(e.note ?? '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>
      </tr>`;
  }).join('');

  // ── Statistiques sommeil ───────────────────────────────────────────
  const hasSleep = filteredSleep.length > 0;
  const debt = hasSleep ? computeSleepDebt(filteredSleep, sleepGoal) : null;
  const avgSleep = hasSleep
    ? Math.round(filteredSleep.reduce((a, b) => a + b.duration, 0) / filteredSleep.length * 10) / 10
    : 0;

  // ── Courbe SVG ────────────────────────────────────────────────────
  const svgChart = hasGlucose ? generateGlucoseSVG(filteredGlucose, glucoseUnit) : '';

  // ── Lignes tableau glycémie ────────────────────────────────────────
  // Afficher toutes les mesures (triées du plus récent au plus ancien pour le médecin)
  const glucoseRowsSorted = [...filteredGlucose].reverse();
  const glucoseRows = glucoseRowsSorted.map(e => {
    const status = getGlucoseStatus(e.value);
    const ctx    = e.mealContext
      ? MEAL_CONTEXT_META[e.mealContext as NonNullable<MealContext>].label
      : '—';
    const bg  = gStatusBg(status);
    const col = gStatusColor(status);
    const lblMap: Record<string, string> = {
      normal:          'Normal (4–8 mmol/L)',
      hypo_critical:   'Hypoglycémie critique',
      hypo:            'Hypoglycémie',
      hyper_mild:      'Élevé post-repas (8–10 mmol/L)',
      hyper:           'Hyperglycémie',
      hyper_critical:  'Hyperglycémie critique',
    };
    const lbl = lblMap[status] ?? status.replace(/_/g, ' ');
    return `
      <tr style="background:${bg}">
        <td>${formatDate(e.date)}</td>
        <td style="font-weight:bold;color:${col}">${formatGlucose(e.value, glucoseUnit)} ${ul}</td>
        <td><span style="color:${col};font-size:10px;font-weight:bold;background:${col}15;
            padding:2px 8px;border-radius:10px;border:1px solid ${col}35">${lbl}</span></td>
        <td style="color:#555">${ctx}</td>
        <td style="font-size:11px;color:#888;font-style:italic">${(e.note ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
      </tr>`;
  }).join('');

  // ── Lignes tableau sommeil ─────────────────────────────────────────
  const sleepRowsSorted = [...filteredSleep].reverse();
  const sleepRows = sleepRowsSorted.map(e => {
    const diff    = Math.round((e.duration - sleepGoal) * 10) / 10;
    const diffStr = diff >= 0 ? `+${diff}h` : `${diff}h`;
    const diffCol = diff >= 0 ? '#1B5E20' : '#B71C1C';
    const qCol    = sleepQualityColor(e.quality);
    const qLbl    = sleepQualityLabel(e.quality);
    return `
      <tr>
        <td>${new Date(e.date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
        <td>${e.bedTime}</td>
        <td>${e.wakeTime}</td>
        <td style="font-weight:bold">${e.duration}h</td>
        <td style="font-weight:bold;color:${diffCol}">${diffStr}</td>
        <td><span style="color:${qCol};font-size:10px;font-weight:bold;background:${qCol}15;
            padding:2px 8px;border-radius:10px;border:1px solid ${qCol}35">${qLbl}</span></td>
        <td style="font-size:11px;color:#888;font-style:italic">${(e.notes ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
      </tr>`;
  }).join('');

  // ── HTML ───────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Rapport Médical — NikSanté</title>
<style>
  /* ── Format papier A4 ── */
  @page{size:A4 portrait;margin:15mm 12mm 18mm 12mm}

  /* ── Couleurs et fonds préservés à l'impression ── */
  *{
    margin:0;padding:0;box-sizing:border-box;
    -webkit-print-color-adjust:exact;
    print-color-adjust:exact;
  }

  body{
    font-family:Arial,Helvetica,sans-serif;
    font-size:10pt;
    color:#1a1a1a;
    background:#fff;
    padding:0;
    line-height:1.45;
  }

  /* ── En-tête ── */
  .rh{
    display:flex;justify-content:space-between;align-items:flex-start;
    border-bottom:3pt solid #388E3C;padding-bottom:10pt;margin-bottom:14pt;
    page-break-inside:avoid;
  }
  .rh-app{font-size:18pt;font-weight:bold;color:#388E3C}
  .rh-sub{font-size:8pt;color:#999;margin-top:2pt}
  .rh-pat{text-align:right;font-size:9pt;color:#555;line-height:1.8}
  .rh-name{font-size:12pt;font-weight:bold;color:#1a1a1a}
  .period{
    display:inline-block;background:#E8F5E9;border:1pt solid #81C784;
    border-radius:4pt;padding:3pt 12pt;font-size:9pt;color:#2E7D32;
    font-weight:bold;margin-bottom:14pt;
  }

  /* ── Sections : saut de page entre elles uniquement ── */
  .sec{
    margin-bottom:20pt;
    page-break-inside:avoid;
  }
  /* Autoriser un saut avant une nouvelle section si nécessaire */
  .sec+.sec{page-break-before:auto}

  /* ── En-têtes de section ── */
  .sh{
    color:#fff;font-size:11pt;font-weight:bold;
    padding:7pt 12pt;border-radius:5pt 5pt 0 0;
    page-break-after:avoid;
  }
  .sh.g{background:linear-gradient(90deg,#2E7D32,#43A047)}
  .sh.s{background:linear-gradient(90deg,#4527A0,#5E35B1)}

  /* ── Cartes de statistiques ── */
  .sr{
    display:flex;gap:6pt;flex-wrap:wrap;
    background:#FAFAFA;border:1pt solid #E0E0E0;border-top:none;
    padding:10pt;page-break-inside:avoid;
  }
  .sc{
    flex:1;min-width:70pt;background:#fff;border-radius:5pt;
    padding:8pt 10pt;border:1pt solid #EEEEEE;text-align:center;
    page-break-inside:avoid;
  }
  .sl{font-size:7pt;color:#AAA;font-weight:bold;text-transform:uppercase;letter-spacing:.5pt}
  .sv{font-size:16pt;font-weight:bold;color:#1a1a1a;margin:3pt 0 2pt}
  .su{font-size:8pt;color:#BBB}

  /* ── Barre TIR ── */
  .tb{
    background:#FAFAFA;border:1pt solid #E0E0E0;border-top:none;
    padding:8pt 12pt 12pt;page-break-inside:avoid;
  }
  .tbl{font-size:9pt;color:#555;font-weight:bold;margin-bottom:5pt}
  .tbar{display:flex;height:16pt;border-radius:4pt;overflow:hidden}
  .t-lo{background:#1565C0}
  .t-ok{background:#388E3C}
  .t-hi{background:#F57C00}
  .tleg{display:flex;gap:14pt;margin-top:6pt;flex-wrap:wrap}
  .tli{display:flex;align-items:center;gap:4pt;font-size:8.5pt;color:#555}
  .tld{width:8pt;height:8pt;border-radius:2pt;flex-shrink:0}
  .sbdg{
    display:inline-block;margin-top:7pt;
    padding:3pt 14pt;border-radius:16pt;
    font-size:10pt;font-weight:bold;
  }

  /* ── Graphique SVG ── */
  .chrt{
    background:#FAFAFA;border:1pt solid #E0E0E0;border-top:none;
    padding:10pt 12pt;page-break-inside:avoid;
  }
  .chrt-ttl{font-size:9pt;color:#555;font-weight:bold;margin-bottom:6pt}

  /* ── Tableaux de données ── */
  .dt{
    width:100%;border-collapse:collapse;
    border:1pt solid #E0E0E0;border-top:none;
    font-size:9pt;
  }
  .dt thead{display:table-header-group} /* répète l'en-tête sur chaque page */
  .dt th{
    background:#F5F5F5;color:#777;
    font-size:7.5pt;font-weight:bold;
    text-transform:uppercase;letter-spacing:.4pt;
    padding:6pt 8pt;border-bottom:1pt solid #E8E8E8;text-align:left;
  }
  .dt td{
    padding:6pt 8pt;border-bottom:1pt solid #F5F5F5;
    vertical-align:middle;page-break-inside:avoid;
  }
  .dt tr:last-child td{border-bottom:none}
  .dt tbody tr{page-break-inside:avoid}

  /* ── États vides ── */
  .em{
    text-align:center;color:#BBB;padding:20pt;
    font-style:italic;font-size:9pt;
    background:#FAFAFA;border:1pt solid #E0E0E0;border-top:none;
  }

  /* ── Pied de page ── */
  .ft{
    margin-top:20pt;padding-top:8pt;
    border-top:1pt solid #EEEEEE;
    text-align:center;color:#CCC;
    font-size:7.5pt;line-height:1.8;
    page-break-inside:avoid;
  }
  .disc{font-style:italic;font-size:7pt;color:#DDD;margin-top:3pt}
</style>
</head>
<body>

<div class="rh">
  <div>
    <div class="rh-app">NikSanté</div>
    <div class="rh-sub">Application de suivi du diabète</div>
  </div>
  <div class="rh-pat">
    <div class="rh-name">${(patientName || 'Patient').replace(/</g,'&lt;')}</div>
    <div>${(patientEmail || '').replace(/</g,'&lt;')}</div>
    <div style="color:#BBB;margin-top:2px">Généré le ${now}</div>
  </div>
</div>

<div class="period">📅 Du ${startDateStr} au ${now} · ${period} jours</div>

${hasGlucose || hasSleep ? '' : '<p style="color:#999;text-align:center;padding:40px">Aucune donnée enregistrée sur cette période.</p>'}

${hasGlucose ? `
<!-- ═══ GLYCÉMIE ═══ -->
<div class="sec">
  <div class="sh g">🩸 Glycémie — ${filteredGlucose.length} mesure${filteredGlucose.length > 1 ? 's' : ''}</div>

  <div class="sr">
    <div class="sc"><div class="sl">Moyenne</div><div class="sv">${formatGlucose(gAvg, glucoseUnit)}</div><div class="su">${ul}</div></div>
    <div class="sc"><div class="sl">Minimum</div><div class="sv" style="color:#1565C0">${formatGlucose(gMin, glucoseUnit)}</div><div class="su">${ul}</div></div>
    <div class="sc"><div class="sl">Maximum</div><div class="sv" style="color:#F57C00">${formatGlucose(gMax, glucoseUnit)}</div><div class="su">${ul}</div></div>
    <div class="sc"><div class="sl">TIR</div><div class="sv" style="color:#388E3C">${tir.inRange}%</div><div class="su">dans la norme</div></div>
    ${hba1c ? `<div class="sc"><div class="sl">HbA1c estimé</div><div class="sv" style="color:${hba1c.color}">${hba1c.value.toFixed(1)}%</div><div class="su" style="color:${hba1c.color};font-weight:bold">${hba1c.label}</div></div>` : ''}
  </div>
  ${hba1c ? `<div style="background:#FAFAFA;border:1px solid #E0E0E0;border-top:none;padding:10px 14px;font-size:11px;color:#555">
    <b>HbA1c estimé :</b> <span style="color:${hba1c.color};font-weight:bold">${hba1c.value.toFixed(1)} %</span>
    — ${hba1c.advice}
    <span style="color:#BBB"> · Basé sur ${hba1c.basedOnCount} mesures (90 jours) · Formule ADAG</span>
  </div>` : ''}

  <div class="tb">
    <div class="tbl">Time In Range (TIR)</div>
    <div class="tbar">
      <div class="t-lo" style="width:${tir.below}%"></div>
      <div class="t-ok" style="width:${tir.inRange}%"></div>
      <div class="t-hi" style="width:${tir.above}%"></div>
    </div>
    <div class="tleg">
      <div class="tli"><div class="tld" style="background:#1565C0"></div>Hypoglycémie : ${tir.below}%</div>
      <div class="tli"><div class="tld" style="background:#388E3C"></div>Dans la norme : ${tir.inRange}%</div>
      <div class="tli"><div class="tld" style="background:#F57C00"></div>Hyperglycémie : ${tir.above}%</div>
    </div>
    <div>
      <span class="sbdg" style="background:${score.color}18;color:${score.color};border:1.5px solid ${score.color}60">
        Contrôle glycémique : ${score.label} (${score.score}%)
      </span>
    </div>
  </div>

  <div class="chrt">
    <div class="chrt-ttl">Évolution de la glycémie sur la période</div>
    ${svgChart}
  </div>

  <table class="dt">
    <thead><tr><th>Date / Heure</th><th>Valeur</th><th>Statut</th><th>Contexte</th><th>Note</th></tr></thead>
    <tbody>${glucoseRows}</tbody>
  </table>
</div>
` : ''}

${hasSleep ? `
<!-- ═══ SOMMEIL ═══ -->
<div class="sec">
  <div class="sh s">💤 Sommeil — ${filteredSleep.length} nuit${filteredSleep.length > 1 ? 's' : ''}</div>

  <div class="sr">
    <div class="sc"><div class="sl">Durée moy.</div><div class="sv">${avgSleep}</div><div class="su">h / nuit</div></div>
    <div class="sc"><div class="sl">Objectif</div><div class="sv">${sleepGoal}</div><div class="su">h / nuit</div></div>
    <div class="sc"><div class="sl">Dette 7j</div><div class="sv" style="color:${(debt?.debt7d ?? 0) > 0 ? '#F57C00' : '#388E3C'}">${debt?.debt7d ?? 0}</div><div class="su">heures</div></div>
    <div class="sc"><div class="sl">Dette 14j</div><div class="sv" style="color:${(debt?.debt14d ?? 0) > 0 ? '#B71C1C' : '#388E3C'}">${debt?.debt14d ?? 0}</div><div class="su">heures</div></div>
  </div>

  <table class="dt">
    <thead><tr><th>Date</th><th>Coucher</th><th>Réveil</th><th>Durée</th><th>Vs objectif</th><th>Qualité</th><th>Note</th></tr></thead>
    <tbody>${sleepRows}</tbody>
  </table>
</div>
` : ''}

${hasInsulin ? `
<!-- ═══ INSULINE ═══ -->
<div class="sec">
  <div class="sh" style="background:linear-gradient(90deg,#4527A0,#7B1FA2)">💉 Insuline — ${filteredInsulin.length} injection${filteredInsulin.length > 1 ? 's' : ''}</div>
  <div class="sr">
    <div class="sc"><div class="sl">Rapide ⚡</div><div class="sv" style="color:#1565C0">${insulinTotals.rapide > 0 ? insulinTotals.rapide + ' u' : '—'}</div><div class="su">total période</div></div>
    <div class="sc"><div class="sl">Lente 🐢</div><div class="sv" style="color:#388E3C">${insulinTotals.lente > 0 ? insulinTotals.lente + ' u' : '—'}</div><div class="su">total période</div></div>
    <div class="sc"><div class="sl">Prémixée 🔀</div><div class="sv" style="color:#7B1FA2">${insulinTotals.premixte > 0 ? insulinTotals.premixte + ' u' : '—'}</div><div class="su">total période</div></div>
    <div class="sc"><div class="sl">Total</div><div class="sv">${(insulinTotals.rapide + insulinTotals.lente + insulinTotals.premixte).toFixed(1)} u</div><div class="su">toutes insulines</div></div>
  </div>
  <table class="dt">
    <thead><tr><th>Date / Heure</th><th>Dose</th><th>Type</th><th>Note</th></tr></thead>
    <tbody>${insulinRows}</tbody>
  </table>
</div>
` : ''}

<div class="ft">
  <div>Rapport généré par NikSanté v${appVersion} · Plage cible : 70–180 mg/dL (ADA/FID)</div>
  <div class="disc">Ce rapport est produit automatiquement à partir des données saisies par le patient. Il ne remplace pas un avis médical professionnel.</div>
</div>

</body>
</html>`;
}
