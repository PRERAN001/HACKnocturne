/**
 * src/screens/StrictCaptureCamera.jsx  (React Native)
 *
 * Camera screen for the audit video capture.
 * STRICT MODE enforcements:
 *   1. Only the rear camera is accessible
 *   2. No photo library / gallery picker is exposed
 *   3. sessionId is embedded in the S3 upload path — cannot be spoofed
 *   4. Minimum recording duration of 10 seconds enforced
 *   5. Back button is blocked while recording
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  BackHandler,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import { uploadAuditVideo } from '../services/auditService';

const MIN_RECORDING_SECONDS = 10;

export function StrictCaptureCamera({ sessionId, onComplete, onCancel }) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device     = useCameraDevice('back');   // STRICT: rear camera only
  const cameraRef  = useRef(null);

  const [recording,    setRecording]    = useState(false);
  const [uploading,    setUploading]    = useState(false);
  const [elapsed,      setElapsed]      = useState(0);
  const [canStop,      setCanStop]      = useState(false);  // enforces minimum duration
  const [uploadStatus, setUploadStatus] = useState('');
  const timerRef = useRef(null);

  // Request camera permission on mount
  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, []);

  // Block back button while recording
  useEffect(() => {
    const handler = () => recording;   // true = block
    BackHandler.addEventListener('hardwareBackPress', handler);
    return () => BackHandler.removeEventListener('hardwareBackPress', handler);
  }, [recording]);

  // Recording elapsed timer
  useEffect(() => {
    if (recording) {
      setElapsed(0);
      setCanStop(false);
      timerRef.current = setInterval(() => {
        setElapsed(prev => {
          const next = prev + 1;
          if (next >= MIN_RECORDING_SECONDS) setCanStop(true);
          return next;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [recording]);

  async function startRecording() {
    if (!cameraRef.current) return;
    try {
      setRecording(true);
      cameraRef.current.startRecording({
        flash: 'off',
        onRecordingFinished: handleRecordingFinished,
        onRecordingError:    handleRecordingError,
      });
    } catch (err) {
      setRecording(false);
      Alert.alert('Camera Error', err.message);
    }
  }

  async function stopRecording() {
    if (!canStop) {
      Alert.alert(
        'Minimum Duration',
        `Please record for at least ${MIN_RECORDING_SECONDS} seconds to ensure a valid audit capture.`
      );
      return;
    }
    try {
      await cameraRef.current.stopRecording();
      setRecording(false);
    } catch (err) {
      setRecording(false);
      Alert.alert('Stop Error', err.message);
    }
  }

  async function handleRecordingFinished(video) {
    setUploading(true);
    setUploadStatus('Uploading audit video…');
    try {
      setUploadStatus('Uploading to secure server…');
      await uploadAuditVideo(sessionId, video.path);
      setUploadStatus('Upload complete ✓');
      setTimeout(onComplete, 800);
    } catch (err) {
      setUploading(false);
      setUploadStatus('');
      Alert.alert(
        'Upload Failed',
        'Could not upload your audit video. Please check your connection and try again.',
        [{ text: 'Retry', onPress: startRecording }, { text: 'Cancel', onPress: onCancel }]
      );
    }
  }

  function handleRecordingError(err) {
    console.error('[StrictCaptureCamera] Recording error:', err);
    setRecording(false);
    Alert.alert('Recording Error', err.message || 'Unknown recording error');
  }

  function handleCancelPress() {
    if (recording) {
      Alert.alert(
        'Stop Recording?',
        'Cancelling will discard this recording. The audit deadline is still active.',
        [
          { text: 'Continue Recording', style: 'cancel' },
          {
            text:    'Discard & Exit',
            style:   'destructive',
            onPress: async () => {
              await cameraRef.current?.stopRecording().catch(() => {});
              setRecording(false);
              onCancel();
            },
          },
        ]
      );
    } else {
      onCancel();
    }
  }

  // ── Permission gate ──────────────────────────────────────────────────────
  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.permissionScreen}>
        <Text style={styles.permissionText}>
          Camera access is required to complete the audit.
        </Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Grant Camera Access</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={styles.permissionScreen}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.permissionText}>Initialising camera…</Text>
      </SafeAreaView>
    );
  }

  // ── Upload overlay ───────────────────────────────────────────────────────
  if (uploading) {
    return (
      <SafeAreaView style={styles.uploadScreen}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.uploadStatusText}>{uploadStatus}</Text>
        <Text style={styles.uploadSubText}>Do not close the app.</Text>
      </SafeAreaView>
    );
  }

  // ── Camera view ──────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!uploading}
        video
        audio={false}       // layout check only — no audio needed
        photo={false}       // STRICT: photo capture disabled
      />

      {/* ── Session watermark ── */}
      <View style={styles.watermark} pointerEvents="none">
        <Text style={styles.watermarkText}>
          AUDIT · {sessionId.slice(-8).toUpperCase()}
        </Text>
      </View>

      {/* ── Instructions banner ── */}
      {!recording && (
        <View style={styles.instructionBanner}>
          <Text style={styles.instructionText}>
            Slowly pan around your entire office space.
            Capture walls, windows, doors, and furniture clearly.
          </Text>
        </View>
      )}

      {/* ── Recording indicator ── */}
      {recording && (
        <View style={styles.recIndicator}>
          <View style={styles.recDot} />
          <Text style={styles.recText}>
            REC  {String(Math.floor(elapsed / 60)).padStart(2, '0')}:
            {String(elapsed % 60).padStart(2, '0')}
          </Text>
          {!canStop && (
            <Text style={styles.minDurationText}>
              Hold for {MIN_RECORDING_SECONDS - elapsed}s more…
            </Text>
          )}
        </View>
      )}

      {/* ── Controls ── */}
      <View style={styles.controls}>
        {/* Cancel — always visible but blocked during upload */}
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={handleCancelPress}
          disabled={uploading}
        >
          <Text style={styles.cancelBtnText}>✕</Text>
        </TouchableOpacity>

        {/* Record / Stop button */}
        {recording ? (
          <TouchableOpacity
            style={[styles.stopBtn, !canStop && styles.stopBtnDisabled]}
            onPress={stopRecording}
            activeOpacity={canStop ? 0.8 : 1}
          >
            <View style={styles.stopIcon} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.recordBtn} onPress={startRecording}>
            <View style={styles.recordIcon} />
          </TouchableOpacity>
        )}

        {/* Placeholder to keep record button centred */}
        <View style={styles.cancelBtn} />
      </View>

      {/* STRICT: Deliberately NO gallery picker button anywhere in this UI */}
    </View>
  );
}

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#000' },

  // ── Watermark ──────────────────────────────────────────────────────────
  watermark: {
    position: 'absolute',
    top:      52,
    right:    16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderRadius:      6,
  },
  watermarkText: {
    color:        'rgba(255,255,255,0.7)',
    fontSize:     10,
    fontWeight:   '700',
    letterSpacing: 1.5,
  },

  // ── Instructions ────────────────────────────────────────────────────────
  instructionBanner: {
    position:         'absolute',
    top:              80,
    left:             20,
    right:            20,
    backgroundColor:  'rgba(0,0,0,0.65)',
    borderRadius:     12,
    padding:          14,
  },
  instructionText: {
    color:      '#fff',
    fontSize:   13,
    lineHeight: 20,
    textAlign:  'center',
  },

  // ── Recording indicator ─────────────────────────────────────────────────
  recIndicator: {
    position:   'absolute',
    top:        52,
    left:       16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical:    6,
    borderRadius:       20,
    gap:               8,
  },
  recDot: {
    width:           10,
    height:          10,
    borderRadius:     5,
    backgroundColor: '#ef4444',
  },
  recText: {
    color:       '#fff',
    fontWeight:  '700',
    fontSize:    13,
    letterSpacing: 1,
  },
  minDurationText: {
    color:    'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginLeft: 4,
  },

  // ── Controls ─────────────────────────────────────────────────────────────
  controls: {
    position:       'absolute',
    bottom:          48,
    left:            0,
    right:           0,
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingHorizontal: 40,
  },
  recordBtn: {
    width:           76,
    height:          76,
    borderRadius:    38,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth:      3,
    borderColor:     '#fff',
    alignItems:      'center',
    justifyContent:  'center',
  },
  recordIcon: {
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: '#ef4444',
  },
  stopBtn: {
    width:           76,
    height:          76,
    borderRadius:    38,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth:      3,
    borderColor:     '#fff',
    alignItems:      'center',
    justifyContent:  'center',
  },
  stopBtnDisabled: {
    opacity: 0.4,
  },
  stopIcon: {
    width:           30,
    height:          30,
    borderRadius:     4,
    backgroundColor: '#f59e0b',
  },
  cancelBtn: {
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  cancelBtnText: {
    color:      '#fff',
    fontSize:   18,
    fontWeight: '700',
  },

  // ── Permission / upload screens ──────────────────────────────────────────
  permissionScreen: {
    flex:            1,
    backgroundColor: '#111827',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         32,
    gap:             20,
  },
  permissionText: {
    color:     '#d1d5db',
    fontSize:  16,
    textAlign: 'center',
    lineHeight: 24,
  },
  permissionBtn: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 28,
    paddingVertical:   14,
    borderRadius:      12,
  },
  permissionBtnText: {
    color:      '#fff',
    fontWeight: '700',
    fontSize:   15,
  },
  uploadScreen: {
    flex:            1,
    backgroundColor: '#111827',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             16,
  },
  uploadStatusText: {
    color:       '#e5e7eb',
    fontSize:    17,
    fontWeight:  '600',
  },
  uploadSubText: {
    color:    '#6b7280',
    fontSize: 13,
  },
});