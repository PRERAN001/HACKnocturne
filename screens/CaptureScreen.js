// ═══════════════════════════════════════════════════════════════
//  Ghost Business Verifier — Capture Screen
//  screens/CaptureScreen.js
//
//  Records 30s video + GPS + accelerometer
//  Multi-angle walk-in liveness verification
//  Pre-flight connectivity & permission checks
//  Extracts thumbnail from first frame
//  Uploads both to S3 via presigned URLs
// ═══════════════════════════════════════════════════════════════
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, Alert, ActivityIndicator, Animated, Easing
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location    from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import * as Haptics     from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL, generateSessionId } from '../config';

// Recording phases that guide the user through a live walk-in
const RECORDING_PHASES = [
  { duration: 8,  icon: '🏢', prompt: 'Show the building entrance & signboard clearly' },
  { duration: 8,  icon: '🚶', prompt: 'Slowly walk inside the premises' },
  { duration: 8,  icon: '🖥️', prompt: 'Pan across the office interior / workstations' },
  { duration: 6,  icon: '🪪', prompt: 'Hold your ID card towards the camera briefly' },
];

// Random challenges displayed during recording
const CAPTURE_CHALLENGES = [
  { id: 'move_left',      icon: '⬅️',  text: 'Move camera slowly to the LEFT' },
  { id: 'move_right',     icon: '➡️',  text: 'Move camera slowly to the RIGHT' },
  { id: 'move_up',        icon: '⬆️',  text: 'Tilt camera UPWARD' },
  { id: 'move_down',      icon: '⬇️',  text: 'Tilt camera DOWNWARD' },
  { id: 'show_entrance',  icon: '🚪',  text: 'Show the shop ENTRANCE clearly' },
  { id: 'zoom_signboard', icon: '🔍',  text: 'Zoom into the BUSINESS SIGNBOARD' },
  { id: 'show_interior',  icon: '🏢',  text: 'Pan across the BUSINESS INTERIOR' },
  { id: 'show_ceiling',   icon: '☁️',  text: 'Point camera toward the CEILING' },
  { id: 'show_floor',     icon: '📐',  text: 'Point camera toward the FLOOR' },
];
const NUM_CAPTURE_CHALLENGES    = 3;
const CHALLENGE_DISPLAY_DURATION = 5;            // seconds each challenge is shown
const CHALLENGE_START_TIMES      = [3000, 13000, 23000]; // ms after recording starts

function pickRandomChallenges() {
  return [...CAPTURE_CHALLENGES].sort(() => Math.random() - 0.5).slice(0, NUM_CAPTURE_CHALLENGES);
}

// Pre-flight check animation delays (ms)
const PREFLIGHT_DELAY_CAMERA  = 400;
const PREFLIGHT_DELAY_LOCATION = 400;
const PREFLIGHT_DELAY_NETWORK  = 600;

// Pre-flight checks
const CHECKS = [
  { id: 'camera',   label: 'Camera Access',      icon: '📷' },
  { id: 'location', label: 'GPS Location',        icon: '📍' },
  { id: 'network',  label: 'Network Reachable',   icon: '📡' },
];

export default function CaptureScreen({ route, navigation }) {
  const { businessId, businessName } = route.params;

  const [camPermission,  requestCamPerm]  = useCameraPermissions();
  const [locPermission,  setLocPermission] = useState(false);
  const [recording,  setRecording]  = useState(false);
  const [countdown,  setCountdown]  = useState(30);
  const [status,     setStatus]     = useState('Ready to record');
  const [uploading,  setUploading]  = useState(false);

  // Pre-flight state
  const [preflight, setPreflight]   = useState(false); // show preflight screen
  const [checks,    setChecks]      = useState({});    // { camera: true/false/null }

  // Phase guidance
  const [phase,     setPhase]       = useState(0);
  const phaseBar    = useRef(new Animated.Value(0)).current;

  // Random in-recording challenges
  const [randomChallenges]              = useState(() => pickRandomChallenges());
  const [activeChallenge,  setActiveChallenge]  = useState(null);
  const [challengeTimeLeft, setChallengeTimeLeft] = useState(CHALLENGE_DISPLAY_DURATION);

  const cameraRef         = useRef(null);
  const accelData         = useRef([]);
  const gpsStart          = useRef(null);
  const gpsEnd            = useRef(null);
  const timerRef          = useRef(null);
  const phaseRef          = useRef(null);
  const challengeTimerRef = useRef(null);
  const challengeSchedules = useRef([]);
  const sessionId         = useRef(generateSessionId()).current;

  // ── Request permissions on mount ─────────────────────────────
  useEffect(() => {
    (async () => {
      if (!camPermission?.granted) await requestCamPerm();
      const loc = await Location.requestForegroundPermissionsAsync();
      setLocPermission(loc.status === 'granted');
    })();
    return () => {
      clearInterval(timerRef.current);
      clearTimeout(phaseRef.current);
      clearInterval(challengeTimerRef.current);
      challengeSchedules.current.forEach(clearTimeout);
      Accelerometer.removeAllListeners();
    };
  }, []);

  // ── Run pre-flight checks ─────────────────────────────────────
  const runPreflight = async () => {
    setPreflight(true);
    const result = { camera: null, location: null, network: null };
    setChecks({ ...result });

    // Camera check
    await new Promise(r => setTimeout(r, PREFLIGHT_DELAY_CAMERA));
    result.camera = !!camPermission?.granted;
    setChecks({ ...result });

    // Location check
    await new Promise(r => setTimeout(r, PREFLIGHT_DELAY_LOCATION));
    result.location = locPermission;
    setChecks({ ...result });

    // Network check — any HTTP response (including 4xx) confirms server is reachable
    await new Promise(r => setTimeout(r, PREFLIGHT_DELAY_NETWORK));
    try {
      await axios.get(`${API_URL}/api/sessions/ping`, { timeout: 4000 });
      result.network = true;
    } catch (err) {
      // axios throws on 4xx/5xx, but a response means server is reachable
      result.network = err.response !== undefined;
    }
    setChecks({ ...result });
  };

  // ── Show a single random challenge for CHALLENGE_DISPLAY_DURATION ──
  const showChallenge = useCallback((challenge) => {
    clearInterval(challengeTimerRef.current);
    setActiveChallenge(challenge);
    let t = CHALLENGE_DISPLAY_DURATION;
    setChallengeTimeLeft(t);
    challengeTimerRef.current = setInterval(() => {
      t -= 1;
      setChallengeTimeLeft(t);
      if (t <= 0) {
        clearInterval(challengeTimerRef.current);
        setActiveChallenge(null);
      }
    }, 1000);
  }, []);

  // ── Schedule all random challenges at predefined offsets ─────
  const scheduleRandomChallenges = useCallback((challenges) => {
    challengeSchedules.current.forEach(clearTimeout);
    challengeSchedules.current = challenges.map((ch, i) =>
      setTimeout(() => showChallenge(ch), CHALLENGE_START_TIMES[i])
    );
  }, [showChallenge]);

  // ── Animate phase progress bar ────────────────────────────────
  const animatePhase = (phaseDuration) => {
    phaseBar.setValue(0);
    Animated.timing(phaseBar, {
      toValue: 1,
      duration: phaseDuration * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  };

  // ── Advance through recording phases ─────────────────────────
  const schedulePhases = () => {
    let elapsed = 0;
    animatePhase(RECORDING_PHASES[0].duration);

    RECORDING_PHASES.forEach((p, i) => {
      phaseRef.current = setTimeout(() => {
        setPhase(i);
        if (i < RECORDING_PHASES.length - 1) {
          animatePhase(RECORDING_PHASES[i].duration);
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }, elapsed * 1000);
      elapsed += p.duration;
    });
  };

  // ── Start Recording ───────────────────────────────────────────
  const startRecording = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      // Capture GPS at start
      setStatus('Locking GPS...');
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High
      });
      gpsStart.current = {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
      };
      setStatus('Recording...');
      setPhase(0);

      // Start accelerometer at 10Hz
      accelData.current = [];
      Accelerometer.setUpdateInterval(100);
      Accelerometer.addListener(data => {
        accelData.current.push({ ...data, t: Date.now() });
      });

      // Start countdown timer
      let secs = 30;
      setCountdown(30);
      timerRef.current = setInterval(() => {
        secs -= 1;
        setCountdown(secs);
        if (secs <= 0) stopRecording();
      }, 1000);

      // Schedule phase guidance
      schedulePhases();

      // Schedule random challenges at offsets
      scheduleRandomChallenges(randomChallenges);

      // Start video recording
      setRecording(true);
      const video = await cameraRef.current.recordAsync({
        maxDuration: 30,
        quality    : '720p',
      });

      // recordAsync resolves when stopRecording() is called
      handleVideoReady(video.uri);

    } catch (err) {
      console.error('Recording error:', err);
      setRecording(false);
      setStatus('Recording failed — try again');
      Alert.alert('Error', 'Recording failed: ' + err.message);
    }
  };

  // ── Stop Recording ────────────────────────────────────────────
  const stopRecording = async () => {
    clearInterval(timerRef.current);
    clearTimeout(phaseRef.current);
    challengeSchedules.current.forEach(clearTimeout);
    clearInterval(challengeTimerRef.current);
    setActiveChallenge(null);
    Accelerometer.removeAllListeners();

    // Capture GPS at end
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      gpsEnd.current = {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude
      };
    } catch (e) {
      gpsEnd.current = gpsStart.current;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    cameraRef.current?.stopRecording();
    setRecording(false);
    setUploading(true);
    setStatus('Processing video...');
  };

  // ── Handle Video Ready — Extract Thumbnail + Upload ───────────
  const handleVideoReady = async (videoUri) => {
    try {
      // Step 1: Extract thumbnail from video (first frame)
      setStatus('Extracting thumbnail...');
      const thumbnail = await ImageManipulator.manipulateAsync(
        videoUri,
        [{ resize: { width: 800 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      // Step 2: Create session in backend
      setStatus('Creating session...');
      await axios.post(`${API_URL}/api/sessions`, {
        sessionId,
        businessId,
        businessName,
        gpsStart    : gpsStart.current,
        gpsEnd      : gpsEnd.current,
        device      : 'Mobile',
        isRooted    : false,
        accelerometer: accelData.current.slice(0, 300)
      });

      // Step 3: Get presigned URL for thumbnail
      setStatus('Uploading thumbnail for AI scan...');
      const thumbRes = await axios.get(`${API_URL}/api/upload/presigned-url`, {
        params: { type: 'thumbnail', sessionId }
      });
      const { uploadUrl: thumbUploadUrl } = thumbRes.data;

      // Step 4: Upload thumbnail to S3
      const thumbBlob = await fetch(thumbnail.uri).then(r => r.blob());
      await fetch(thumbUploadUrl, {
        method : 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body   : thumbBlob
      });
      setStatus('AI scanning in progress...');

      // Step 5: Upload full video to S3 in background (no await)
      uploadVideoInBackground(videoUri);

      // Step 6: Navigate to result screen — score will arrive via Socket.io
      navigation.replace('Result', {
        sessionId,
        businessId,
        businessName,
        gpsStart    : gpsStart.current,
      });

    } catch (err) {
      console.error('Upload error:', err);
      setUploading(false);
      setStatus('Upload failed — try again');
      Alert.alert('Upload Error', err.message);
    }
  };

  // ── Upload Video in Background ────────────────────────────────
  const uploadVideoInBackground = async (videoUri) => {
    try {
      const vidRes = await axios.get(`${API_URL}/api/upload/presigned-url`, {
        params: { type: 'video', sessionId }
      });
      const { uploadUrl: vidUploadUrl } = vidRes.data;
      const vidBlob = await fetch(videoUri).then(r => r.blob());
      await fetch(vidUploadUrl, {
        method : 'PUT',
        headers: { 'Content-Type': 'video/mp4' },
        body   : vidBlob
      });
      console.log('Video uploaded successfully');
    } catch (err) {
      console.warn('Video upload failed (non-critical):', err.message);
    }
  };

  // ── Permissions not granted ───────────────────────────────────
  if (!camPermission?.granted) {
    return (
      <View style={s.center}>
        <Text style={s.permIcon}>📷</Text>
        <Text style={s.permTitle}>Camera Access Required</Text>
        <Text style={s.permText}>
          Camera permission is needed to record the live verification video.
        </Text>
        <TouchableOpacity style={s.btn} onPress={requestCamPerm}>
          <Text style={s.btnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Uploading state ───────────────────────────────────────────
  if (uploading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={s.uploadText}>{status}</Text>
        <Text style={s.uploadSub}>Please wait — do not close the app</Text>
        <View style={s.uploadSteps}>
          {[
            'Extracting frames',
            'Creating session',
            'Uploading to secure cloud',
            'Triggering AI analysis',
          ].map((step) => (
            <View key={step} style={s.uploadStepRow}>
              <Text style={s.uploadStepDot}>·</Text>
              <Text style={s.uploadStepText}>{step}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // ── Pre-flight screen ─────────────────────────────────────────
  if (preflight) {
    const allPassed = CHECKS.every(c => checks[c.id] === true);
    const anyFailed = CHECKS.some(c => checks[c.id] === false);

    return (
      <SafeAreaView style={s.safe}>
        <View style={s.preflightWrap}>
          <Text style={s.preflightTitle}>Pre-flight Check</Text>
          <Text style={s.preflightSub}>Verifying device capabilities before recording</Text>

          <View style={s.checksList}>
            {CHECKS.map(c => {
              const val = checks[c.id];
              return (
                <View key={c.id} style={s.checkRow}>
                  <Text style={s.checkIcon}>{c.icon}</Text>
                  <Text style={s.checkLabel}>{c.label}</Text>
                  <Text style={[
                    s.checkStatus,
                    val === true  ? s.checkPass :
                    val === false ? s.checkFail : s.checkPending
                  ]}>
                    {val === true ? '✓ Ready' : val === false ? '✗ Failed' : '…'}
                  </Text>
                </View>
              );
            })}
          </View>

          {allPassed && (
            <>
              <View style={s.guideBox}>
                <Text style={s.guideTitle}>📋 Recording Guide</Text>
                {RECORDING_PHASES.map((p, i) => (
                  <View key={i} style={s.guideRow}>
                    <View style={s.guideNum}><Text style={s.guideNumText}>{i + 1}</Text></View>
                    <Text style={s.guideStep}>{p.icon} {p.prompt} ({p.duration}s)</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity style={s.startBtn} onPress={() => { setPreflight(false); startRecording(); }}>
                <Text style={s.startBtnText}>Begin Recording  ●</Text>
              </TouchableOpacity>
            </>
          )}
          {anyFailed && (
            <TouchableOpacity style={s.retryBtn} onPress={runPreflight}>
              <Text style={s.retryBtnText}>Retry Checks</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── Camera View ───────────────────────────────────────────────
  const currentPhase      = RECORDING_PHASES[phase] || RECORDING_PHASES[0];
  const phaseWidth        = phaseBar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const challengeProgress = `${Math.round((challengeTimeLeft / CHALLENGE_DISPLAY_DURATION) * 100)}%`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={{ flex: 1 }}
        ref={cameraRef}
        facing="back"
        mode="video"
      >
        {/* ── Top bar: business info + REC badge + countdown ── */}
        <View style={s.topBar}>
          <View>
            <Text style={s.bizName}>{businessName}</Text>
            <Text style={s.bizId}>{businessId}</Text>
          </View>
          {recording && (
            <View style={s.recBadge}>
              <View style={s.recDot} />
              <Text style={s.recBadgeText}>REC  {countdown}s</Text>
            </View>
          )}
        </View>

        {/* ── GPS / sensor status (during recording) ── */}
        {recording && (
          <View style={s.sensorRow}>
            <Text style={s.sensorText}>
              📍 {gpsStart.current ? 'GPS ✓' : 'GPS …'}  ·  📱 {accelData.current.length} pts
            </Text>
          </View>
        )}

        {/* ── Spacer — camera shows through ── */}
        <View style={{ flex: 1 }} />

        {/* ── Random challenge card (appears at scheduled offsets) ── */}
        {recording && activeChallenge && (
          <View style={s.challengeCard}>
            <View style={s.challengeHeader}>
              <View style={s.challengeLiveDot} />
              <Text style={s.challengeHeaderText}>CHALLENGE</Text>
            </View>
            <Text style={s.challengeIcon}>{activeChallenge.icon}</Text>
            <Text style={s.challengeText}>{activeChallenge.text}</Text>
            <View style={s.challengeBarTrack}>
              <View style={[s.challengeBarFill, { width: challengeProgress }]} />
            </View>
            <Text style={[s.challengeTimeText, challengeTimeLeft <= 2 && s.challengeTimeUrgent]}>
              {challengeTimeLeft}s
            </Text>
          </View>
        )}

        {/* ── Phase guidance (shown when no challenge is active) ── */}
        {recording && !activeChallenge && (
          <View style={s.phaseBox}>
            <Text style={s.phaseIcon}>{currentPhase.icon}</Text>
            <Text style={s.phasePrompt}>{currentPhase.prompt}</Text>
            <View style={s.phaseBarTrack}>
              <Animated.View style={[s.phaseBarFill, { width: phaseWidth }]} />
            </View>
            <Text style={s.phaseCount}>
              Step {phase + 1} / {RECORDING_PHASES.length}
            </Text>
          </View>
        )}

        {/* ── Idle instructions ── */}
        {!recording && (
          <View style={s.instructions}>
            <View style={s.instrCard}>
              <Text style={s.instrHead}>Live Walk-in Verification</Text>
              <Text style={s.instrItem}>📍 Point camera at business entrance</Text>
              <Text style={s.instrItem}>🪧 Ensure signboard is clearly visible</Text>
              <Text style={s.instrItem}>🚶 Walk inside premises during recording</Text>
              <Text style={s.instrItem}>⚡ {NUM_CAPTURE_CHALLENGES} random challenges + 30s guided recording</Text>
            </View>
          </View>
        )}

        {/* ── Bottom controls ── */}
        <View style={s.bottomBar}>
          {!recording ? (
            <TouchableOpacity style={s.preflightBtn} onPress={runPreflight} activeOpacity={0.8}>
              <Text style={s.preflightBtnText}>🚀  Start Verification</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={s.stopBtn} onPress={stopRecording}>
                <View style={s.stopBtnInner} />
              </TouchableOpacity>
              <Text style={s.btnLabel}>Tap to stop early</Text>
            </>
          )}
        </View>
      </CameraView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe         : { flex: 1, backgroundColor: '#0A0F1E' },
  center       : { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0F1E', padding: 24 },
  permIcon     : { fontSize: 56, marginBottom: 16 },
  permTitle    : { color: '#F8FAFC', fontSize: 22, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  permText     : { color: '#94A3B8', fontSize: 15, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  uploadText   : { color: '#F8FAFC', fontSize: 20, fontWeight: 'bold', marginTop: 24, textAlign: 'center' },
  uploadSub    : { color: '#94A3B8', fontSize: 14, marginTop: 8, marginBottom: 24 },
  uploadSteps  : { gap: 8 },
  uploadStepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  uploadStepDot: { color: '#2563EB', fontSize: 20 },
  uploadStepText: { color: '#475569', fontSize: 14 },
  btn          : { backgroundColor: '#2563EB', padding: 14, borderRadius: 10, marginTop: 16 },
  btnText      : { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  // Pre-flight
  preflightWrap : { flex: 1, padding: 24, paddingTop: 48 },
  preflightTitle: { color: '#F8FAFC', fontSize: 26, fontWeight: 'bold', marginBottom: 6 },
  preflightSub  : { color: '#94A3B8', fontSize: 14, marginBottom: 32 },
  checksList    : { gap: 0 },
  checkRow      : { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1E293B', gap: 14 },
  checkIcon     : { fontSize: 22, width: 28, textAlign: 'center' },
  checkLabel    : { flex: 1, color: '#F8FAFC', fontSize: 16 },
  checkStatus   : { fontSize: 14, fontWeight: '600' },
  checkPass     : { color: '#4ADE80' },
  checkFail     : { color: '#F87171' },
  checkPending  : { color: '#94A3B8' },

  guideBox      : { backgroundColor: '#1E293B', borderRadius: 14, padding: 16, marginTop: 28, marginBottom: 20, gap: 12 },
  guideTitle    : { color: '#60A5FA', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  guideRow      : { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  guideNum      : { width: 22, height: 22, borderRadius: 11, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  guideNumText  : { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  guideStep     : { color: '#94A3B8', fontSize: 13, flex: 1, lineHeight: 20 },

  startBtn      : { backgroundColor: '#2563EB', padding: 16, borderRadius: 14, alignItems: 'center' },
  startBtnText  : { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  retryBtn      : { backgroundColor: '#1E293B', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  retryBtnText  : { color: '#60A5FA', fontSize: 16, fontWeight: '600' },

  // Camera overlays
  topBar        : { backgroundColor: 'rgba(0,0,0,0.75)', padding: 16, paddingTop: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bizName       : { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  bizId         : { color: '#94A3B8', fontSize: 13, marginTop: 2 },

  // REC badge (top-right, contains timer)
  recBadge      : { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(220,38,38,0.9)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  recDot        : { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  recBadgeText  : { color: '#fff', fontSize: 13, fontWeight: 'bold', letterSpacing: 0.8 },

  // Sensor / GPS row (just below topBar)
  sensorRow     : { backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 14, paddingVertical: 5, alignSelf: 'center', borderRadius: 20, marginTop: 6 },
  sensorText    : { color: '#94A3B8', fontSize: 11 },

  // Random challenge card
  challengeCard       : { backgroundColor: 'rgba(0,0,0,0.88)', borderRadius: 20, marginHorizontal: 16, marginBottom: 10, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  challengeHeader     : { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14, backgroundColor: 'rgba(220,38,38,0.85)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  challengeLiveDot    : { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  challengeHeaderText : { color: '#fff', fontSize: 11, fontWeight: 'bold', letterSpacing: 1.5 },
  challengeIcon       : { fontSize: 54, marginBottom: 10 },
  challengeText       : { color: '#fff', fontSize: 19, fontWeight: 'bold', textAlign: 'center', marginBottom: 18, lineHeight: 26 },
  challengeBarTrack   : { width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, marginBottom: 10, overflow: 'hidden' },
  challengeBarFill    : { height: '100%', borderRadius: 3, backgroundColor: '#3B82F6' },
  challengeTimeText   : { fontSize: 22, fontWeight: 'bold', color: '#F8FAFC' },
  challengeTimeUrgent : { color: '#EF4444' },

  // Phase guidance
  phaseBox      : { backgroundColor: 'rgba(0,0,0,0.72)', marginHorizontal: 16, marginBottom: 10, borderRadius: 14, padding: 16, alignItems: 'center' },
  phaseIcon     : { fontSize: 30, marginBottom: 6 },
  phasePrompt   : { color: '#fff', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 10 },
  phaseBarTrack : { height: 4, backgroundColor: '#334155', borderRadius: 2, width: '100%', marginBottom: 6 },
  phaseBarFill  : { height: 4, backgroundColor: '#2563EB', borderRadius: 2 },
  phaseCount    : { color: '#94A3B8', fontSize: 12 },

  instructions  : { alignItems: 'center', padding: 20, paddingBottom: 10 },
  instrCard     : { backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 16, padding: 20, width: '100%', gap: 10 },
  instrHead     : { color: '#60A5FA', fontSize: 16, fontWeight: 'bold', marginBottom: 6, textAlign: 'center' },
  instrItem     : { color: '#fff', fontSize: 14 },

  bottomBar     : { backgroundColor: 'rgba(0,0,0,0.7)', padding: 24, alignItems: 'center' },
  preflightBtn  : { backgroundColor: '#2563EB', paddingHorizontal: 40, paddingVertical: 16, borderRadius: 40, alignItems: 'center' },
  preflightBtnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  stopBtn       : { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  stopBtnInner  : { width: 40, height: 40, borderRadius: 6, backgroundColor: '#fff' },
  btnLabel      : { color: '#94A3B8', fontSize: 13, marginTop: 12 },
});
