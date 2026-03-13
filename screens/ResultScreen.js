// ═══════════════════════════════════════════════════════════════
//  Ghost Business Verifier — Result Screen
//  screens/ResultScreen.js
//
//  Listens for score via Socket.io
//  Shows trust score, status, AI labels
// ═══════════════════════════════════════════════════════════════
import {
  View, Text, StyleSheet, SafeAreaView,
  ActivityIndicator, TouchableOpacity, ScrollView
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { API_URL, SOCKET_URL } from '../config';

export default function ResultScreen({ route, navigation }) {
  const { sessionId, businessId, businessName, gpsStart } = route.params;

  const [score,    setScore]    = useState(null);
  const [status,   setStatus]   = useState(null);
  const [labels,   setLabels]   = useState([]);
  const [text,     setText]     = useState('');
  const [geoScore, setGeoScore] = useState(null);
  const [signScore,setSignScore]= useState(null);
  const [infraScore,setInfra]   = useState(null);
  const [isFlagged,setFlagged]  = useState(false);
  const [waitMsg,  setWaitMsg]  = useState('Connecting to AI pipeline...');
  const [elapsed,  setElapsed]  = useState(0);

  const socketRef = useRef(null);
  const timerRef  = useRef(null);

  useEffect(() => {
    // Elapsed timer so user knows something is happening
    timerRef.current = setInterval(() => {
      setElapsed(e => {
        const next = e + 1;
        if (next === 3)  setWaitMsg('Thumbnail uploaded. Rekognition scanning...');
        if (next === 8)  setWaitMsg('AI analysing signage and infrastructure...');
        if (next === 15) setWaitMsg('Computing trust score...');
        if (next === 25) setWaitMsg('Almost there...');
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
        setLabels(data.labels      || []);
        setText(data.textDetected  || 'NONE');
        setGeoScore(data.geoScore);
        setSignScore(data.signScore);
        setInfra(data.infraScore);
        setFlagged(data.isFlagged  || false);
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
          setLabels(s.aiResults?.labels     || []);
          setText(s.aiResults?.textDetected || 'NONE');
          setGeoScore(s.geoScore);
          setSignScore(s.signScore);
          setInfra(s.infraScore);
          setFlagged(s.aiResults?.isFlagged || false);
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

  // ── Score color ───────────────────────────────────────────────
  const scoreColor = !score ? '#94A3B8'
    : score >= 70 ? '#16A34A'
    : score >= 40 ? '#D97706'
    : '#DC2626';

  const statusBg = !status ? '#1E293B'
    : status === 'PASSED'  ? '#14532D'
    : status === 'REVIEW'  ? '#78350F'
    : '#7F1D1D';

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
          <Text style={s.elapsed}>{elapsed}s</Text>

          {/* Progress steps */}
          <View style={s.steps}>
            {[
              ['GPS Verification',      elapsed >= 1],
              ['Thumbnail Upload',      elapsed >= 3],
              ['Rekognition AI Scan',   elapsed >= 5],
              ['Trust Score Computed',  elapsed >= 15],
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
          <Text style={s.statusText}>
            {status === 'PASSED'  ? '✅' :
             status === 'REVIEW'  ? '⚠️' : '🚩'}
            {'  '}{status}
          </Text>
        </View>

        {/* Score breakdown */}
        <View style={s.breakdown}>
          <Text style={s.breakdownTitle}>Score Breakdown</Text>
          {[
            ['GPS Match (40%)',    geoScore !== null ? (geoScore === 1 ? '✓ Within 100m' : '✗ Outside range') : '-', geoScore === 1 ? '#16A34A' : '#DC2626'],
            ['Signage (30%)',      signScore !== null ? `${Math.round(signScore * 100)}%` : '-', '#2563EB'],
            ['Infrastructure (30%)', infraScore !== null ? `${Math.round(infraScore * 100)}%` : '-', '#7C3AED'],
          ].map(([label, val, col]) => (
            <View key={label} style={s.breakRow}>
              <Text style={s.breakLabel}>{label}</Text>
              <Text style={[s.breakVal, { color: col }]}>{val}</Text>
            </View>
          ))}
        </View>

        {/* Sign text detected */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Sign Text Detected</Text>
          <Text style={s.signText}>
            {text === 'NONE' ? '⚠️ No business sign detected' : `"${text}"`}
          </Text>
        </View>

        {/* AI Labels */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Objects Detected</Text>
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
          </View>
        )}

        {/* Session ID */}
        <Text style={s.sessionFooter}>Session ID: {sessionId}</Text>

        {/* New verification button */}
        <TouchableOpacity
          style={s.newBtn}
          onPress={() => navigation.navigate('Home')}
        >
          <Text style={s.newBtnText}>Start New Verification</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe          : { flex: 1, backgroundColor: '#0F172A' },
  scroll        : { padding: 24, paddingBottom: 48 },
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

  statusBadge   : { paddingHorizontal: 32, paddingVertical: 10, borderRadius: 24, alignSelf: 'center', marginBottom: 32 },
  statusText    : { color: '#fff', fontSize: 20, fontWeight: 'bold' },

  breakdown     : { backgroundColor: '#1E293B', borderRadius: 12, padding: 16, marginBottom: 16 },
  breakdownTitle: { color: '#94A3B8', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  breakRow      : { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#334155' },
  breakLabel    : { color: '#94A3B8', fontSize: 14 },
  breakVal      : { fontSize: 14, fontWeight: '600' },

  section       : { backgroundColor: '#1E293B', borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle  : { color: '#94A3B8', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  signText      : { color: '#F8FAFC', fontSize: 15, fontStyle: 'italic' },

  chips         : { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip          : { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  chipGood      : { backgroundColor: '#DBEAFE' },
  chipBad       : { backgroundColor: '#FEE2E2' },
  chipText      : { fontSize: 13, fontWeight: '500' },
  chipTextGood  : { color: '#1E3A5F' },
  chipTextBad   : { color: '#7F1D1D' },
  noLabels      : { color: '#475569', fontSize: 14 },

  flagBox       : { backgroundColor: '#450A0A', borderWidth: 1, borderColor: '#DC2626', borderRadius: 12, padding: 16, marginBottom: 16 },
  flagTitle     : { color: '#FCA5A5', fontSize: 15, fontWeight: 'bold', marginBottom: 6 },
  flagText      : { color: '#FCA5A5', fontSize: 13, lineHeight: 20 },

  gpsText       : { color: '#F8FAFC', fontSize: 14, fontFamily: 'monospace' },
  sessionFooter : { color: '#334155', fontSize: 11, textAlign: 'center', marginBottom: 24 },

  newBtn        : { backgroundColor: '#1E3A5F', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  newBtnText    : { color: '#60A5FA', fontSize: 16, fontWeight: '600' },
});
