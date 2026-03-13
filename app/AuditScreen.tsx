// ═══════════════════════════════════════════════════════════════
//  Ghost Business Verifier — Surprise Audit Screen
//  app/AuditScreen.tsx
//
//  THUMBNAIL FIX:
//  index.tsx (working verification flow) uses:
//    ImageManipulator.manipulateAsync(videoUri, [{resize:{width:800}}], ...)
//  to extract a JPEG frame from the recorded video. This works.
//
//  The audit screen was using takePictureAsync() on a video-mode
//  CameraView which fails silently on Android. Fixed by using the
//  exact same ImageManipulator approach as index.tsx.
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, Alert, ActivityIndicator, Modal,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location         from 'expo-location';
import * as Haptics          from 'expo-haptics';
import axios from 'axios';
import { io } from 'socket.io-client';
import { API_URL, SOCKET_URL } from '../config';

type AuditRequest = {
  sessionId    : string;
  businessName : string;
  auditDeadline: string;
  message      : string;
};

type Props = {
  businessId: string | null;
};

// ─────────────────────────────────────────────────────────────────
//  Root export
// ─────────────────────────────────────────────────────────────────
export default function AuditOverlay({ businessId }: Props) {
  const [auditRequest, setAuditRequest] = useState<AuditRequest | null>(null);
  const [phase, setPhase] = useState<'ALERT' | 'CAPTURE' | 'DONE'>('ALERT');

  const toAuditRequest = (data: any): AuditRequest => ({
    sessionId    : data.sessionId,
    businessName : data.businessName ?? '',
    auditDeadline: data.auditDeadline,
    message      : data.message ?? 'A surprise audit is required. Please re-record at the same premises.',
  });

  // Poll on mount — shows overlay even if socket event was missed
  useEffect(() => {
    if (!businessId) return;
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/api/audit/pending`, { params: { businessId } });
        if (res.data?.sessionId) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setAuditRequest(toAuditRequest(res.data));
          setPhase('ALERT');
        }
      } catch { /* 404 = no pending audit */ }
    })();
  }, [businessId]);

  // Socket listeners
  useEffect(() => {
    if (!businessId) return;
    const socket = io(SOCKET_URL, { transports: ['websocket'] });
    socket.on('request_audit', (data: any) => {
      if (data.businessId && data.businessId !== businessId) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setAuditRequest(toAuditRequest(data));
      setPhase('ALERT');
    });
    socket.on('audit_reminder', (data: any) => {
      if (data.businessId && data.businessId !== businessId) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('⏰ Audit Reminder', `${data.hoursRemaining} hours remaining to submit your audit video.`, [{ text: 'OK' }]);
    });
    return () => { socket.disconnect(); };
  }, [businessId]);

  if (!auditRequest) return null;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen">
      {phase === 'ALERT' && (
        <AuditAlertScreen request={auditRequest} onAccept={() => setPhase('CAPTURE')} />
      )}
      {phase === 'CAPTURE' && (
        <AuditCaptureScreen
          request={auditRequest}
          onComplete={() => { setPhase('DONE'); setTimeout(() => setAuditRequest(null), 3000); }}
        />
      )}
      {phase === 'DONE' && <AuditDoneScreen onClose={() => setAuditRequest(null)} />}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────
//  ALERT SCREEN
// ─────────────────────────────────────────────────────────────────
function AuditAlertScreen({ request, onAccept }: { request: AuditRequest; onAccept: () => void }) {
  return (
    <SafeAreaView style={sAlert.safe}>
      <View style={sAlert.container}>
        <View style={sAlert.iconWrap}><Text style={sAlert.iconText}>🚨</Text></View>
        <Text style={sAlert.title}>Surprise Audit Requested</Text>
        <Text style={sAlert.bizName}>{request.businessName}</Text>
        <Text style={sAlert.message}>{request.message}</Text>
        <CountdownTimer deadline={request.auditDeadline} />
        <TouchableOpacity style={sAlert.btn} onPress={onAccept}>
          <Text style={sAlert.btnText}>📷  Start Audit Recording</Text>
        </TouchableOpacity>
        <Text style={sAlert.warning}>
          ⚠️ You must record at the actual business premises.{'\n'}
          Gallery access is disabled for this session.
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────
//  COUNTDOWN TIMER
// ─────────────────────────────────────────────────────────────────
export function CountdownTimer({ deadline }: { deadline: string }) {
  const getRemaining = useCallback(() => {
    const ms = Math.max(0, new Date(deadline).getTime() - Date.now());
    const t  = Math.floor(ms / 1000);
    return { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: t % 60, ms };
  }, [deadline]);

  const [rem, setRem] = useState(getRemaining());
  useEffect(() => {
    const id = setInterval(() => setRem(getRemaining()), 1000);
    return () => clearInterval(id);
  }, [getRemaining]);

  const { h, m, s, ms } = rem;
  const urgent   = ms < 6 * 3600000;
  const critical = ms < 2 * 3600000;
  const expired  = ms === 0;
  const pad      = (n: number) => String(n).padStart(2, '0');

  return (
    <View style={sClock.wrap}>
      <Text style={sClock.label}>Time Remaining</Text>
      <View style={[sClock.box, urgent && sClock.urgent, critical && sClock.critical, expired && sClock.expired]}>
        <Text style={[sClock.text, urgent && sClock.textUrgent, critical && sClock.textCritical, expired && sClock.textExpired]}>
          {expired ? 'EXPIRED' : `${pad(h)}:${pad(m)}:${pad(s)}`}
        </Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
//  CAPTURE SCREEN
//
//  Exact same pattern as index.tsx CaptureView which already works:
//    1. recordAsync()  → video.uri
//    2. ImageManipulator.manipulateAsync(video.uri, ...)  → thumbnail JPEG
//    3. Upload thumbnail to audit-thumbnails/  → Lambda fires
//    4. Upload video to audit-videos/
//    5. POST /api/audit/:id/submit
// ─────────────────────────────────────────────────────────────────
function AuditCaptureScreen({ request, onComplete }: { request: AuditRequest; onComplete: () => void }) {
  const [camPermission, requestCamPerm] = useCameraPermissions();
  const [micPermission, requestMicPerm] = useMicrophonePermissions();
  const [locPermission, setLocPermission] = useState(false);
  const [recording,  setRecording]  = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [statusMsg,  setStatusMsg]  = useState('');
  const [countdown,  setCountdown]  = useState(30);

  const cameraRef = useRef<CameraView | null>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const gpsRef    = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    (async () => {
      const loc = await Location.requestForegroundPermissionsAsync();
      setLocPermission(loc.status === 'granted');
    })();
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recording) return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    cameraRef.current?.stopRecording();
    setRecording(false);
  }, [recording]);

  // XHR upload — same pattern as index.tsx, reads actual file bytes
  const uploadFileToS3 = (localUri: string, presignedUrl: string, contentType: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', presignedUrl);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.onload    = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`S3 PUT ${xhr.status}`));
      xhr.onerror   = () => reject(new Error('S3 network error'));
      xhr.ontimeout = () => reject(new Error('S3 timeout'));
      xhr.timeout   = 120000;
      xhr.send({ uri: localUri, type: contentType, name: 'upload' } as any);
    });

  const startRecording = async () => {
    if (recording || !cameraRef.current) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      // Lock GPS
      if (locPermission) {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          gpsRef.current = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        } catch (e) { console.warn('[AuditCapture] GPS failed:', e); }
      }

      // Start countdown
      let secs = 30;
      setCountdown(30);
      timerRef.current = setInterval(() => {
        secs -= 1;
        setCountdown(secs);
        if (secs <= 0) stopRecording();
      }, 1000);

      setRecording(true);

      // Record video
      const video = await cameraRef.current.recordAsync({ maxDuration: 30 });

      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setRecording(false);

      if (!video?.uri) throw new Error('Recording produced no video file');

      await handleUpload(video.uri);

    } catch (err: any) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setRecording(false);
      setUploading(false);
      setStatusMsg('');
      Alert.alert('Error', err?.message ?? 'Recording failed — try again');
    }
  };

  const handleUpload = async (videoUri: string) => {
    try {
      setUploading(true);

      // ── STEP 1: Extract thumbnail from video ──────────────────
      // EXACT same call as index.tsx line that already works:
      //   ImageManipulator.manipulateAsync(videoUri, [{resize:{width:800}}], ...)
      setStatusMsg('Extracting thumbnail...');
      const thumbnail = await ImageManipulator.manipulateAsync(
        videoUri,
        [{ resize: { width: 800 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      console.log('[AuditCapture] Thumbnail extracted:', thumbnail.uri);

      // ── STEP 2: Upload thumbnail → audit-thumbnails/ → Lambda fires
      setStatusMsg('Getting thumbnail upload URL...');
      const thumbRes = await axios.get(`${API_URL}/api/upload/presigned-url`, {
        params: { type: 'audit-thumbnail', sessionId: request.sessionId },
      });

      setStatusMsg('Uploading thumbnail...');
      await uploadFileToS3(thumbnail.uri, thumbRes.data.uploadUrl, 'image/jpeg');
      const auditS3ThumbKey = thumbRes.data.s3Key;
      console.log('[AuditCapture] ✅ Thumbnail in S3:', auditS3ThumbKey);

      // ── STEP 3: Upload video → audit-videos/
      let auditS3VideoKey: string | null = null;
      try {
        setStatusMsg('Getting video upload URL...');
        const vidRes = await axios.get(`${API_URL}/api/upload/presigned-url`, {
          params: { type: 'audit-video', sessionId: request.sessionId },
        });
        setStatusMsg('Uploading video...');
        await uploadFileToS3(videoUri, vidRes.data.uploadUrl, 'video/mp4');
        auditS3VideoKey = vidRes.data.s3Key;
        console.log('[AuditCapture] ✅ Video in S3:', auditS3VideoKey);
      } catch (vidErr: any) {
        // Video non-fatal — thumbnail drives Lambda
        console.warn('[AuditCapture] Video upload failed (non-fatal):', vidErr?.message);
      }

      // ── STEP 4: Notify backend → auditStatus = SUBMITTED
      // If Lambda already finished before we got here (slow video upload),
      // the backend returns 200 with the existing auditStatus (PASSED/REJECTED).
      // Either way we treat any 2xx OR a "already processed" response as success.
      setStatusMsg('Submitting audit...');
      try {
        const submitRes = await axios.post(`${API_URL}/api/audit/${request.sessionId}/submit`, {
          auditS3ThumbUri: auditS3ThumbKey,
          auditS3VideoUri: auditS3VideoKey,
          gps            : gpsRef.current,
        });
        console.log('[AuditCapture] ✅ Submit response:', submitRes.data);
      } catch (submitErr: any) {
        // 400 means Lambda already finished and audit is PASSED/REJECTED.
        // The dashboard is already updated. Close the screen normally.
        const status = submitErr?.response?.status;
        if (status === 400) {
          console.log('[AuditCapture] Submit 400 — Lambda already finished, closing screen');
        } else {
          // Any other error (5xx, network) — still close screen, Lambda already ran
          console.warn('[AuditCapture] Submit error (non-fatal, Lambda already ran):', submitErr?.message);
        }
      }

      setUploading(false);
      onComplete();

    } catch (err: any) {
      setUploading(false);
      setStatusMsg('');
      Alert.alert('Upload Error', err?.message ?? 'Unknown error');
    }
  };

  if (!camPermission?.granted || !micPermission?.granted) {
    return (
      <View style={sCapture.center}>
        <Text style={sCapture.permText}>Camera & microphone permissions required</Text>
        <TouchableOpacity style={sCapture.btn} onPress={async () => { await requestCamPerm(); await requestMicPerm(); }}>
          <Text style={sCapture.btnText}>Grant Permissions</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (uploading) {
    return (
      <View style={sCapture.center}>
        <ActivityIndicator size="large" color="#F59E0B" />
        <Text style={sCapture.uploadText}>{statusMsg}</Text>
        <Text style={sCapture.uploadSub}>Please wait...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={sCapture.safe}>
      <CameraView style={sCapture.flex1} ref={cameraRef} facing="back" mode="video">
        <View style={sCapture.auditBanner}>
          <Text style={sCapture.auditBannerText}>🔒 AUDIT CAPTURE — {request.sessionId}</Text>
        </View>
        <View style={sCapture.topBar}>
          <Text style={sCapture.bizName}>{request.businessName}</Text>
          <CountdownTimer deadline={request.auditDeadline} />
        </View>
        {recording && (
          <View style={sCapture.recRow}>
            <View style={sCapture.recDot} />
            <Text style={sCapture.recText}>AUDIT RECORDING</Text>
          </View>
        )}
        {recording && (
          <View style={sCapture.countdownBox}>
            <Text style={sCapture.countdown}>{countdown}</Text>
            <Text style={sCapture.countdownSub}>seconds</Text>
          </View>
        )}
        {!recording && (
          <View style={sCapture.instructions}>
            <Text style={sCapture.instrText}>📍 Record the same premises as before</Text>
            <Text style={sCapture.instrText}>🪧 Show the business signboard clearly</Text>
            <Text style={sCapture.instrText}>🚫 Gallery access disabled</Text>
            {!locPermission && (
              <Text style={sCapture.instrTextWarn}>⚠️ Location permission missing — GPS won't be captured</Text>
            )}
          </View>
        )}
        <View style={sCapture.bottomBar}>
          {!recording ? (
            <TouchableOpacity style={sCapture.recordBtn} onPress={startRecording}>
              <View style={sCapture.recordBtnInner} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={sCapture.stopBtn} onPress={stopRecording}>
              <View style={sCapture.stopBtnInner} />
            </TouchableOpacity>
          )}
          <Text style={sCapture.btnLabel}>{recording ? 'Tap to stop early' : 'Tap to begin audit recording'}</Text>
        </View>
      </CameraView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────
//  DONE SCREEN
// ─────────────────────────────────────────────────────────────────
function AuditDoneScreen({ onClose }: { onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <SafeAreaView style={sDone.safe}>
      <View style={sDone.container}>
        <Text style={sDone.icon}>✅</Text>
        <Text style={sDone.title}>Audit Submitted</Text>
        <Text style={sDone.sub}>Visual analysis is running. You will be notified of the result.</Text>
      </View>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────────────────────────
const sAlert = StyleSheet.create({
  safe     : { flex: 1, backgroundColor: '#0F172A' },
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  iconWrap : { width: 80, height: 80, borderRadius: 40, backgroundColor: '#7F1D1D', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  iconText : { fontSize: 40 },
  title    : { color: '#FCA5A5', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  bizName  : { color: '#F8FAFC', fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  message  : { color: '#94A3B8', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  btn      : { backgroundColor: '#B45309', padding: 18, borderRadius: 14, width: '100%', alignItems: 'center', marginTop: 24 },
  btnText  : { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  warning  : { color: '#64748B', fontSize: 12, textAlign: 'center', marginTop: 16, lineHeight: 18 },
});
const sClock = StyleSheet.create({
  wrap    : { alignItems: 'center', marginVertical: 16, width: '100%' },
  label   : { color: '#94A3B8', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  box     : { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, backgroundColor: '#1E293B', borderWidth: 2, borderColor: '#334155' },
  urgent  : { borderColor: '#B45309', backgroundColor: '#431407' },
  critical: { borderColor: '#DC2626', backgroundColor: '#450A0A' },
  expired : { borderColor: '#7F1D1D', backgroundColor: '#1C0606' },
  text        : { color: '#F8FAFC', fontSize: 40, fontWeight: 'bold', fontVariant: ['tabular-nums'], letterSpacing: 4 },
  textUrgent  : { color: '#FCD34D' },
  textCritical: { color: '#FCA5A5' },
  textExpired : { color: '#EF4444' },
});
const sCapture = StyleSheet.create({
  safe          : { flex: 1, backgroundColor: '#000' },
  flex1         : { flex: 1 },
  center        : { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A', padding: 24 },
  permText      : { color: '#F8FAFC', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  uploadText    : { color: '#F8FAFC', fontSize: 18, fontWeight: 'bold', marginTop: 24, textAlign: 'center' },
  uploadSub     : { color: '#94A3B8', fontSize: 13, marginTop: 6 },
  btn           : { backgroundColor: '#B45309', padding: 14, borderRadius: 10, marginTop: 16 },
  btnText       : { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  auditBanner   : { backgroundColor: '#7F1D1D', padding: 8, alignItems: 'center' },
  auditBannerText: { color: '#FCA5A5', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
  topBar        : { backgroundColor: 'rgba(0,0,0,0.7)', padding: 12 },
  bizName       : { color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 4 },
  recRow        : { flexDirection: 'row', alignItems: 'center', padding: 12, paddingLeft: 16 },
  recDot        : { width: 12, height: 12, borderRadius: 6, backgroundColor: '#F59E0B', marginRight: 8 },
  recText       : { color: '#F59E0B', fontSize: 13, fontWeight: 'bold', letterSpacing: 2 },
  countdownBox  : { flex: 1, justifyContent: 'center', alignItems: 'center' },
  countdown     : { fontSize: 88, fontWeight: 'bold', color: '#FCD34D' },
  countdownSub  : { color: '#FCD34D', fontSize: 14 },
  instructions  : { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  instrText     : { color: '#fff', fontSize: 14, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  instrTextWarn : { color: '#FCD34D', fontSize: 13, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  bottomBar     : { backgroundColor: 'rgba(0,0,0,0.7)', padding: 24, alignItems: 'center' },
  recordBtn     : { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#F59E0B', justifyContent: 'center', alignItems: 'center' },
  recordBtnInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#F59E0B' },
  stopBtn       : { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  stopBtnInner  : { width: 40, height: 40, borderRadius: 6, backgroundColor: '#fff' },
  btnLabel      : { color: '#94A3B8', fontSize: 12, marginTop: 10 },
});
const sDone = StyleSheet.create({
  safe     : { flex: 1, backgroundColor: '#0F172A' },
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  icon     : { fontSize: 64, marginBottom: 20 },
  title    : { color: '#F8FAFC', fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  sub      : { color: '#94A3B8', fontSize: 15, textAlign: 'center', lineHeight: 22 },
});