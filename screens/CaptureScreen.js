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
import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { API_URL, generateSessionId } from '../config';

// Recording phases that guide the user through a live walk-in
const RECORDING_PHASES = [
  { duration: 8,  prompt: 'Show the building entrance and signboard clearly' },
  { duration: 8,  prompt: 'Slowly walk inside the premises' },
  { duration: 8,  prompt: 'Pan across the office interior / workstations' },
  { duration: 6,  prompt: 'Hold your ID card towards the camera briefly' },
];

// Pre-flight check animation delays (ms)
const PREFLIGHT_DELAY_CAMERA  = 400;
const PREFLIGHT_DELAY_LOCATION = 400;
const PREFLIGHT_DELAY_NETWORK  = 600;

// Pre-flight checks
const CHECKS = [
  { id: 'camera',   label: 'Camera Access' },
  { id: 'location', label: 'GPS Location' },
  { id: 'network',  label: 'Network Reachable' },
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

  const cameraRef   = useRef(null);
  const accelData   = useRef([]);
  const gpsStart    = useRef(null);
  const gpsEnd      = useRef(null);
  const timerRef    = useRef(null);
  const phaseRef    = useRef(null);
  const sessionId   = useRef(generateSessionId()).current;

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
            {CHECKS.map((c, idx) => {
              const val = checks[c.id];
              return (
                <View key={c.id} style={s.checkRow}>
                  <View style={s.checkIconWrap}>
                    <Text style={s.checkIconText}>{idx + 1}</Text>
                  </View>
                  <Text style={s.checkLabel}>{c.label}</Text>
                  <Text style={[
                    s.checkStatus,
                    val === true  ? s.checkPass :
                    val === false ? s.checkFail : s.checkPending
                  ]}>
                    {val === true ? 'Ready' : val === false ? 'Failed' : '...'}
                  </Text>
                </View>
              );
            })}
          </View>

          {allPassed && (
            <>
              <View style={s.guideBox}>
                <Text style={s.guideTitle}>Recording Guide</Text>
                {RECORDING_PHASES.map((p, i) => (
                  <View key={i} style={s.guideRow}>
                    <View style={s.guideNum}><Text style={s.guideNumText}>{i + 1}</Text></View>
                    <Text style={s.guideStep}>{p.prompt} ({p.duration}s)</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity style={s.startBtn} onPress={() => { setPreflight(false); startRecording(); }}>
                <Text style={s.startBtnText}>Begin Recording</Text>
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
  const currentPhase = RECORDING_PHASES[phase] || RECORDING_PHASES[0];
  const phaseWidth   = phaseBar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={{ flex: 1 }}
        ref={cameraRef}
        facing="back"
        mode="video"
      >
        {/* Top bar */}
        <View style={s.topBar}>
          <Text style={s.bizName}>{businessName}</Text>
          <Text style={s.bizId}>{businessId}</Text>
        </View>

        {/* Recording indicator + GPS lock */}
        {recording && (
          <View style={s.recRow}>
            <View style={s.recDot} />
            <Text style={s.recText}>RECORDING</Text>
            {gpsStart.current && (
              <Text style={s.gpsLock}>
                {'  '}GPS Locked
              </Text>
            )}
          </View>
        )}

        {/* Phase guidance (during recording) */}
        {recording && (
          <View style={s.phaseBox}>
            <Text style={s.phasePrompt}>{currentPhase.prompt}</Text>
            <View style={s.phaseBarTrack}>
              <Animated.View style={[s.phaseBarFill, { width: phaseWidth }]} />
            </View>
            <Text style={s.phaseCount}>
              Step {phase + 1} / {RECORDING_PHASES.length}
            </Text>
          </View>
        )}

        {/* Countdown */}
        {recording && (
          <View style={s.countdownBox}>
            <Text style={s.countdown}>{countdown}</Text>
            <Text style={s.countdownSub}>seconds remaining</Text>
          </View>
        )}

        {/* Instructions (idle) */}
        {!recording && (
          <View style={s.instructions}>
            <View style={s.instrCard}>
              <Text style={s.instrHead}>Live Walk-in Verification</Text>
              <Text style={s.instrItem}>Point camera at business entrance</Text>
              <Text style={s.instrItem}>Ensure signboard is clearly visible</Text>
              <Text style={s.instrItem}>Walk inside premises during recording</Text>
              <Text style={s.instrItem}>30-second guided recording</Text>
            </View>
          </View>
        )}

        {/* Accelerometer indicator */}
        {recording && accelData.current.length > 0 && (
          <View style={s.sensorRow}>
            <Text style={s.sensorText}>
              Motion: {accelData.current.length} pts  |  {gpsStart.current ? 'GPS Active' : 'GPS Pending'}
            </Text>
          </View>
        )}

        {/* Bottom controls */}
        <View style={s.bottomBar}>
          {!recording ? (
            <TouchableOpacity style={s.preflightBtn} onPress={runPreflight} activeOpacity={0.8}>
              <Text style={s.preflightBtnText}>Start Verification</Text>
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
  checkIconWrap : { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1E3A5F', justifyContent: 'center', alignItems: 'center' },
  checkIconText : { color: '#60A5FA', fontSize: 12, fontWeight: '700' },
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
  topBar        : { backgroundColor: 'rgba(0,0,0,0.7)', padding: 16, paddingTop: 48 },
  bizName       : { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  bizId         : { color: '#94A3B8', fontSize: 13, marginTop: 2 },

  recRow        : { flexDirection: 'row', alignItems: 'center', padding: 12, paddingLeft: 16 },
  recDot        : { width: 12, height: 12, borderRadius: 6, backgroundColor: '#EF4444', marginRight: 8 },
  recText       : { color: '#EF4444', fontSize: 14, fontWeight: 'bold', letterSpacing: 2 },
  gpsLock       : { color: '#4ADE80', fontSize: 13, fontWeight: '600' },

  // Phase guidance
  phaseBox      : { backgroundColor: 'rgba(0,0,0,0.72)', marginHorizontal: 16, borderRadius: 14, padding: 16, alignItems: 'center' },
  phasePrompt   : { color: '#fff', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 10 },
  phaseBarTrack : { height: 4, backgroundColor: '#334155', borderRadius: 2, width: '100%', marginBottom: 6 },
  phaseBarFill  : { height: 4, backgroundColor: '#2563EB', borderRadius: 2 },
  phaseCount    : { color: '#94A3B8', fontSize: 12 },

  countdownBox  : { position: 'absolute', top: '38%', alignSelf: 'center', alignItems: 'center' },
  countdown     : { fontSize: 80, fontWeight: 'bold', color: '#FCD34D', textShadowColor: '#000', textShadowRadius: 10 },
  countdownSub  : { color: '#FCD34D', fontSize: 16, marginTop: -8 },

  instructions  : { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  instrCard     : { backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 16, padding: 20, width: '100%', gap: 10 },
  instrHead     : { color: '#60A5FA', fontSize: 16, fontWeight: 'bold', marginBottom: 6, textAlign: 'center' },
  instrItem     : { color: '#fff', fontSize: 14 },

  sensorRow     : { backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 14, paddingVertical: 6, alignSelf: 'center', borderRadius: 20, marginVertical: 6 },
  sensorText    : { color: '#94A3B8', fontSize: 11 },

  bottomBar     : { backgroundColor: 'rgba(0,0,0,0.7)', padding: 24, alignItems: 'center' },
  preflightBtn  : { backgroundColor: '#2563EB', paddingHorizontal: 40, paddingVertical: 16, borderRadius: 40, alignItems: 'center' },
  preflightBtnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  stopBtn       : { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  stopBtnInner  : { width: 40, height: 40, borderRadius: 6, backgroundColor: '#fff' },
  btnLabel      : { color: '#94A3B8', fontSize: 13, marginTop: 12 },
});
