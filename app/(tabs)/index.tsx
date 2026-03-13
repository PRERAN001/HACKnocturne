// ═══════════════════════════════════════════════════════════════
//  Ghost Business Verifier — Combined Index
//  app/(tabs)/index.tsx (or simply index.tsx)
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, Alert,
  ActivityIndicator, ScrollView
} from 'react-native';
import { useSession } from '../SessionContext';
// Expo & External Imports
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import axios from 'axios';
import { io } from 'socket.io-client';

// ⚠️ Note: Adjust this import path to match where your config file is located
import { API_URL, SOCKET_URL, generateSessionId } from '../../config';

// ───────────────────────────────────────────────────────────────
//  MAIN COMPONENT (State Manager)
// ───────────────────────────────────────────────────────────────
export default function IndexScreen() {
  const [currentScreen, setCurrentScreen] = useState('home'); 
  const { setSessionId: setGlobalSessionId, setBusinessId: setGlobalBusinessId } = useSession();
  
  // Shared State
  // businessId here is the real DB businessId (from login API), NOT the GST number
  const [businessId, setBusinessId] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [gpsStart, setGpsStart] = useState<GpsPoint | null>(null);

  // Called after login when NO pending audit — proceed to camera
  const handleStartCapture = (id: string, name: string) => {
    setBusinessId(id);
    setBusinessName(name);
    setGlobalBusinessId(id);
    setCurrentScreen('capture');
  };

  // Called after login when a pending audit IS found.
  // Sets globalBusinessId so AuditOverlay (in _layout.tsx) triggers its Modal.
  // Does NOT navigate away — the Modal overlays whatever screen is active.
  const handlePendingAudit = (id: string, name: string) => {
    setBusinessId(id);
    setBusinessName(name);
    setGlobalBusinessId(id);
    // stay on 'home' — AuditOverlay covers the screen via its Modal
  };

  const handleCaptureComplete = (session: string, gps: { lat: number; lng: number } | null) => {
    setSessionId(session);
    setGlobalSessionId(session);
    setGpsStart(gps);
    setCurrentScreen('result');
  };

  const handleRestart = () => {
    setBusinessId('');
    setBusinessName('');
    setSessionId('');
    setGlobalSessionId(null);
    // ✅ CHANGE: do NOT clear globalBusinessId on restart — the business is still
    // the same logged-in entity, so AuditOverlay must keep listening for their audits
    setGpsStart(null);
    setCurrentScreen('home');
  };

  if (currentScreen === 'home') {
    return <HomeView onStart={handleStartCapture} onPendingAudit={handlePendingAudit} />;
  }

  if (currentScreen === 'capture') {
    return (
      <CaptureView 
        businessId={businessId} 
        businessName={businessName} 
        onComplete={handleCaptureComplete} 
      />
    );
  }

  if (currentScreen === 'result') {
    return (
      <ResultView 
        sessionId={sessionId}
        businessId={businessId}
        businessName={businessName}
        gpsStart={gpsStart}
        onRestart={handleRestart}
      />
    );
  }

  return null;
}

// ───────────────────────────────────────────────────────────────
//  HOME VIEW (Updated with Verification Logic)
// ───────────────────────────────────────────────────────────────
function HomeView({
  onStart,
  onPendingAudit,
}: {
  onStart: (id: string, name: string) => void;
  onPendingAudit: (id: string, name: string) => void;
}) {
  const [localId, setLocalId] = useState('');
  const [localName, setLocalName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Verifying...');
  const [error, setError] = useState(false);

  const handleVerifyAndStart = async () => {
    if (!localId || !localName) {
      Alert.alert("Error", "Please enter both Business ID and Name");
      return;
    }

    setIsLoading(true);
    setLoadingMsg('Verifying business...');
    setError(false);

    try {
      // Step 1: login — validate GST + name, get real businessId
      const response = await fetch(`https://ghost-verifier01.onrender.com/api/sessions/login`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstNumber: localId.trim(),
          name: localName.trim()
        })
      });

      if (response.status !== 200) {
        setError(true);
        Alert.alert("Verification Failed", "No business found with these details.");
        return;
      }

      const data = await response.json();
      const realBusinessId = data.businessId ?? localId.trim();
      const realName = data.name ?? localName.trim();

      // Step 2: BEFORE going to camera, check if this business already has
      // a pending surprise audit. If yes, surface the audit overlay instead.
      setLoadingMsg('Checking for pending audits...');
      try {
        const auditRes = await fetch(
          `https://ghost-verifier01.onrender.com/api/audit/pending?businessId=${encodeURIComponent(realBusinessId)}`
        );
        if (auditRes.status === 200) {
          const auditData = await auditRes.json();
          if (auditData?.pending === true) {
            // A live audit exists — hand off to AuditOverlay, do NOT start a new capture
            onPendingAudit(realBusinessId, realName);
            return;
          }
        }
        // 404 or pending:false → no active audit, fall through to capture
      } catch {
        // Network hiccup on audit check — safe to proceed, AuditOverlay will
        // catch it on its own mount poll once businessId is set in context
      }

      // Step 3: No pending audit — start normal verification capture
      onStart(realBusinessId, realName);

    } catch (err) {
      console.error(err);
      Alert.alert("Network Error", "Unable to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 px-6 justify-center"
      >
        {/* Header */}
        <View className="items-center mb-12">
          <View className="w-20 h-20 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 items-center justify-center mb-5">
            <Text className="text-4xl">🔍</Text>
          </View>
          <Text className="text-white text-3xl font-bold tracking-wide">Ghost Verifier</Text>
          <Text className="text-slate-400 mt-2 text-sm">Automated Business Verification</Text>
        </View>

        {/* Card */}
        <View className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
          <View className="mb-5">
            <Text className="text-slate-300 mb-2 text-sm font-medium">Business ID (GST / CIN)</Text>
            <TextInput
              className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:border-indigo-500"
              placeholder="GST27AAACR5055K1Z5"
              placeholderTextColor="#64748b"
              value={localId}
              onChangeText={setLocalId}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>

          <View>
            <Text className="text-slate-300 mb-2 text-sm font-medium">Business Name</Text>
            <TextInput
              className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:border-indigo-500"
              placeholder="Global Tech Solutions Pvt Ltd"
              placeholderTextColor="#64748b"
              value={localName}
              onChangeText={setLocalName}
              autoCorrect={false}
            />
          </View>
        </View>

        {/* Error Message */}
        {error && (
          <Text className="text-red-500 mt-4 text-center font-medium">
            Verification failed. Business not found.
          </Text>
        )}

        {/* Button */}
        <TouchableOpacity
          className={`mt-8 py-4 rounded-xl items-center shadow-lg ${
            isLoading ? "bg-slate-700" : "bg-indigo-600"
          }`}
          onPress={handleVerifyAndStart}
          disabled={isLoading}
        >
          {isLoading ? (
            <View style={{ alignItems: 'center' }}>
              <ActivityIndicator color="#fff" />
              <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 6 }}>{loadingMsg}</Text>
            </View>
          ) : (
            <Text className="text-white font-semibold text-base tracking-wide">
              Verify & Start Capture
            </Text>
          )}
        </TouchableOpacity>

        <View className="mt-6 items-center">
          <Text className="text-slate-500 text-xs text-center leading-5">
            Camera • GPS • Motion sensors will activate next
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ───────────────────────────────────────────────────────────────
//  CAPTURE VIEW
// ───────────────────────────────────────────────────────────────
type GpsPoint = { lat: number; lng: number };
function CaptureView({ businessId, businessName, onComplete }: { businessId: string; businessName: string; onComplete: (session: string, gps: GpsPoint | null) => void }) {
  const [camPermission, requestCamPerm] = useCameraPermissions();
  const [micPermission, requestMicPerm] = useMicrophonePermissions();
  const [locPermission, setLocPermission] = useState(false);
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [status, setStatus] = useState('Ready to record');
  const [uploading, setUploading] = useState(false);

  const cameraRef = useRef<CameraView | null>(null);
  const accelData = useRef<Array<{ x: number; y: number; z: number; t: number }>>([]);
  const gpsStartRef = useRef<GpsPoint | null>(null);
  const gpsEndRef = useRef<GpsPoint | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localSessionId = useRef(generateSessionId()).current;

  useEffect(() => {
    (async () => {
      if (!camPermission?.granted) {
        await requestCamPerm();
      }
      if (!micPermission?.granted) {
        await requestMicPerm();
      }
      const loc = await Location.requestForegroundPermissionsAsync();
      setLocPermission(loc.status === 'granted');
    })();

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
      }
      Accelerometer.removeAllListeners();
    };
  }, [camPermission?.granted, micPermission?.granted, requestCamPerm, requestMicPerm]);

  const stopRecording = async () => {
    if (!recording) return;

    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    Accelerometer.removeAllListeners();

    cameraRef.current?.stopRecording();

    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      gpsEndRef.current = { lat: loc.coords.latitude, lng: loc.coords.longitude };
    } catch {
      gpsEndRef.current = gpsStartRef.current;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRecording(false);
    setUploading(true);
    setStatus('Processing video...');
  };

  const startRecording = async () => {
    if (recording) return;
    if (cameraRef.current == null) return Alert.alert('Camera unavailable');
    if (!locPermission) return Alert.alert('Location permission needed');
    if (!micPermission?.granted) return Alert.alert('Microphone permission needed to record video');

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setStatus('Locking GPS...');
      
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      gpsStartRef.current = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      
      setStatus('Recording...');

      accelData.current = [];
      Accelerometer.setUpdateInterval(100);
      Accelerometer.addListener(data => {
        accelData.current.push({ x: data.x, y: data.y, z: data.z, t: Date.now() });
      });

      let secs = 30;
      setCountdown(30);
      timerRef.current = setInterval(() => {
        secs -= 1;
        setCountdown(secs);
        if (secs === 0) {
          stopRecording();
        }
      }, 1000);

      setRecording(true);

      const video = await cameraRef.current.recordAsync({
        maxDuration: 30,
      });

      if (video?.uri) {
        await handleVideoReady(video.uri);
      }
    } catch (err: any) {
      console.error('Recording error:', err);
      setRecording(false);
      setStatus('Recording failed — try again');
      Alert.alert('Error', 'Recording failed: ' + (err?.message || JSON.stringify(err)));
    }
  };

  // Helper: upload a local file URI to a pre-signed S3 URL using XHR.
  // fetch(localUri).blob() silently fails on React Native for file:// URIs.
  const uploadFileToS3 = (localUri: string, presignedUrl: string, contentType: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', presignedUrl);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`S3 HTTP ${xhr.status}`)));
      xhr.onerror = () => reject(new Error('S3 upload network error'));
      xhr.send({ uri: localUri, type: contentType, name: 'upload' } as any);
    });

  const uploadVideoInBackground = async (videoUri: string) => {
    try {
      const vidRes = await axios.get(`${API_URL}/api/upload/presigned-url`, {
        params: { type: 'video', sessionId: localSessionId }
      });
      // FIX: XHR instead of fetch().blob()
      await uploadFileToS3(videoUri, vidRes.data.uploadUrl, 'video/mp4');
    } catch (err: any) {
      console.warn('Video upload failed:', err?.message || err);
    }
  };

  const handleVideoReady = async (videoUri: string) => {
    try {
      setStatus('Extracting thumbnail...');
      const thumbnail = await ImageManipulator.manipulateAsync(
        videoUri,
        [{ resize: { width: 800 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      setStatus('Creating session...');
      await axios.post(`${API_URL}/api/sessions`, {
        sessionId: localSessionId,
        businessId,
        businessName,
        gpsStart: gpsStartRef.current,
        gpsEnd: gpsEndRef.current,
        device: 'Mobile',
        isRooted: false,
        accelerometer: accelData.current.slice(0, 300)
      });

      setStatus('Uploading thumbnail for AI scan...');
      const thumbRes = await axios.get(`${API_URL}/api/upload/presigned-url`, {
        params: { type: 'thumbnail', sessionId: localSessionId }
      });
      // FIX: XHR instead of fetch().blob()
      await uploadFileToS3(thumbnail.uri, thumbRes.data.uploadUrl, 'image/jpeg');

      setStatus('AI scanning in progress...');
      uploadVideoInBackground(videoUri);

      setUploading(false);
      onComplete(localSessionId, gpsStartRef.current);
    } catch (err: any) {
      console.error('Upload pipeline error:', err);
      setUploading(false);
      setStatus('Upload failed — try again');
      Alert.alert('Upload Error', err?.message || 'Unknown error');
    }
  };

  if (!camPermission?.granted || !micPermission?.granted) {
    return (
      <View style={sCap.center}>
        <Text style={sCap.permText}>Camera and Microphone permissions required</Text>
        <TouchableOpacity style={sCap.btn} onPress={async () => {
          await requestCamPerm();
          await requestMicPerm();
        }}>
          <Text style={sCap.btnText}>Grant Permissions</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (uploading) {
    return (
      <View style={sCap.center}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={sCap.uploadText}>{status}</Text>
        <Text style={sCap.uploadSub}>Please wait...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={sCap.safe}>
      <CameraView style={sCap.flex1} ref={cameraRef} facing="back" mode="video">
        <View style={sCap.topBar}>
          <Text style={sCap.bizName}>{businessName}</Text>
          <Text style={sCap.bizId}>{businessId}</Text>
        </View>

        {recording && (
          <View style={sCap.recRow}>
            <View style={sCap.recDot} />
            <Text style={sCap.recText}>RECORDING</Text>
          </View>
        )}

        {recording && (
          <View style={sCap.countdownBox}>
            <Text style={sCap.countdown}>{countdown}</Text>
            <Text style={sCap.countdownSub}>seconds remaining</Text>
          </View>
        )}

        {!recording && (
          <View style={sCap.instructions}>
            <Text style={sCap.instrText}>📍 Point camera at business entrance</Text>
            <Text style={sCap.instrText}>🪧 Make sure signboard is visible</Text>
            <Text style={sCap.instrText}>⏱️ Recording will run for 30 seconds</Text>
          </View>
        )}

        <View style={sCap.bottomBar}>
          {!recording ? (
            <TouchableOpacity style={sCap.recordBtn} onPress={startRecording}>
              <View style={sCap.recordBtnInner} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={sCap.stopBtn} onPress={stopRecording}>
              <View style={sCap.stopBtnInner} />
            </TouchableOpacity>
          )}
          <Text style={sCap.btnLabel}>
            {recording ? 'Tap to stop early' : 'Tap to start recording'}
          </Text>
        </View>
      </CameraView>
    </SafeAreaView>
  );
}

// ───────────────────────────────────────────────────────────────
//  RESULT VIEW
// ───────────────────────────────────────────────────────────────
function ResultView({
  sessionId,
  businessId,
  businessName,
  gpsStart,
  onRestart
}: { sessionId: string; businessId: string; businessName: string; gpsStart: GpsPoint | null; onRestart: () => void }) {
  const [score, setScore] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [geoScore, setGeoScore] = useState<number | null>(null);
  const [signScore, setSignScore] = useState<number | null>(null);
  const [infraScore, setInfra] = useState<number | null>(null);
  const [isFlagged, setFlagged] = useState(false);
  const [waitMsg, setWaitMsg] = useState('Connecting to AI pipeline...');
  const [elapsed, setElapsed] = useState(0);

  const socketRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let fallbackTimer: ReturnType<typeof setTimeout>;

    timerRef.current = setInterval(() => {
      setElapsed(e => {
        const next = e + 1;
        if (next === 3) setWaitMsg('Thumbnail uploaded. Rekognition scanning...');
        if (next === 8) setWaitMsg('AI analysing signage and infrastructure...');
        if (next === 15) setWaitMsg('Computing trust score...');
        if (next === 25) setWaitMsg('Almost there...');
        return next;
      });
    }, 1000);

    const socket = io(SOCKET_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('session_complete', (data: any) => {
      if (data.sessionId === sessionId) {
        if (timerRef.current !== null) clearInterval(timerRef.current);
        if (fallbackTimer) clearTimeout(fallbackTimer);
        setScore(data.trustScore);
        setStatus(data.status);
        setLabels(data.labels || []);
        setText(data.textDetected || 'NONE');
        setGeoScore(data.geoScore);
        setSignScore(data.signScore);
        setInfra(data.infraScore);
        setFlagged(data.isFlagged || false);
      }
    });

    fallbackTimer = setTimeout(async () => {
      try {
        const res = await axios.get(`${API_URL}/api/sessions/${sessionId}`);
        const s = res.data;
        if (s.trustScore != null && s.status !== 'PENDING') {
          if (timerRef.current !== null) clearInterval(timerRef.current);
          setScore(s.trustScore);
          setStatus(s.status);
          setLabels(s.aiResults?.labels || []);
          setText(s.aiResults?.textDetected || 'NONE');
          setGeoScore(s.geoScore);
          setSignScore(s.signScore ?? s.aiResults?.signScore ?? null);
          setInfra(s.infraScore ?? s.aiResults?.infraScore ?? null);
          setFlagged(s.aiResults?.isFlagged || false);
        }
      } catch (e) {
        console.warn('Fallback polling failed', e);
      }
    }, 20000);

    return () => {
      socket.disconnect();
      if (timerRef.current !== null) clearInterval(timerRef.current);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [sessionId]);

  const scoreColor = score == null ? '#94A3B8' : score >= 70 ? '#16A34A' : score >= 40 ? '#D97706' : '#DC2626';
  const statusBg = !status ? '#1E293B' : status === 'PASSED' ? '#14532D' : status === 'REVIEW' ? '#78350F' : '#7F1D1D';
  const FLAG_LABELS = ['Bed','Pillow','Bedroom','Couch','Sofa','Kitchen','Bathroom'];
  const isNegative = (l: string) => FLAG_LABELS.includes(l);

  if (score === null) {
    return (
      <SafeAreaView style={sRes.safe}>
        <View style={sRes.center}>
          <ActivityIndicator size="large" color="#2563EB" style={{ marginBottom: 24 }} />
          <Text style={sRes.waitTitle}>Analysing Business</Text>
          <Text style={sRes.waitMsg}>{waitMsg}</Text>
          <Text style={sRes.elapsed}>{elapsed}s</Text>

          <View style={sRes.steps}>
            {([
              ['GPS Verification', elapsed >= 1],
              ['Thumbnail Upload', elapsed >= 3],
              ['Rekognition AI Scan', elapsed >= 5],
              ['Trust Score Computed', elapsed >= 15],
            ]).map(([label, done]) => (
              <View key={label as string} style={sRes.stepRow}>
                <Text style={[sRes.stepDot, done && sRes.stepDotDone]}>{done ? '✓' : '○'}</Text>
                <Text style={[sRes.stepLabel, done && sRes.stepLabelDone]}>{label as string}</Text>
              </View>
            ))}
          </View>
          <Text style={sRes.sessionId}>Session: {sessionId}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={sRes.safe}>
      <ScrollView contentContainerStyle={sRes.scroll}>
        <Text style={sRes.bizName}>{businessName}</Text>
        <Text style={sRes.bizId}>{businessId}</Text>

        <View style={[sRes.scoreBox, { borderColor: scoreColor }]}>
          <Text style={[sRes.score, { color: scoreColor }]}>{score}</Text>
          <Text style={sRes.scoreLabel}>Trust Score</Text>
        </View>

        <View style={[sRes.statusBadge, { backgroundColor: statusBg }]}>
          <Text style={sRes.statusText}>
            {status === 'PASSED' ? '✅' : status === 'REVIEW' ? '⚠️' : '🚩'}
            {'  '}{status}
          </Text>
        </View>

        <View style={sRes.breakdown}>
          <Text style={sRes.breakdownTitle}>Score Breakdown</Text>
          {([
            ['GPS Match', geoScore != null ? (geoScore === 1 ? '✓ Within 100m' : '✗ Outside range') : '-', geoScore === 1 ? '#16A34A' : '#DC2626'],
            ['Signage', typeof signScore === 'number' && !isNaN(signScore) ? `${Math.round(signScore * 100)}%` : '-', '#2563EB'],
            ['Infrastructure', typeof infraScore === 'number' && !isNaN(infraScore) ? `${Math.round(infraScore * 100)}%` : '-', '#7C3AED'],
          ] as Array<[string, string, string]>).map(([label, val, col]) => (
            <View key={label} style={sRes.breakRow}>
              <Text style={sRes.breakLabel}>{label}</Text>
              <Text style={[sRes.breakVal, { color: col }]}>{val}</Text>
            </View>
          ))}
        </View>

        <View style={sRes.section}>
          <Text style={sRes.sectionTitle}>Sign Text Detected</Text>
          <Text style={sRes.signText}>{text === 'NONE' ? '⚠️ No business sign detected' : `"${text}"`}</Text>
        </View>

        <View style={sRes.section}>
          <Text style={sRes.sectionTitle}>Objects Detected</Text>
          <View style={sRes.chips}>
            {labels.length > 0 ? labels.map(l => (
              <View key={l} style={[sRes.chip, isNegative(l) ? sRes.chipBad : sRes.chipGood]}>
                <Text style={[sRes.chipText, isNegative(l) ? sRes.chipTextBad : sRes.chipTextGood]}>
                  {isNegative(l) ? '⚠️ ' : '✓ '}{l}
                </Text>
              </View>
            )) : <Text style={sRes.noLabels}>No objects detected</Text>}
          </View>
        </View>

        {isFlagged && (
          <View style={sRes.flagBox}>
            <Text style={sRes.flagTitle}>🚩 Residential Indicators Found</Text>
            <Text style={sRes.flagText}>
              AI detected residential objects (Bed, Sofa, Kitchen etc).
              This business may be operating from a residential address.
            </Text>
          </View>
        )}

        {gpsStart && (
          <View style={sRes.section}>
            <Text style={sRes.sectionTitle}>GPS Captured</Text>
            <Text style={sRes.gpsText}>{gpsStart.lat.toFixed(6)}, {gpsStart.lng.toFixed(6)}</Text>
          </View>
        )}

        <Text style={sRes.sessionFooter}>Session ID: {sessionId}</Text>

        <TouchableOpacity style={sRes.newBtn} onPress={onRestart}>
          <Text style={sRes.newBtnText}>Start New Verification</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ───────────────────────────────────────────────────────────────
//  STYLES
// ───────────────────────────────────────────────────────────────
const sHome = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F172A' },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 56, marginBottom: 8 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#94A3B8', marginBottom: 12 },
  badge: { backgroundColor: '#1E3A5F', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  badgeText: { color: '#60A5FA', fontSize: 12, fontWeight: '600' },
  form: { marginBottom: 24 },
  label: { color: '#94A3B8', fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#1E293B', color: '#F8FAFC', padding: 14, borderRadius: 10, fontSize: 15, borderWidth: 1, borderColor: '#334155' },
  btn: { backgroundColor: '#2563EB', padding: 16, borderRadius: 12, alignItems: 'center' },
  btnDisabled: { backgroundColor: '#1E3A5F', opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  hint: { color: '#475569', fontSize: 12, textAlign: 'center', marginTop: 16 },
});

const sCap = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  flex1: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A', padding: 24 },
  permText: { color: '#F8FAFC', fontSize: 18, marginBottom: 20, textAlign: 'center' },
  uploadText: { color: '#F8FAFC', fontSize: 20, fontWeight: 'bold', marginTop: 24, textAlign: 'center' },
  uploadSub: { color: '#94A3B8', fontSize: 14, marginTop: 8 },
  btn: { backgroundColor: '#2563EB', padding: 14, borderRadius: 10, marginTop: 16 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  topBar: { backgroundColor: 'rgba(0,0,0,0.6)', padding: 16, paddingTop: 48 },
  bizName: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  bizId: { color: '#94A3B8', fontSize: 13, marginTop: 2 },
  recRow: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingLeft: 16 },
  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#EF4444', marginRight: 8 },
  recText: { color: '#EF4444', fontSize: 14, fontWeight: 'bold', letterSpacing: 2 },
  countdownBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  countdown: { fontSize: 96, fontWeight: 'bold', color: '#FCD34D', textShadowColor: '#000', textShadowRadius: 10 },
  countdownSub: { color: '#FCD34D', fontSize: 16, marginTop: -8 },
  instructions: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  instrText: { color: '#fff', fontSize: 15, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  bottomBar: { backgroundColor: 'rgba(0,0,0,0.6)', padding: 24, alignItems: 'center' },
  recordBtn: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  recordBtnInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#EF4444' },
  stopBtn: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  stopBtnInner: { width: 40, height: 40, borderRadius: 6, backgroundColor: '#fff' },
  btnLabel: { color: '#94A3B8', fontSize: 13, marginTop: 12 },
});

const sRes = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F172A' },
  scroll: { padding: 24, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  waitTitle: { color: '#F8FAFC', fontSize: 22, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  waitMsg: { color: '#94A3B8', fontSize: 15, textAlign: 'center', marginBottom: 8 },
  elapsed: { color: '#475569', fontSize: 13, marginBottom: 32 },
  steps: { width: '100%', gap: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepDot: { color: '#475569', fontSize: 18, width: 24, textAlign: 'center' },
  stepDotDone: { color: '#16A34A' },
  stepLabel: { color: '#475569', fontSize: 15 },
  stepLabelDone: { color: '#F8FAFC' },
  sessionId: { color: '#334155', fontSize: 11, marginTop: 32 },
  bizName: { color: '#94A3B8', fontSize: 14, textAlign: 'center', marginBottom: 2 },
  bizId: { color: '#475569', fontSize: 12, textAlign: 'center', marginBottom: 24 },
  scoreBox: { width: 160, height: 160, borderRadius: 80, borderWidth: 6, justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 16 },
  score: { fontSize: 64, fontWeight: 'bold' },
  scoreLabel: { color: '#94A3B8', fontSize: 13 },
  statusBadge: { paddingHorizontal: 32, paddingVertical: 10, borderRadius: 24, alignSelf: 'center', marginBottom: 32 },
  statusText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  breakdown: { backgroundColor: '#1E293B', borderRadius: 12, padding: 16, marginBottom: 16 },
  breakdownTitle: { color: '#94A3B8', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  breakRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#334155' },
  breakLabel: { color: '#94A3B8', fontSize: 14 },
  breakVal: { fontSize: 14, fontWeight: '600' },
  section: { backgroundColor: '#1E293B', borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { color: '#94A3B8', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  signText: { color: '#F8FAFC', fontSize: 15, fontStyle: 'italic' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  chipGood: { backgroundColor: '#DBEAFE' },
  chipBad: { backgroundColor: '#FEE2E2' },
  chipText: { fontSize: 13, fontWeight: '500' },
  chipTextGood: { color: '#1E3A5F' },
  chipTextBad: { color: '#7F1D1D' },
  noLabels: { color: '#475569', fontSize: 14 },
  flagBox: { backgroundColor: '#450A0A', borderWidth: 1, borderColor: '#DC2626', borderRadius: 12, padding: 16, marginBottom: 16 },
  flagTitle: { color: '#FCA5A5', fontSize: 15, fontWeight: 'bold', marginBottom: 6 },
  flagText: { color: '#FCA5A5', fontSize: 13, lineHeight: 20 },
  gpsText: { color: '#F8FAFC', fontSize: 14, fontFamily: 'monospace' },
  sessionFooter: { color: '#334155', fontSize: 11, textAlign: 'center', marginBottom: 24 },
  newBtn: { backgroundColor: '#1E3A5F', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  newBtnText: { color: '#60A5FA', fontSize: 16, fontWeight: '600' },
});