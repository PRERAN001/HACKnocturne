// ═══════════════════════════════════════════════════════════════
//  Ghost Business Verifier — Live Liveness Challenge Screen
//  screens/LivenessChallengeScreen.js
//
//  Displays random camera instructions in real-time to prevent
//  prerecorded video submissions from passing verification.
//  Challenges cycle automatically with countdowns.
// ═══════════════════════════════════════════════════════════════
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  Animated, Easing
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useState, useRef, useEffect, useCallback } from 'react';

const CHALLENGE_DURATION = 5; // seconds per challenge

const ALL_CHALLENGES = [
  { id: 'move_left',     icon: '⬅️',  text: 'Move camera slowly to the LEFT',   color: '#3B82F6' },
  { id: 'move_right',    icon: '➡️',  text: 'Move camera slowly to the RIGHT',  color: '#3B82F6' },
  { id: 'move_up',       icon: '⬆️',  text: 'Tilt camera UPWARD',               color: '#3B82F6' },
  { id: 'move_down',     icon: '⬇️',  text: 'Tilt camera DOWNWARD',             color: '#3B82F6' },
  { id: 'show_entrance', icon: '🚪',  text: 'Show the shop ENTRANCE clearly',    color: '#F59E0B' },
  { id: 'zoom_signboard',icon: '🔍',  text: 'Zoom into the BUSINESS SIGNBOARD',  color: '#F59E0B' },
  { id: 'show_interior', icon: '🏢',  text: 'Pan across the BUSINESS INTERIOR',  color: '#8B5CF6' },
  { id: 'show_ceiling',  icon: '☁️',  text: 'Point camera toward the CEILING',   color: '#8B5CF6' },
  { id: 'show_floor',    icon: '📐',  text: 'Point camera toward the FLOOR',     color: '#8B5CF6' },
  { id: 'show_window',   icon: '🪟',  text: 'Show a nearby WINDOW or exit',      color: '#10B981' },
];

const NUM_CHALLENGES = 4;

function pickChallenges() {
  const shuffled = [...ALL_CHALLENGES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, NUM_CHALLENGES);
}

// ── Challenge overlay ─────────────────────────────────────────
function ChallengeOverlay({ challenge, timeLeft, challengeIndex, totalChallenges }) {
  const progress = timeLeft / CHALLENGE_DURATION;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 400, easing: Easing.ease, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 400, easing: Easing.ease, useNativeDriver: true }),
      ])
    ).start();
    return () => pulseAnim.stopAnimation();
  }, [challenge.id]);

  return (
    <View style={cs.overlay}>
      {/* Top status bar */}
      <View style={cs.statusBar}>
        <Text style={cs.statusText}>Challenge {challengeIndex + 1} of {totalChallenges}</Text>
        <View style={cs.liveIndicator}>
          <View style={cs.liveDot} />
          <Text style={cs.liveText}>LIVE</Text>
        </View>
      </View>

      {/* Spacer */}
      <View style={{ flex: 1 }} />

      {/* Challenge card */}
      <Animated.View style={[cs.challengeCard, { transform: [{ scale: pulseAnim }] }]}>
        <Text style={cs.challengeIcon}>{challenge.icon}</Text>
        <Text style={cs.challengeText}>{challenge.text}</Text>
        {/* Countdown bar */}
        <View style={cs.countdownBar}>
          <View style={[cs.countdownFill, { width: `${progress * 100}%`, backgroundColor: challenge.color }]} />
        </View>
        <Text style={[cs.countdownNum, { color: timeLeft <= 2 ? '#EF4444' : '#F8FAFC' }]}>
          {timeLeft}s
        </Text>
      </Animated.View>

      {/* Progress dots */}
      <View style={cs.dotsRow}>
        {Array.from({ length: totalChallenges }).map((_, i) => (
          <View
            key={i}
            style={[
              cs.dot,
              i < challengeIndex     && cs.dotDone,
              i === challengeIndex   && cs.dotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function LivenessChallengeScreen({ route, navigation }) {
  const params = route.params;
  const [permission, requestPermission] = useCameraPermissions();

  const [challenges]       = useState(() => pickChallenges());
  const [challengeIndex,   setChallengeIndex]   = useState(0);
  const [timeLeft,         setTimeLeft]         = useState(CHALLENGE_DURATION);
  const [phase,            setPhase]            = useState('intro'); // intro | running | done | failed
  const [failReason,       setFailReason]       = useState('');

  const timerRef  = useRef(null);
  const indexRef  = useRef(0);
  const timeRef   = useRef(CHALLENGE_DURATION);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const advanceChallenge = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = indexRef.current + 1;
    if (next >= challenges.length) {
      stopTimer();
      setPhase('done');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      indexRef.current = next;
      timeRef.current  = CHALLENGE_DURATION;
      setChallengeIndex(next);
      setTimeLeft(CHALLENGE_DURATION);
    }
  }, [challenges.length, stopTimer]);

  const startChallenges = useCallback(async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setFailReason('Camera permission is required for liveness verification.');
        setPhase('failed');
        return;
      }
    }
    setPhase('running');
    indexRef.current = 0;
    timeRef.current  = CHALLENGE_DURATION;
    setChallengeIndex(0);
    setTimeLeft(CHALLENGE_DURATION);

    timerRef.current = setInterval(() => {
      timeRef.current -= 1;
      setTimeLeft(timeRef.current);
      if (timeRef.current <= 0) {
        advanceChallenge();
      }
    }, 1000);
  }, [permission, requestPermission, advanceChallenge]);

  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  const handleContinue = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('BusinessDetails', {
      ...params,
      livenessCompleted: true,
      livenessChallenges: challenges.map(c => c.id),
    });
  };

  // ── Intro screen ───────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.scroll}>
          <View style={s.header}>
            <Text style={s.headerTitle}>🔴 Liveness Challenge</Text>
            <Text style={s.headerSub}>
              Follow {NUM_CHALLENGES} random camera instructions to prove you are
              physically present at the business location.
            </Text>
          </View>

          {/* Steps */}
          <View style={s.stepsRow}>
            {['Documents', 'Signboard', 'Exterior', 'Interior', 'Liveness'].map((step, i) => (
              <View key={step} style={s.stepItem}>
                <View style={[
                  s.stepCircle,
                  i === 4 && s.stepCircleActive,
                  i < 4 && s.stepCircleDone
                ]}>
                  <Text style={[s.stepNum, i <= 4 && s.stepNumActive]}>
                    {i < 4 ? '✓' : '5'}
                  </Text>
                </View>
                <Text style={[s.stepLabel, i === 4 && s.stepLabelActive]}>{step}</Text>
              </View>
            ))}
          </View>

          <View style={s.infoCard}>
            <Text style={s.infoTitle}>How it works</Text>
            <View style={s.infoItem}><Text style={s.infoNum}>1</Text><Text style={s.infoText}>The camera opens in live mode</Text></View>
            <View style={s.infoItem}><Text style={s.infoNum}>2</Text><Text style={s.infoText}>{NUM_CHALLENGES} random instructions appear one by one</Text></View>
            <View style={s.infoItem}><Text style={s.infoNum}>3</Text><Text style={s.infoText}>Follow each instruction within {CHALLENGE_DURATION} seconds</Text></View>
            <View style={s.infoItem}><Text style={s.infoNum}>4</Text><Text style={s.infoText}>All {NUM_CHALLENGES} challenges must be completed to proceed</Text></View>
          </View>

          <View style={s.warningCard}>
            <Text style={s.warningIcon}>⚠️</Text>
            <Text style={s.warningText}>
              Pre-recorded videos will be rejected. This challenge uses random
              instructions generated at verification time to prevent replay attacks.
            </Text>
          </View>

          <View style={s.sampleCard}>
            <Text style={s.sampleTitle}>Sample instructions you may see:</Text>
            {ALL_CHALLENGES.slice(0, 5).map(c => (
              <View key={c.id} style={s.sampleItem}>
                <Text style={s.sampleIcon}>{c.icon}</Text>
                <Text style={s.sampleText}>{c.text}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={s.startBtn} onPress={startChallenges} activeOpacity={0.8}>
            <Text style={s.startBtnText}>🎯  Start Liveness Challenge</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Failed screen ──────────────────────────────────────────
  if (phase === 'failed') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.centerContent}>
          <Text style={s.failIcon}>❌</Text>
          <Text style={s.failTitle}>Challenge Failed</Text>
          <Text style={s.failSub}>{failReason || 'An error occurred during the liveness challenge.'}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => setPhase('intro')} activeOpacity={0.8}>
            <Text style={s.retryBtnText}>↩ Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Success screen ─────────────────────────────────────────
  if (phase === 'done') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.centerContent}>
          <Text style={s.successIcon}>✅</Text>
          <Text style={s.successTitle}>All Challenges Passed!</Text>
          <Text style={s.successSub}>
            Liveness verification complete. You have successfully demonstrated
            your physical presence at the business location.
          </Text>
          <View style={s.challengeSummary}>
            {challenges.map((c, i) => (
              <View key={c.id} style={s.challengeSummaryItem}>
                <Text style={s.challengeSummaryIcon}>{c.icon}</Text>
                <Text style={s.challengeSummaryText}>{c.text}</Text>
                <Text style={s.challengeSummaryCheck}>✓</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={s.continueBtn} onPress={handleContinue} activeOpacity={0.8}>
            <Text style={s.continueBtnText}>Continue to Business Details  →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Running challenge ──────────────────────────────────────
  if (!permission?.granted) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.centerContent}>
          <Text style={s.failIcon}>📷</Text>
          <Text style={s.failTitle}>Camera Permission Required</Text>
          <TouchableOpacity style={s.retryBtn} onPress={requestPermission} activeOpacity={0.8}>
            <Text style={s.retryBtnText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView style={{ flex: 1 }} facing="back">
        <ChallengeOverlay
          challenge={challenges[challengeIndex]}
          timeLeft={timeLeft}
          challengeIndex={challengeIndex}
          totalChallenges={challenges.length}
        />
      </CameraView>
    </View>
  );
}

// ── Main styles ────────────────────────────────────────────────
const s = StyleSheet.create({
  safe          : { flex: 1, backgroundColor: '#0A0F1E' },
  scroll        : { flex: 1, padding: 20 },

  header        : { marginBottom: 20 },
  headerTitle   : { color: '#F8FAFC', fontSize: 24, fontWeight: 'bold', marginBottom: 6 },
  headerSub     : { color: '#94A3B8', fontSize: 14, lineHeight: 22 },

  stepsRow      : { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  stepItem      : { alignItems: 'center', flex: 1 },
  stepCircle    : { width: 30, height: 30, borderRadius: 15, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  stepCircleActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  stepCircleDone  : { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  stepNum       : { color: '#475569', fontSize: 13, fontWeight: 'bold' },
  stepNumActive : { color: '#fff' },
  stepLabel     : { color: '#475569', fontSize: 9, textAlign: 'center', fontWeight: '600' },
  stepLabelActive: { color: '#60A5FA' },

  infoCard      : { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
  infoTitle     : { color: '#F8FAFC', fontSize: 15, fontWeight: '700', marginBottom: 14 },
  infoItem      : { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  infoNum       : { width: 26, height: 26, borderRadius: 13, backgroundColor: '#2563EB', color: '#fff', fontSize: 13, fontWeight: 'bold', textAlign: 'center', lineHeight: 26 },
  infoText      : { color: '#94A3B8', fontSize: 14, flex: 1 },

  warningCard   : { backgroundColor: '#1A1200', borderRadius: 12, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderLeftWidth: 3, borderLeftColor: '#F59E0B' },
  warningIcon   : { fontSize: 16, marginTop: 1 },
  warningText   : { color: '#FCD34D', fontSize: 13, lineHeight: 20, flex: 1 },

  sampleCard    : { backgroundColor: '#172036', borderRadius: 12, padding: 14, marginBottom: 24, borderWidth: 1, borderColor: '#1E3A5F' },
  sampleTitle   : { color: '#60A5FA', fontSize: 12, fontWeight: '700', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  sampleItem    : { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  sampleIcon    : { fontSize: 18 },
  sampleText    : { color: '#94A3B8', fontSize: 13, flex: 1 },

  startBtn      : { backgroundColor: '#DC2626', padding: 16, borderRadius: 14, alignItems: 'center' },
  startBtnText  : { color: '#fff', fontSize: 17, fontWeight: 'bold' },

  centerContent : { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },

  failIcon      : { fontSize: 64, marginBottom: 16 },
  failTitle     : { color: '#F8FAFC', fontSize: 24, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  failSub       : { color: '#94A3B8', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  retryBtn      : { backgroundColor: '#2563EB', padding: 16, borderRadius: 14, paddingHorizontal: 32 },
  retryBtnText  : { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  successIcon   : { fontSize: 64, marginBottom: 16 },
  successTitle  : { color: '#4ADE80', fontSize: 24, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  successSub    : { color: '#94A3B8', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 },

  challengeSummary: { width: '100%', backgroundColor: '#1E293B', borderRadius: 14, padding: 14, marginBottom: 24, borderWidth: 1, borderColor: '#16A34A' },
  challengeSummaryItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#334155' },
  challengeSummaryIcon: { fontSize: 18 },
  challengeSummaryText: { color: '#94A3B8', fontSize: 13, flex: 1 },
  challengeSummaryCheck: { color: '#4ADE80', fontSize: 16, fontWeight: 'bold' },

  continueBtn   : { backgroundColor: '#2563EB', padding: 16, borderRadius: 14, alignItems: 'center', width: '100%' },
  continueBtnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});

// ── Camera overlay styles ──────────────────────────────────────
const cs = StyleSheet.create({
  overlay       : { flex: 1, justifyContent: 'space-between', paddingBottom: 40 },

  statusBar     : { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, backgroundColor: 'rgba(0,0,0,0.5)' },
  statusText    : { color: '#fff', fontSize: 14, fontWeight: '600' },
  liveIndicator : { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(220,38,38,0.8)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  liveDot       : { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  liveText      : { color: '#fff', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },

  challengeCard : { backgroundColor: 'rgba(0,0,0,0.82)', borderRadius: 20, marginHorizontal: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  challengeIcon : { fontSize: 52, marginBottom: 12 },
  challengeText : { color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, lineHeight: 28 },

  countdownBar  : { width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, marginBottom: 10, overflow: 'hidden' },
  countdownFill : { height: '100%', borderRadius: 3 },
  countdownNum  : { fontSize: 22, fontWeight: 'bold' },

  dotsRow       : { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 20 },
  dot           : { width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotActive     : { backgroundColor: '#fff', width: 28, borderRadius: 5 },
  dotDone       : { backgroundColor: '#4ADE80' },
});
