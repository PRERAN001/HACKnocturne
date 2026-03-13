// ═══════════════════════════════════════════════════════════════
//  Ghost Business Verifier — Capture Screen
//  screens/CaptureScreen.js
//
//  Records 30s video + GPS + accelerometer
//  Extracts thumbnail from first frame
//  Uploads both to S3 via presigned URLs
// ═══════════════════════════════════════════════════════════════
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, Alert, ActivityIndicator
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location    from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import * as Haptics     from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { API_URL, generateSessionId } from '../config';

export default function CaptureScreen({ route, navigation }) {
  const { businessId, businessName } = route.params;

  const [camPermission,  requestCamPerm]  = useCameraPermissions();
  const [locPermission,  setLocPermission] = useState(false);
  const [recording,  setRecording]  = useState(false);
  const [countdown,  setCountdown]  = useState(30);
  const [status,     setStatus]     = useState('Ready to record');
  const [uploading,  setUploading]  = useState(false);

  const cameraRef   = useRef(null);
  const accelData   = useRef([]);
  const gpsStart    = useRef(null);
  const gpsEnd      = useRef(null);
  const timerRef    = useRef(null);
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
      Accelerometer.removeAllListeners();
    };
  }, []);

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
        lng: loc.coords.longitude
      };
      setStatus('Recording...');

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
      const { uploadUrl: thumbUploadUrl, s3Key: thumbKey } = thumbRes.data;

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
        <Text style={s.permText}>Camera permission required</Text>
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
        <Text style={s.uploadSub}>Please wait...</Text>
      </View>
    );
  }

  // ── Camera View ───────────────────────────────────────────────
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

        {/* Recording indicator */}
        {recording && (
          <View style={s.recRow}>
            <View style={s.recDot} />
            <Text style={s.recText}>RECORDING</Text>
          </View>
        )}

        {/* Countdown */}
        {recording && (
          <View style={s.countdownBox}>
            <Text style={s.countdown}>{countdown}</Text>
            <Text style={s.countdownSub}>seconds remaining</Text>
          </View>
        )}

        {/* Instructions */}
        {!recording && (
          <View style={s.instructions}>
            <Text style={s.instrText}>📍 Point camera at business entrance</Text>
            <Text style={s.instrText}>🪧 Make sure signboard is visible</Text>
            <Text style={s.instrText}>⏱️ Recording will run for 30 seconds</Text>
          </View>
        )}

        {/* Bottom controls */}
        <View style={s.bottomBar}>
          {!recording ? (
            <TouchableOpacity style={s.recordBtn} onPress={startRecording}>
              <View style={s.recordBtnInner} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.stopBtn} onPress={stopRecording}>
              <View style={s.stopBtnInner} />
            </TouchableOpacity>
          )}
          <Text style={s.btnLabel}>
            {recording ? 'Tap to stop early' : 'Tap to start recording'}
          </Text>
        </View>
      </CameraView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  center       : { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A', padding: 24 },
  permText     : { color: '#F8FAFC', fontSize: 18, marginBottom: 20, textAlign: 'center' },
  uploadText   : { color: '#F8FAFC', fontSize: 20, fontWeight: 'bold', marginTop: 24, textAlign: 'center' },
  uploadSub    : { color: '#94A3B8', fontSize: 14, marginTop: 8 },
  btn          : { backgroundColor: '#2563EB', padding: 14, borderRadius: 10, marginTop: 16 },
  btnText      : { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  // Camera overlays
  topBar       : { backgroundColor: 'rgba(0,0,0,0.6)', padding: 16, paddingTop: 48 },
  bizName      : { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  bizId        : { color: '#94A3B8', fontSize: 13, marginTop: 2 },

  recRow       : { flexDirection: 'row', alignItems: 'center', padding: 12, paddingLeft: 16 },
  recDot       : { width: 12, height: 12, borderRadius: 6, backgroundColor: '#EF4444', marginRight: 8 },
  recText      : { color: '#EF4444', fontSize: 14, fontWeight: 'bold', letterSpacing: 2 },

  countdownBox : { flex: 1, justifyContent: 'center', alignItems: 'center' },
  countdown    : { fontSize: 96, fontWeight: 'bold', color: '#FCD34D', textShadowColor: '#000', textShadowRadius: 10 },
  countdownSub : { color: '#FCD34D', fontSize: 16, marginTop: -8 },

  instructions : { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  instrText    : { color: '#fff', fontSize: 15, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },

  bottomBar    : { backgroundColor: 'rgba(0,0,0,0.6)', padding: 24, alignItems: 'center' },
  recordBtn    : { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  recordBtnInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#EF4444' },
  stopBtn      : { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  stopBtnInner : { width: 40, height: 40, borderRadius: 6, backgroundColor: '#fff' },
  btnLabel     : { color: '#94A3B8', fontSize: 13, marginTop: 12 },
});
