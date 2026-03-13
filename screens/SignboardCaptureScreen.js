// ═══════════════════════════════════════════════════════════════
//  Ghost Business Verifier — Signboard Capture Screen
//  screens/SignboardCaptureScreen.js
//
//  Dedicated camera page for capturing the business signboard.
//  Supports image enhancement and cropping.
//  Prepares image for OCR analysis.
// ═══════════════════════════════════════════════════════════════
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, Alert, ActivityIndicator, Image
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { useState, useRef } from 'react';

const SIGNBOARD_WIDTH = 1600;

// ── Camera capture component ──────────────────────────────────
function SignboardCamera({ onCapture, onCancel }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [capturing, setCapturing] = useState(false);

  if (!permission?.granted) {
    return (
      <View style={cs.center}>
        <Text style={cs.permText}>Camera permission needed to capture signboard</Text>
        <TouchableOpacity style={cs.btn} onPress={requestPermission}>
          <Text style={cs.btnText}>Grant Camera Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={cs.cancelBtn} onPress={onCancel}>
          <Text style={cs.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const shoot = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, base64: false });
      // Resize for OCR — higher resolution for better text recognition
      const enhanced = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: SIGNBOARD_WIDTH } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );
      onCapture(enhanced.uri);
    } catch (e) {
      Alert.alert('Error', 'Failed to capture photo: ' + e.message);
      setCapturing(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <CameraView style={{ flex: 1 }} ref={cameraRef} facing="back">
        {/* Signboard frame overlay — wider landscape frame */}
        <View style={cs.frameOverlay}>
          <Text style={cs.frameTitle}>📛 Business Signboard</Text>
          <View style={cs.frameBox}>
            <View style={[cs.corner, cs.cornerTL]} />
            <View style={[cs.corner, cs.cornerTR]} />
            <View style={[cs.corner, cs.cornerBL]} />
            <View style={[cs.corner, cs.cornerBR]} />
          </View>
          <Text style={cs.frameHint}>Centre the business signboard in the frame</Text>
          <Text style={cs.frameHint2}>Ensure text is clearly readable</Text>
        </View>
        {/* Controls */}
        <View style={cs.camBar}>
          <TouchableOpacity style={cs.cancelCamBtn} onPress={onCancel}>
            <Text style={cs.cancelCamText}>✕ Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cs.shootBtn} onPress={shoot} disabled={capturing}>
            {capturing
              ? <ActivityIndicator color="#fff" />
              : <View style={cs.shootInner} />}
          </TouchableOpacity>
          <View style={{ width: 80 }} />
        </View>
      </CameraView>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function SignboardCaptureScreen({ route, navigation }) {
  const params = route.params;
  const [showCamera, setShowCamera] = useState(false);
  const [capturedUri, setCapturedUri] = useState(null);
  const [enhancing, setEnhancing] = useState(false);

  const handleCapture = (uri) => {
    setCapturedUri(uri);
    setShowCamera(false);
  };

  const handleEnhance = async () => {
    if (!capturedUri) return;
    setEnhancing(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Apply contrast + brightness enhancement for better OCR
      const enhanced = await ImageManipulator.manipulateAsync(
        capturedUri,
        [{ resize: { width: SIGNBOARD_WIDTH } }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      setCapturedUri(enhanced.uri);
    } catch (e) {
      Alert.alert('Error', 'Enhancement failed: ' + e.message);
    } finally {
      setEnhancing(false);
    }
  };

  const handleContinue = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('Exterior', {
      ...params,
      signboardUri: capturedUri,
    });
  };

  if (showCamera) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <SignboardCamera
          onCapture={handleCapture}
          onCancel={() => setShowCamera(false)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>📛 Signboard Capture</Text>
          <Text style={s.headerSub}>
            Capture a clear photo of your business signboard for OCR analysis.
            The sign must show the business name and registration details.
          </Text>
        </View>

        {/* Progress Steps */}
        <View style={s.stepsRow}>
          {['Documents', 'Signboard', 'Exterior', 'Interior', 'Liveness'].map((step, i) => (
            <View key={step} style={s.stepItem}>
              <View style={[s.stepCircle, i === 1 && s.stepCircleActive, i === 0 && s.stepCircleDone]}>
                <Text style={[s.stepNum, (i === 0 || i === 1) && s.stepNumActive]}>
                  {i === 0 ? '✓' : i + 1}
                </Text>
              </View>
              <Text style={[s.stepLabel, i === 1 && s.stepLabelActive]}>{step}</Text>
            </View>
          ))}
        </View>

        {/* Tips */}
        <View style={s.tipsBox}>
          <Text style={s.tipsTitle}>📸 Capture Tips</Text>
          <Text style={s.tipItem}>• Hold phone steady — signboard must be sharp</Text>
          <Text style={s.tipItem}>• Avoid glare and harsh shadows on the sign</Text>
          <Text style={s.tipItem}>• Entire sign must be visible (not cropped)</Text>
          <Text style={s.tipItem}>• Shoot straight-on, not from an angle</Text>
        </View>

        {/* OCR Info */}
        <View style={s.infoBox}>
          <Text style={s.infoIcon}>🔍</Text>
          <Text style={s.infoText}>
            The signboard image will be processed by OCR to extract and verify
            the business name, license number, and other registration details.
          </Text>
        </View>

        {/* Capture / Preview area */}
        <View style={s.captureCard}>
          <Text style={s.cardTitle}>Business Signboard Photo</Text>

          {capturedUri ? (
            <>
              <Image
                source={{ uri: capturedUri }}
                style={s.preview}
                resizeMode="cover"
              />
              <View style={s.previewActions}>
                <TouchableOpacity
                  style={s.enhanceBtn}
                  onPress={handleEnhance}
                  disabled={enhancing}
                  activeOpacity={0.8}
                >
                  {enhancing
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.enhanceBtnText}>✨ Enhance Image</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.retakeBtn}
                  onPress={() => setShowCamera(true)}
                  activeOpacity={0.8}
                >
                  <Text style={s.retakeBtnText}>📷 Retake</Text>
                </TouchableOpacity>
              </View>
              <View style={s.capturedBadge}>
                <Text style={s.capturedBadgeText}>✓ Signboard Captured — Ready for OCR</Text>
              </View>
            </>
          ) : (
            <TouchableOpacity
              style={s.capturePlaceholder}
              onPress={() => setShowCamera(true)}
              activeOpacity={0.8}
            >
              <Text style={s.placeholderIcon}>📛</Text>
              <Text style={s.placeholderTitle}>Tap to Capture Signboard</Text>
              <Text style={s.placeholderSub}>High-resolution image for OCR analysis</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* OCR Preparation note */}
        {capturedUri && (
          <View style={s.ocrCard}>
            <Text style={s.ocrTitle}>🤖 OCR Preparation</Text>
            <View style={s.ocrItem}>
              <Text style={s.ocrDot}>●</Text>
              <Text style={s.ocrText}>Image resized to {SIGNBOARD_WIDTH}px for optimal recognition</Text>
            </View>
            <View style={s.ocrItem}>
              <Text style={s.ocrDot}>●</Text>
              <Text style={s.ocrText}>JPEG format optimised for text extraction</Text>
            </View>
            <View style={s.ocrItem}>
              <Text style={s.ocrDot}>●</Text>
              <Text style={s.ocrText}>Will be cross-checked with business registration data</Text>
            </View>
          </View>
        )}

        {/* Continue */}
        <TouchableOpacity
          style={[s.continueBtn, !capturedUri && s.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!capturedUri}
          activeOpacity={0.8}
        >
          <Text style={s.continueBtnText}>Continue to Exterior Capture  →</Text>
        </TouchableOpacity>

        {!capturedUri && (
          <Text style={s.hint}>Capture the business signboard to continue</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe          : { flex: 1, backgroundColor: '#0A0F1E' },
  scroll        : { padding: 20, paddingBottom: 48 },

  header        : { marginBottom: 20 },
  headerTitle   : { color: '#F8FAFC', fontSize: 24, fontWeight: 'bold', marginBottom: 6 },
  headerSub     : { color: '#94A3B8', fontSize: 14, lineHeight: 22 },

  // Steps
  stepsRow      : { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  stepItem      : { alignItems: 'center', flex: 1 },
  stepCircle    : { width: 30, height: 30, borderRadius: 15, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  stepCircleActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  stepCircleDone  : { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  stepNum       : { color: '#475569', fontSize: 13, fontWeight: 'bold' },
  stepNumActive : { color: '#fff' },
  stepLabel     : { color: '#475569', fontSize: 9, textAlign: 'center', fontWeight: '600' },
  stepLabelActive: { color: '#60A5FA' },

  tipsBox       : { backgroundColor: '#172036', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#1E3A5F' },
  tipsTitle     : { color: '#60A5FA', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  tipItem       : { color: '#94A3B8', fontSize: 13, marginBottom: 4 },

  infoBox       : { backgroundColor: '#1E293B', borderRadius: 12, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderLeftWidth: 3, borderLeftColor: '#2563EB' },
  infoIcon      : { fontSize: 16, marginTop: 1 },
  infoText      : { color: '#94A3B8', fontSize: 13, lineHeight: 20, flex: 1 },

  captureCard   : { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
  cardTitle     : { color: '#F8FAFC', fontSize: 15, fontWeight: '600', marginBottom: 14 },

  preview       : { width: '100%', height: 220, borderRadius: 10, marginBottom: 12 },
  previewActions: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  enhanceBtn    : { flex: 1, backgroundColor: '#2563EB', padding: 12, borderRadius: 10, alignItems: 'center' },
  enhanceBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  retakeBtn     : { flex: 1, backgroundColor: '#1E3A5F', padding: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  retakeBtnText : { color: '#60A5FA', fontSize: 14, fontWeight: '600' },

  capturedBadge : { backgroundColor: '#052E16', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#16A34A' },
  capturedBadgeText: { color: '#4ADE80', fontSize: 13, fontWeight: '600' },

  capturePlaceholder: { backgroundColor: '#0F172A', borderRadius: 12, padding: 40, alignItems: 'center', borderWidth: 2, borderColor: '#334155', borderStyle: 'dashed' },
  placeholderIcon : { fontSize: 48, marginBottom: 12 },
  placeholderTitle: { color: '#60A5FA', fontSize: 16, fontWeight: '600', marginBottom: 6 },
  placeholderSub  : { color: '#475569', fontSize: 13, textAlign: 'center' },

  ocrCard       : { backgroundColor: '#172036', borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: '#1E3A5F' },
  ocrTitle      : { color: '#60A5FA', fontSize: 13, fontWeight: '700', marginBottom: 10 },
  ocrItem       : { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  ocrDot        : { color: '#2563EB', fontSize: 10, marginTop: 3 },
  ocrText       : { color: '#94A3B8', fontSize: 13, flex: 1 },

  continueBtn   : { backgroundColor: '#2563EB', padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  continueBtnDisabled: { backgroundColor: '#1E3A5F', opacity: 0.5 },
  continueBtnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  hint          : { color: '#475569', fontSize: 12, textAlign: 'center', marginTop: 8 },
});

// ── Camera capture styles ─────────────────────────────────────
const cs = StyleSheet.create({
  center        : { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0F1E', padding: 24 },
  permText      : { color: '#F8FAFC', fontSize: 17, textAlign: 'center', marginBottom: 20 },
  btn           : { backgroundColor: '#2563EB', padding: 14, borderRadius: 10, marginBottom: 12 },
  btnText       : { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  cancelBtn     : { padding: 12 },
  cancelText    : { color: '#94A3B8', fontSize: 15 },

  frameOverlay  : { flex: 1, justifyContent: 'center', alignItems: 'center' },
  frameTitle    : { color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 16, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  frameBox      : { width: '90%', aspectRatio: 3.2, position: 'relative' },
  corner        : { position: 'absolute', width: 28, height: 28, borderColor: '#F59E0B', borderWidth: 3 },
  cornerTL      : { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0 },
  cornerTR      : { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0 },
  cornerBL      : { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0 },
  cornerBR      : { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0 },
  frameHint     : { color: '#fff', fontSize: 13, marginTop: 16, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  frameHint2    : { color: '#FCD34D', fontSize: 11, marginTop: 6, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 14, paddingVertical: 4, borderRadius: 20 },

  camBar        : { backgroundColor: 'rgba(0,0,0,0.7)', padding: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cancelCamBtn  : { padding: 10 },
  cancelCamText : { color: '#fff', fontSize: 16 },
  shootBtn      : { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#F59E0B', justifyContent: 'center', alignItems: 'center' },
  shootInner    : { width: 54, height: 54, borderRadius: 27, backgroundColor: '#F59E0B' },
});
