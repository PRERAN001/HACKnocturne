// ═══════════════════════════════════════════════════════════════
//  Ghost Business Verifier — Result Screen
//  screens/ResultScreen.js
//
//  Listens for score via Socket.io
//  Shows trust score, status, AI labels
//  Deepfake detection, risk assessment, recommendations
//  Share verification report
// ═══════════════════════════════════════════════════════════════
import {
  View, Text, StyleSheet, SafeAreaView,
  ActivityIndicator, TouchableOpacity, ScrollView,
  Share, Alert
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { API_URL, SOCKET_URL } from '../config';
import { saveVerificationToHistory } from './HistoryScreen';

// ── Risk factor definitions ───────────────────────────────────
const RISK_FACTORS = [
  { key: 'noSignage',   label: 'No business signage detected',     weight: 'HIGH' },
  { key: 'residential', label: 'Residential objects found',        weight: 'HIGH' },
  { key: 'gpsOff',      label: 'GPS location mismatch',            weight: 'HIGH' },
  { key: 'lowInfra',    label: 'Insufficient office infrastructure', weight: 'MED'  },
  { key: 'lowSignConf', label: 'Low signage confidence score',     weight: 'MED'  },
  { key: 'shortVideo',  label: 'Incomplete walk-in recording',     weight: 'LOW'  },
];

// ── Recommendations by status ─────────────────────────────────
const RECOMMENDATIONS = {
  PASSED: [
    '✅ Business verified — onboarding can proceed',
    '📋 Keep verification report for compliance records',
    '🔄 Re-verify annually or after address change',
  ],
  REVIEW: [
    '⚠️ Manual review required before onboarding',
    '📞 Call business owner to confirm details',
    '🏢 Schedule an in-person field audit',
    '📄 Request additional address proof documents',
  ],
  FAILED: [
    '🚫 Do not proceed with onboarding',
    '🚩 Flag account for fraud investigation',
    '📧 Notify compliance & risk team immediately',
    '🔒 Freeze any pending transactions for this entity',
  ],
};

export default function ResultScreen({ route, navigation }) {
  const { sessionId, businessId, businessName, gpsStart } = route.params;

  const [score,      setScore]     = useState(null);
  const [status,     setStatus]    = useState(null);
  const [labels,     setLabels]    = useState([]);
  const [text,       setText]      = useState('');
  const [geoScore,   setGeoScore]  = useState(null);
  const [signScore,  setSignScore] = useState(null);
  const [infraScore, setInfra]     = useState(null);
  const [isFlagged,  setFlagged]   = useState(false);
  const [deepfake,   setDeepfake]  = useState(null);
  const [waitMsg,    setWaitMsg]   = useState('Connecting to AI pipeline...');
  const [elapsed,    setElapsed]   = useState(0);
  const [sharing,    setSharing]   = useState(false);

  const socketRef = useRef(null);
  const timerRef  = useRef(null);

  useEffect(() => {
    // Elapsed timer so user knows something is happening
    timerRef.current = setInterval(() => {
      setElapsed(e => {
        const next = e + 1;
        if (next === 3)  setWaitMsg('Thumbnail uploaded. Rekognition scanning...');
        if (next === 8)  setWaitMsg('AI analysing signage and infrastructure...');
        if (next === 15) setWaitMsg('Running deepfake detection model...');
        if (next === 22) setWaitMsg('Computing trust score...');
        if (next === 30) setWaitMsg('Almost there...');
        return next;
      });
    }, 1000);

    // Connect Socket.io
    const socket = io(SOCKET_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
    });

    // Listen for score result
    socket.on('session_complete', (data) => {
      console.log('Score received:', data);
      if (data.sessionId === sessionId) {
        clearInterval(timerRef.current);
        setScore(data.trustScore);
        setStatus(data.status);
        setLabels(data.labels       || []);
        setText(data.textDetected   || 'NONE');
        setGeoScore(data.geoScore);
        setSignScore(data.signScore);
        setInfra(data.infraScore);
        setFlagged(data.isFlagged   || false);
        setDeepfake(data.deepfakeScore ?? null);
        // Save to local history
        saveVerificationToHistory({
          sessionId,
          businessId,
          businessName,
          score       : data.trustScore,
          status      : data.status,
          timestamp   : Date.now(),
        });
      }
    });

    // Fallback: poll backend after 20 seconds if socket didn't fire
    const fallback = setTimeout(async () => {
      if (score !== null) return;
      try {
        const res = await axios.get(`${API_URL}/api/sessions/${sessionId}`);
        const s   = res.data;
        if (s.trustScore !== null && s.status !== 'PENDING') {
          clearInterval(timerRef.current);
          setScore(s.trustScore);
          setStatus(s.status);
          setLabels(s.aiResults?.labels      || []);
          setText(s.aiResults?.textDetected  || 'NONE');
          setGeoScore(s.geoScore);
          setSignScore(s.signScore);
          setInfra(s.infraScore);
          setFlagged(s.aiResults?.isFlagged  || false);
          setDeepfake(s.deepfakeScore ?? null);
          // Save to local history
          saveVerificationToHistory({
            sessionId,
            businessId,
            businessName,
            score    : s.trustScore,
            status   : s.status,
            timestamp: Date.now(),
          });
        }
      } catch (e) {
        console.warn('Fallback poll failed:', e.message);
      }
    }, 20000);

    return () => {
      socket.disconnect();
      clearInterval(timerRef.current);
      clearTimeout(fallback);
    };
  }, []);

  // ── Compute active risk factors ───────────────────────────────
  const activeRisks = score !== null ? RISK_FACTORS.filter(r => {
    if (r.key === 'noSignage')   return text === 'NONE';
    if (r.key === 'residential') return isFlagged;
    if (r.key === 'gpsOff')      return geoScore !== null && geoScore !== 1;
    if (r.key === 'lowInfra')    return infraScore !== null && infraScore < 0.4;
    if (r.key === 'lowSignConf') return signScore !== null && signScore < 0.3;
    return false;
  }) : [];

  // ── Share report ──────────────────────────────────────────────
  const shareReport = async () => {
    setSharing(true);
    try {
      const timestamp = new Date().toLocaleString();
      const gpsLine = gpsStart
        ? `GPS: ${gpsStart.lat.toFixed(6)}, ${gpsStart.lng.toFixed(6)}`
        : 'GPS: Not captured';

      const report = [
        '═══════════════════════════════',
        '  GHOST VERIFIER — AI REPORT',
        '═══════════════════════════════',
        `Business : ${businessName}`,
        `ID       : ${businessId}`,
        `Session  : ${sessionId}`,
        `Date     : ${timestamp}`,
        '',
        `TRUST SCORE : ${score} / 100`,
        `STATUS      : ${status}`,
        '',
        '── Score Breakdown ─────────────',
        `GPS Match    (40%) : ${geoScore === 1 ? 'PASS ✓' : 'FAIL ✗'}`,
        `Signage      (30%) : ${signScore !== null ? Math.round(signScore * 100) + '%' : '-'}`,
        `Infrastructure(30%): ${infraScore !== null ? Math.round(infraScore * 100) + '%' : '-'}`,
        deepfake !== null ? `Deepfake Risk      : ${deepfake < 0.3 ? 'LOW ✓' : deepfake < 0.6 ? 'MEDIUM ⚠️' : 'HIGH 🚩'}` : '',
        '',
        '── Sign Text ───────────────────',
        text === 'NONE' ? 'No business sign detected' : `"${text}"`,
        '',
        gpsLine,
        '',
        activeRisks.length > 0
          ? '── Risk Flags ──────────────────\n' + activeRisks.map(r => `• [${r.weight}] ${r.label}`).join('\n')
          : '── No Risk Flags ───────────────',
        '',
        '═══════════════════════════════',
        'Powered by Ghost Verifier · AWS Rekognition + SageMaker',
      ].filter(Boolean).join('\n');

      await Share.share({ message: report, title: `Ghost Verifier Report — ${businessName}` });
    } catch (e) {
      Alert.alert('Share Error', e.message);
    } finally {
      setSharing(false);
    }
  };

  // ── Score color ───────────────────────────────────────────────
  const scoreColor = !score ? '#94A3B8'
    : score >= 70 ? '#16A34A'
    : score >= 40 ? '#D97706'
    : '#DC2626';

  const statusBg = !status ? '#1E293B'
    : status === 'PASSED'  ? '#14532D'
    : status === 'REVIEW'  ? '#78350F'
    : '#7F1D1D';

  const statusEmoji = status === 'PASSED' ? '✅' : status === 'REVIEW' ? '⚠️' : '🚩';

  // ── Flag labels ───────────────────────────────────────────────
  const FLAG_LABELS = ['Bed','Pillow','Bedroom','Couch','Sofa','Kitchen','Bathroom'];
  const isNegative  = l => FLAG_LABELS.includes(l);

  // ── Waiting screen ────────────────────────────────────────────
  if (score === null) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <ActivityIndicator size="large" color="#2563EB" style={{ marginBottom: 24 }} />
          <Text style={s.waitTitle}>Analysing Business</Text>
          <Text style={s.waitMsg}>{waitMsg}</Text>
          <Text style={s.elapsed}>{elapsed}s elapsed</Text>

          {/* Progress steps */}
          <View style={s.steps}>
            {[
              ['GPS Verification',       elapsed >= 1],
              ['Thumbnail Upload',       elapsed >= 3],
              ['Rekognition AI Scan',    elapsed >= 5],
              ['Deepfake Detection',     elapsed >= 15],
              ['Trust Score Computed',   elapsed >= 22],
            ].map(([label, done]) => (
              <View key={label} style={s.stepRow}>
                <Text style={[s.stepDot, done && s.stepDotDone]}>
                  {done ? '✓' : '○'}
                </Text>
                <Text style={[s.stepLabel, done && s.stepLabelDone]}>{label}</Text>
              </View>
            ))}
          </View>

          <Text style={s.sessionId}>Session: {sessionId}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Result screen ─────────────────────────────────────────────
  const recs = RECOMMENDATIONS[status] || RECOMMENDATIONS.REVIEW;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>

        {/* Business name */}
        <Text style={s.bizName}>{businessName}</Text>
        <Text style={s.bizId}>{businessId}</Text>

        {/* Score ring */}
        <View style={[s.scoreBox, { borderColor: scoreColor }]}>
          <Text style={[s.score, { color: scoreColor }]}>{score}</Text>
          <Text style={s.scoreLabel}>Trust Score</Text>
        </View>

        {/* Status badge */}
        <View style={[s.statusBadge, { backgroundColor: statusBg }]}>
          <Text style={s.statusText}>{statusEmoji}{'  '}{status}</Text>
        </View>

        {/* Score breakdown */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Score Breakdown</Text>
          {[
            ['GPS Match (40%)',       geoScore !== null ? (geoScore === 1 ? '✓ Within 100m' : '✗ Outside range') : '-', geoScore === 1 ? '#16A34A' : '#DC2626'],
            ['Signage (30%)',         signScore !== null ? `${Math.round(signScore * 100)}%` : '-', '#2563EB'],
            ['Infrastructure (30%)', infraScore !== null ? `${Math.round(infraScore * 100)}%` : '-', '#7C3AED'],
          ].map(([label, val, col]) => (
            <View key={label} style={s.breakRow}>
              <Text style={s.breakLabel}>{label}</Text>
              <Text style={[s.breakVal, { color: col }]}>{val}</Text>
            </View>
          ))}
        </View>

        {/* Deepfake Detection */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Deepfake / Liveness Detection</Text>
          {deepfake !== null ? (
            <View style={s.deepfakeRow}>
              <View style={[s.deepfakeBadge, {
                backgroundColor:
                  deepfake < 0.3 ? '#14532D' :
                  deepfake < 0.6 ? '#78350F' : '#7F1D1D'
              }]}>
                <Text style={s.deepfakeBadgeText}>
                  {deepfake < 0.3 ? '✓ Authentic Video' :
                   deepfake < 0.6 ? '⚠️ Review Needed' :
                   '🚩 Possible Deepfake'}
                </Text>
              </View>
              <Text style={s.deepfakeScore}>
                Risk: {Math.round(deepfake * 100)}%
              </Text>
            </View>
          ) : (
            <Text style={s.naText}>Deepfake analysis powered by AWS SageMaker</Text>
          )}
          <Text style={s.deepfakeNote}>
            Analyzes video consistency, lighting, motion artifacts and temporal patterns
          </Text>
        </View>

        {/* Risk Assessment */}
        {activeRisks.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Risk Factors Detected</Text>
            {activeRisks.map(r => (
              <View key={r.key} style={s.riskRow}>
                <View style={[s.riskBadge,
                  r.weight === 'HIGH' ? s.riskHigh :
                  r.weight === 'MED'  ? s.riskMed  : s.riskLow
                ]}>
                  <Text style={s.riskBadgeText}>{r.weight}</Text>
                </View>
                <Text style={s.riskLabel}>{r.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Sign text detected */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Sign Text Detected</Text>
          <Text style={s.signText}>
            {text === 'NONE' ? '⚠️ No business sign detected' : `"${text}"`}
          </Text>
        </View>

        {/* AI Labels */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Objects Detected (Rekognition)</Text>
          <View style={s.chips}>
            {labels.map(l => (
              <View key={l} style={[s.chip, isNegative(l) ? s.chipBad : s.chipGood]}>
                <Text style={[s.chipText, isNegative(l) ? s.chipTextBad : s.chipTextGood]}>
                  {isNegative(l) ? '⚠️ ' : '✓ '}{l}
                </Text>
              </View>
            ))}
            {labels.length === 0 && (
              <Text style={s.noLabels}>No objects detected</Text>
            )}
          </View>
        </View>

        {/* Flagged warning */}
        {isFlagged && (
          <View style={s.flagBox}>
            <Text style={s.flagTitle}>🚩 Residential Indicators Found</Text>
            <Text style={s.flagText}>
              AI detected residential objects (Bed, Sofa, Kitchen etc).
              This business may be operating from a residential address.
            </Text>
          </View>
        )}

        {/* GPS info */}
        {gpsStart && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>GPS Captured</Text>
            <Text style={s.gpsText}>
              {gpsStart.lat.toFixed(6)}, {gpsStart.lng.toFixed(6)}
            </Text>
            {gpsStart.accuracy && (
              <Text style={s.gpsAccuracy}>Accuracy: ±{Math.round(gpsStart.accuracy)}m</Text>
            )}
          </View>
        )}

        {/* Recommendations */}
        <View style={[s.section, s.recSection]}>
          <Text style={s.sectionTitle}>Recommended Actions</Text>
          {recs.map(rec => (
            <Text key={rec} style={s.recItem}>{rec}</Text>
          ))}
        </View>

        {/* Session ID */}
        <Text style={s.sessionFooter}>Session ID: {sessionId}</Text>

        {/* Action buttons */}
        <TouchableOpacity
          style={s.shareBtn}
          onPress={shareReport}
          disabled={sharing}
          activeOpacity={0.8}
        >
          {sharing
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.shareBtnText}>📤  Share Verification Report</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={s.newBtn}
          onPress={() => navigation.navigate('Home')}
          activeOpacity={0.8}
        >
          <Text style={s.newBtnText}>Start New Verification</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe          : { flex: 1, backgroundColor: '#0A0F1E' },
  scroll        : { padding: 20, paddingBottom: 48 },
  center        : { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },

  // Waiting
  waitTitle     : { color: '#F8FAFC', fontSize: 22, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  waitMsg       : { color: '#94A3B8', fontSize: 15, textAlign: 'center', marginBottom: 8 },
  elapsed       : { color: '#475569', fontSize: 13, marginBottom: 32 },
  steps         : { width: '100%', gap: 12 },
  stepRow       : { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepDot       : { color: '#475569', fontSize: 18, width: 24, textAlign: 'center' },
  stepDotDone   : { color: '#16A34A' },
  stepLabel     : { color: '#475569', fontSize: 15 },
  stepLabelDone : { color: '#F8FAFC' },
  sessionId     : { color: '#334155', fontSize: 11, marginTop: 32 },

  // Result
  bizName       : { color: '#94A3B8', fontSize: 14, textAlign: 'center', marginBottom: 2 },
  bizId         : { color: '#475569', fontSize: 12, textAlign: 'center', marginBottom: 24 },

  scoreBox      : { width: 160, height: 160, borderRadius: 80, borderWidth: 6, justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 16 },
  score         : { fontSize: 64, fontWeight: 'bold' },
  scoreLabel    : { color: '#94A3B8', fontSize: 13 },

  statusBadge   : { paddingHorizontal: 32, paddingVertical: 10, borderRadius: 24, alignSelf: 'center', marginBottom: 28 },
  statusText    : { color: '#fff', fontSize: 20, fontWeight: 'bold' },

  // Sections
  section       : { backgroundColor: '#1E293B', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#334155' },
  sectionTitle  : { color: '#94A3B8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 },

  // Score breakdown
  breakRow      : { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#334155' },
  breakLabel    : { color: '#94A3B8', fontSize: 14 },
  breakVal      : { fontSize: 14, fontWeight: '600' },

  // Deepfake
  deepfakeRow   : { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  deepfakeBadge : { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  deepfakeBadgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  deepfakeScore : { color: '#94A3B8', fontSize: 14 },
  deepfakeNote  : { color: '#475569', fontSize: 12, lineHeight: 18, marginTop: 4 },
  naText        : { color: '#475569', fontSize: 13, fontStyle: 'italic', marginBottom: 8 },

  // Risk assessment
  riskRow       : { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#334155' },
  riskBadge     : { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  riskBadgeText : { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  riskHigh      : { backgroundColor: '#7F1D1D' },
  riskMed       : { backgroundColor: '#78350F' },
  riskLow       : { backgroundColor: '#1E3A5F' },
  riskLabel     : { color: '#FCA5A5', fontSize: 13, flex: 1 },

  // Signage
  signText      : { color: '#F8FAFC', fontSize: 15, fontStyle: 'italic' },

  // Labels
  chips         : { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip          : { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  chipGood      : { backgroundColor: '#1E3A5F' },
  chipBad       : { backgroundColor: '#450A0A' },
  chipText      : { fontSize: 13, fontWeight: '500' },
  chipTextGood  : { color: '#93C5FD' },
  chipTextBad   : { color: '#FCA5A5' },
  noLabels      : { color: '#475569', fontSize: 14 },

  // Flag box
  flagBox       : { backgroundColor: '#450A0A', borderWidth: 1, borderColor: '#DC2626', borderRadius: 14, padding: 16, marginBottom: 14 },
  flagTitle     : { color: '#FCA5A5', fontSize: 15, fontWeight: 'bold', marginBottom: 6 },
  flagText      : { color: '#FCA5A5', fontSize: 13, lineHeight: 20 },

  // GPS
  gpsText       : { color: '#F8FAFC', fontSize: 14, fontFamily: 'monospace' },
  gpsAccuracy   : { color: '#475569', fontSize: 12, marginTop: 4 },

  // Recommendations
  recSection    : { borderLeftWidth: 3, borderLeftColor: '#2563EB' },
  recItem       : { color: '#94A3B8', fontSize: 13, lineHeight: 22 },

  sessionFooter : { color: '#334155', fontSize: 11, textAlign: 'center', marginBottom: 16, marginTop: 4 },

  // Buttons
  shareBtn      : { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', padding: 15, borderRadius: 14, alignItems: 'center', marginBottom: 12 },
  shareBtnText  : { color: '#60A5FA', fontSize: 16, fontWeight: '600' },
  newBtn        : { backgroundColor: '#1E3A5F', padding: 15, borderRadius: 14, alignItems: 'center' },
  newBtnText    : { color: '#60A5FA', fontSize: 15, fontWeight: '600' },
});
