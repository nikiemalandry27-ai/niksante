/**
 * NikSanté — MedicalReportScreen
 *
 * Génère un vrai rapport PDF et l'envoie au médecin.
 *
 * Bouton 1 — "Télécharger / Partager le PDF"
 *   expo-print → génère le PDF  →  expo-sharing → feuille de partage native
 *
 * Bouton 2 — "Envoyer par email au médecin"
 *   expo-print → génère le PDF  →  expo-mail-composer → boîte mail native
 *   (destinataire pré-rempli + PDF en pièce jointe)
 *   Si expo-mail-composer indisponible → expo-sharing avec titre "Envoyer à …"
 *
 * Les deux modules sont des natifs compilés dans le build EAS.
 * Sur un ancien APK (sans ces natifs) : message d'erreur clair, pas de fallback texte.
 */

import { useState, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Print        from 'expo-print';
import * as Sharing      from 'expo-sharing';
import * as MailComposer from 'expo-mail-composer';
import * as FileSystem   from 'expo-file-system/legacy';

import { useAuthStore }     from '@/store/authStore';
import { useGlucoseStore }  from '@/store/glucoseStore';
import { useSleepStore }    from '@/store/sleepStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useInsulinStore }  from '@/store/insulinStore';
import { getTimeInRange, getConsistencyScore } from '@/utils/glucoseAnalysis';
import { computeSleepDebt } from '@/utils/insightEngine';
import {
  generateMedicalReportHTML,
  filterGlucoseByDays,
  filterSleepByDays,
  ReportPeriod,
} from '@/utils/pdfReport';
import {
  formatGlucose,
  unitLabel,
  formatDate,
  getGlucoseStatus,
  getStatusColor,
} from '@/utils/glucoseHelper';
import { MEAL_CONTEXT_META, MealContext } from '@/store/glucoseStore';
import { SLEEP_QUALITY_META } from '@/store/sleepStore';
import { ThemedText } from '@/components/themed-text';
import { s, fs, vs } from '@/utils/responsive';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const PERIODS: { value: ReportPeriod; label: string; desc: string }[] = [
  { value: 7,  label: '7 j',  desc: '7 derniers jours'  },
  { value: 14, label: '14 j', desc: '14 derniers jours' },
  { value: 30, label: '30 j', desc: '30 derniers jours' },
];

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function MedicalReportScreen() {
  const router = useRouter();

  const user           = useAuthStore(s => s.user);
  const glucoseHistory = useGlucoseStore(s => s.glucoseHistory);
  const sleepEntries   = useSleepStore(s => s.entries);
  const sleepGoal      = useSleepStore(s => s.sleepGoal);
  const glucoseUnit    = useSettingsStore(s => s.glucoseUnit);
  const insulinHistory = useInsulinStore(s => s.history);

  const [period,          setPeriod]          = useState<ReportPeriod>(14);
  const [doctorEmail,     setDoctorEmail]     = useState('');
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isSendingEmail,  setIsSendingEmail]  = useState(false);
  const [activeTab,       setActiveTab]       = useState<'glucose' | 'sleep'>('glucose');

  const ul = unitLabel(glucoseUnit);

  // ── Données filtrées pour aperçu ──────────────────────────────────────────

  const filteredGlucose = useMemo(
    () => filterGlucoseByDays(glucoseHistory, period),
    [glucoseHistory, period],
  );

  const filteredSleep = useMemo(
    () => filterSleepByDays(sleepEntries, period),
    [sleepEntries, period],
  );

  const tir    = useMemo(() => getTimeInRange(filteredGlucose),      [filteredGlucose]);
  const score  = useMemo(() => getConsistencyScore(filteredGlucose), [filteredGlucose]);
  const gValues  = filteredGlucose.map(e => e.value);
  const gAvg     = gValues.length > 0
    ? Math.round(gValues.reduce((a, b) => a + b, 0) / gValues.length)
    : null;
  const debt     = useMemo(
    () => filteredSleep.length > 0 ? computeSleepDebt(filteredSleep, sleepGoal) : null,
    [filteredSleep, sleepGoal],
  );
  const avgSleep = filteredSleep.length > 0
    ? Math.round(filteredSleep.reduce((a, b) => a + b.duration, 0) / filteredSleep.length * 10) / 10
    : null;

  const patientName  = user?.name  ?? '';
  const patientEmail = user?.email ?? '';

  // ── Génération HTML commun ────────────────────────────────────────────────

  const buildHTML = () => generateMedicalReportHTML({
    patientName,
    patientEmail,
    glucoseEntries: glucoseHistory,
    sleepEntries,
    insulinEntries: insulinHistory,
    sleepGoal,
    glucoseUnit,
    period,
  });

  const hasData = () => {
    if (filteredGlucose.length === 0 && filteredSleep.length === 0) {
      Alert.alert('Aucune donnée', 'Il n\'y a aucune donnée sur la période sélectionnée.');
      return false;
    }
    return true;
  };

  // ── Bouton 1 : Télécharger le PDF ────────────────────────────────────────

  const handleDownloadPDF = async () => {
    if (!hasData()) return;
    setIsGeneratingPDF(true);
    try {
      const html = buildHTML();
      const { base64 } = await Print.printToFileAsync({ html, base64: true });

      const fileName = `rapport_medical_niksante_${new Date().toISOString().split('T')[0]}.pdf`;
      const destUri  = (FileSystem.cacheDirectory ?? '') + fileName;

      // Écrire via base64 : évite tout accès à cache/Print/ (hors sandbox FileSystem)
      await FileSystem.writeAsStringAsync(destUri, base64 ?? '', {
        encoding: FileSystem.EncodingType.Base64,
      });

      await Sharing.shareAsync(destUri, {
        mimeType:    'application/pdf',
        dialogTitle: 'Enregistrer le rapport PDF',
        UTI:         'com.adobe.pdf',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Téléchargement impossible', msg);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // ── Bouton 2 : Envoyer par email au médecin ───────────────────────────────

  const handleSendByEmail = async () => {
    const email = doctorEmail.trim();
    if (!email) {
      Alert.alert('Email requis', 'Entrez l\'adresse email de votre médecin.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Email invalide', 'Vérifiez le format de l\'adresse email.');
      return;
    }
    if (!hasData()) return;

    setIsSendingEmail(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: buildHTML(), base64: false });

      // Essaie d'ouvrir directement la boîte mail native avec pièce jointe
      const mailAvailable = await MailComposer.isAvailableAsync();
      if (mailAvailable) {
        await MailComposer.composeAsync({
          recipients: [email],
          subject:    `Rapport médical NikSanté — ${patientName}`,
          body: [
            'Bonjour,',
            '',
            `Veuillez trouver en pièce jointe le rapport médical de ${patientName}`,
            `généré par NikSanté pour les ${period} derniers jours.`,
            '',
            'Ce rapport comprend :',
            '  • Les mesures glycémiques détaillées',
            '  • Les données de sommeil',
            '  • L\'analyse du Temps Dans la Cible (TIR)',
            '',
            'Cordialement,',
            patientName,
          ].join('\n'),
          attachments: [uri],
        });
      } else {
        // expo-mail-composer non disponible → feuille de partage native en dernier recours
        const canShare = await Sharing.isAvailableAsync();
        if (!canShare) {
          Alert.alert(
            'Envoi impossible',
            'Aucune application email compatible n\'a été trouvée sur cet appareil.',
          );
          return;
        }
        await Sharing.shareAsync(uri, {
          mimeType:    'application/pdf',
          dialogTitle: `Envoyer à ${email}`,
          UTI:         'com.adobe.pdf',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert(
        'Envoi impossible',
        msg.includes('ExpoPrint') || msg.includes('null')
          ? 'Cette fonctionnalité nécessite la dernière version de l\'application.'
          : msg,
      );
    } finally {
      setIsSendingEmail(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ThemedText style={styles.backText}>← Retour</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.title}>Rapport médical</ThemedText>
        <View style={{ width: s(70) }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Intro ── */}
        <View style={styles.introCard}>
          <ThemedText style={styles.introIcon}>🏥</ThemedText>
          <ThemedText style={styles.introTitle}>Rapport pour votre médecin</ThemedText>
          <ThemedText style={styles.introText}>
            Générez un rapport PDF complet de vos données glycémiques et de sommeil.
            Le PDF peut être partagé ou envoyé directement à votre médecin / endocrinologue.
          </ThemedText>
        </View>

        {/* ── Période ── */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Période couverte</ThemedText>
          <View style={styles.periodRow}>
            {PERIODS.map(p => (
              <TouchableOpacity
                key={p.value}
                style={[styles.periodBtn, period === p.value && styles.periodBtnActive]}
                onPress={() => setPeriod(p.value)}
              >
                <ThemedText style={[styles.periodLabel, period === p.value && styles.periodLabelActive]}>
                  {p.label}
                </ThemedText>
                <ThemedText style={[styles.periodDesc, period === p.value && styles.periodDescActive]}>
                  {p.desc}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Aperçu : onglets ── */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Aperçu des données</ThemedText>

          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'glucose' && styles.tabActive]}
              onPress={() => setActiveTab('glucose')}
            >
              <ThemedText style={[styles.tabText, activeTab === 'glucose' && styles.tabTextActive]}>
                🩸 Glycémie ({filteredGlucose.length})
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'sleep' && styles.tabActiveSleep]}
              onPress={() => setActiveTab('sleep')}
            >
              <ThemedText style={[styles.tabText, activeTab === 'sleep' && styles.tabTextActiveSleep]}>
                💤 Sommeil ({filteredSleep.length})
              </ThemedText>
            </TouchableOpacity>
          </View>

          {/* ── Glucose tab ── */}
          {activeTab === 'glucose' && (
            <View style={styles.tabContent}>
              {filteredGlucose.length === 0 ? (
                <ThemedText style={styles.noData}>Aucune mesure sur cette période.</ThemedText>
              ) : (
                <>
                  <View style={styles.statsRow}>
                    <MiniStat
                      label="Moyenne"
                      value={gAvg !== null ? `${formatGlucose(gAvg, glucoseUnit)} ${ul}` : '—'}
                      color="#388E3C"
                    />
                    <MiniStat label="TIR"      value={`${tir.inRange}%`} color="#1565C0" />
                    <MiniStat label="Contrôle" value={score.label}       color={score.color} />
                  </View>
                  <View style={styles.measureList}>
                    {[...filteredGlucose].reverse().map((e, i) => {
                      const status = getGlucoseStatus(e.value);
                      const col    = getStatusColor(status);
                      const emoji  = status === 'normal' ? '🟢' : status.includes('hypo') ? '🔵' : '🔴';
                      return (
                        <View key={i} style={[styles.measureRow, { borderLeftColor: col }]}>
                          <ThemedText style={styles.measureEmoji}>{emoji}</ThemedText>
                          <View style={styles.measureInfo}>
                            <ThemedText style={[styles.measureVal, { color: col }]}>
                              {formatGlucose(e.value, glucoseUnit)} {ul}
                            </ThemedText>
                            <ThemedText style={styles.measureDate}>{formatDate(e.date)}</ThemedText>
                          </View>
                          {e.mealContext ? (
                            <ThemedText style={styles.measureCtx}>
                              {MEAL_CONTEXT_META[e.mealContext as NonNullable<MealContext>].label}
                            </ThemedText>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
            </View>
          )}

          {/* ── Sleep tab ── */}
          {activeTab === 'sleep' && (
            <View style={styles.tabContent}>
              {filteredSleep.length === 0 ? (
                <ThemedText style={styles.noData}>Aucune donnée de sommeil sur cette période.</ThemedText>
              ) : (
                <>
                  <View style={styles.statsRow}>
                    <MiniStat label="Durée moy." value={`${avgSleep}h`}         color="#5E35B1" />
                    <MiniStat label="Objectif"    value={`${sleepGoal}h`}        color="#888" />
                    <MiniStat label="Dette 7j"    value={`${debt?.debt7d ?? 0}h`}
                      color={(debt?.debt7d ?? 0) > 0 ? '#F57C00' : '#388E3C'} />
                  </View>
                  <View style={styles.measureList}>
                    {[...filteredSleep].reverse().map((e, i) => {
                      const diff    = Math.round((e.duration - sleepGoal) * 10) / 10;
                      const diffStr = diff >= 0 ? `+${diff}h` : `${diff}h`;
                      const diffCol = diff >= 0 ? '#388E3C' : '#F57C00';
                      const qMeta   = SLEEP_QUALITY_META[e.quality];
                      return (
                        <View key={i} style={[styles.measureRow, { borderLeftColor: '#5E35B1' }]}>
                          <ThemedText style={styles.measureEmoji}>{qMeta.emoji}</ThemedText>
                          <View style={styles.measureInfo}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
                              <ThemedText style={[styles.measureVal, { color: '#5E35B1' }]}>
                                {e.duration}h
                              </ThemedText>
                              <ThemedText style={[styles.measureCtx, { color: diffCol }]}>
                                {diffStr}
                              </ThemedText>
                            </View>
                            <ThemedText style={styles.measureDate}>
                              {e.date} · {e.bedTime} → {e.wakeTime}
                            </ThemedText>
                          </View>
                          <ThemedText style={[styles.measureCtx, { color: qMeta.color }]}>
                            {qMeta.label}
                          </ThemedText>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
            </View>
          )}
        </View>

        {/* ── Email médecin ── */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Envoyer à votre médecin</ThemedText>
          <View style={styles.emailHintCard}>
            <ThemedText style={styles.emailHintText}>
              📎 Le rapport PDF sera joint automatiquement à l'email. Votre application de messagerie s'ouvrira avec le destinataire pré-rempli.
            </ThemedText>
          </View>
          <TextInput
            style={styles.emailInput}
            placeholder="medecin@cabinet.fr"
            placeholderTextColor="#BBB"
            value={doctorEmail}
            onChangeText={setDoctorEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.emailBtn, (!doctorEmail.trim() || isSendingEmail) && styles.btnDisabled]}
            onPress={handleSendByEmail}
            disabled={!doctorEmail.trim() || isSendingEmail}
          >
            {isSendingEmail
              ? <ActivityIndicator color="#fff" size="small" />
              : (
                <>
                  <ThemedText style={styles.emailBtnIcon}>📧</ThemedText>
                  <View>
                    <ThemedText style={styles.emailBtnText}>Envoyer par email</ThemedText>
                    <ThemedText style={styles.emailBtnSub}>PDF joint · destinataire pré-rempli</ThemedText>
                  </View>
                </>
              )
            }
          </TouchableOpacity>
        </View>

        {/* ── Bouton principal : Télécharger PDF ── */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.pdfBtn, isGeneratingPDF && styles.btnDisabled]}
            onPress={handleDownloadPDF}
            disabled={isGeneratingPDF}
          >
            {isGeneratingPDF
              ? <ActivityIndicator color="#fff" size="small" />
              : (
                <>
                  <ThemedText style={styles.pdfBtnIcon}>⬇️</ThemedText>
                  <View>
                    <ThemedText style={styles.pdfBtnText}>Télécharger le PDF</ThemedText>
                    <ThemedText style={styles.pdfBtnSub}>Sauvegarder sur l'appareil</ThemedText>
                  </View>
                </>
              )
            }
          </TouchableOpacity>
        </View>

        {/* ── Note légale ── */}
        <View style={styles.legalNote}>
          <ThemedText style={styles.legalText}>
            ⚠️ Ce rapport est généré à partir de vos données personnelles et ne remplace pas un diagnostic médical professionnel.
          </ThemedText>
        </View>

        <View style={{ height: vs(40) }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// MiniStat
// ---------------------------------------------------------------------------

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.miniStat}>
      <ThemedText style={styles.miniStatLbl}>{label}</ThemedText>
      <ThemedText style={[styles.miniStatVal, { color }]}>{value}</ThemedText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: s(20), paddingTop: vs(16), paddingBottom: vs(12),
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backBtn:  { padding: 4 },
  backText: { color: '#388E3C', fontWeight: '600', fontSize: fs(15) },
  title:    { fontSize: fs(17), fontWeight: 'bold', color: '#1a1a1a' },

  scroll: { paddingHorizontal: s(16), paddingTop: vs(16) },

  // Intro
  introCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: s(20),
    alignItems: 'center', marginBottom: vs(20),
    elevation: 2, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6,
    borderTopWidth: 4, borderTopColor: '#388E3C',
  },
  introIcon:  { fontSize: fs(36), marginBottom: vs(10) },
  introTitle: { fontSize: fs(16), fontWeight: 'bold', color: '#1a1a1a', marginBottom: vs(8), textAlign: 'center' },
  introText:  { fontSize: fs(13), color: '#666', textAlign: 'center', lineHeight: 20 },

  // Section
  section:      { marginBottom: vs(20) },
  sectionTitle: { fontSize: fs(12), fontWeight: '800', color: '#555', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: vs(10) },

  // Période
  periodRow: { flexDirection: 'row', gap: s(10) },
  periodBtn: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12,
    paddingVertical: vs(10), paddingHorizontal: s(8), alignItems: 'center',
    borderWidth: 2, borderColor: '#E0E0E0',
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2,
  },
  periodBtnActive:   { borderColor: '#388E3C', backgroundColor: '#F1F8F1' },
  periodLabel:       { fontSize: fs(14), fontWeight: 'bold', color: '#999' },
  periodLabelActive: { color: '#388E3C' },
  periodDesc:        { fontSize: fs(10), color: '#CCC', marginTop: vs(2) },
  periodDescActive:  { color: '#81C784' },

  // Onglets aperçu
  tabRow: { flexDirection: 'row', gap: s(8), marginBottom: vs(1) },
  tab: {
    flex: 1, paddingVertical: vs(10), alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E0E0E0',
  },
  tabActive:           { borderColor: '#388E3C', backgroundColor: '#F1F8F1' },
  tabActiveSleep:      { borderColor: '#5E35B1', backgroundColor: '#EDE7F6' },
  tabText:             { fontSize: fs(12), fontWeight: '700', color: '#AAA' },
  tabTextActive:       { color: '#388E3C' },
  tabTextActiveSleep:  { color: '#5E35B1' },
  tabContent: {
    backgroundColor: '#fff', borderRadius: 12, borderTopLeftRadius: 0, borderTopRightRadius: 0,
    overflow: 'hidden', borderWidth: 1, borderColor: '#E8E8E8', borderTopWidth: 0,
  },
  noData: {
    textAlign: 'center', color: '#CCC', fontStyle: 'italic',
    paddingVertical: vs(24), paddingHorizontal: s(20),
  },

  // Stats mini
  statsRow: { flexDirection: 'row', gap: s(8), padding: s(12), backgroundColor: '#FAFAFA' },
  miniStat: {
    flex: 1, backgroundColor: '#fff', borderRadius: 8,
    padding: s(10), alignItems: 'center',
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2,
  },
  miniStatLbl: { fontSize: fs(9), color: '#AAA', fontWeight: '700', textTransform: 'uppercase', marginBottom: vs(4) },
  miniStatVal: { fontSize: fs(15), fontWeight: 'bold' },

  // Liste mesures
  measureList: { paddingHorizontal: s(12), paddingBottom: s(12) },
  measureRow: {
    flexDirection: 'row', alignItems: 'center', gap: s(10),
    paddingVertical: vs(8), paddingHorizontal: s(10),
    borderLeftWidth: 3, marginVertical: vs(2),
    backgroundColor: '#FAFAFA', borderRadius: 6,
  },
  measureEmoji: { fontSize: fs(16), width: s(22) },
  measureInfo:  { flex: 1 },
  measureVal:   { fontSize: fs(14), fontWeight: 'bold' },
  measureDate:  { fontSize: fs(11), color: '#BBB', marginTop: vs(1) },
  measureCtx:   { fontSize: fs(10), color: '#AAA', fontWeight: '600' },

  // Email
  emailHintCard: {
    backgroundColor: '#E8F5E9', borderRadius: 10, padding: s(12),
    borderWidth: 1, borderColor: '#C8E6C9', marginBottom: vs(12),
  },
  emailHintText: { fontSize: fs(12), color: '#2E7D32', lineHeight: 18 },
  emailInput: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E0E0E0',
    paddingHorizontal: s(14), paddingVertical: vs(12),
    fontSize: fs(14), color: '#1a1a1a', marginBottom: vs(12),
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2,
  },
  emailBtn: {
    backgroundColor: '#5E35B1', borderRadius: 12, paddingVertical: vs(14),
    paddingHorizontal: s(16),
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: s(12),
    elevation: 2, shadowColor: '#5E35B1', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6,
  },
  emailBtnIcon: { fontSize: fs(22) },
  emailBtnText: { color: '#fff', fontWeight: '700', fontSize: fs(14) },
  emailBtnSub:  { color: '#CE93D8', fontSize: fs(10), marginTop: vs(1) },

  // PDF principal
  pdfBtn: {
    backgroundColor: '#388E3C', borderRadius: 14,
    paddingVertical: vs(16), paddingHorizontal: s(20),
    flexDirection: 'row', alignItems: 'center', gap: s(14),
    elevation: 3, shadowColor: '#388E3C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8,
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  pdfBtnIcon:  { fontSize: fs(28) },
  pdfBtnText:  { color: '#fff', fontWeight: 'bold', fontSize: fs(16) },
  pdfBtnSub:   { color: '#A5D6A7', fontSize: fs(11), marginTop: vs(2) },

  // Legal
  legalNote: {
    backgroundColor: '#FFFDE7', borderRadius: 10, padding: s(14),
    borderWidth: 1, borderColor: '#FFF59D',
  },
  legalText: { fontSize: fs(11), color: '#827717', lineHeight: 17 },
});
