// ═══════════════════════════════════════════════════════════════
//  Ghost Business Verifier — Interior Business Evidence Screen
//  screens/InteriorCaptureScreen.js
//
//  Capture images showing the inside of the business:
//    • Desks / workstations
//    • Shelves / storage
//    • Products / inventory
//    • Equipment / machinery
//  Helps detect fake addresses or residential locations.
// ═══════════════════════════════════════════════════════════════
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, Alert, ActivityIndicator, Image
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { useState, useRef } from 'react';

const INTERIOR_PHOTO_WIDTH = 1400;
const MIN_REQUIRED = 2; // Minimum photos required to proceed

const INTERIOR_SLOTS = [
  {
    id     : 'desks',
    title  : 'Desks / Workstations',
    subtitle: 'Show office desks, computers, or work areas',
    icon   : '🖥️',
    hint   : 'Pan slowly across all visible workstations',
  },
  {
    id     : 'shelves',
    title  : 'Shelves / Storage',
    subtitle: 'Display shelving units, filing cabinets, or storage areas',
    icon   : '🗄️',
    hint   : 'Capture labelled shelves or organised storage clearly',
  },
  {
    id     : 'products',
    title  : 'Products / Inventory',
    subtitle: 'Show products, stock, or display items if applicable',
    icon   : '📦',
    hint   : 'Include branded packaging or labelled stock if available',
  },
  {
    id     : 'equipment',
    title  : 'Equipment / Machinery',
    subtitle: 'Show business-specific equipment or machinery',
    icon   : '⚙️',
    hint   : 'Capture any specialized equipment used in operations',
  },
];

// ── Camera component ──────────────────────────────────────────
function InteriorCamera({ slot, onCapture, onCancel }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [capturing, setCapturing] = useState(false);

  if (!permission?.granted) {
    return (
      <View style={cs.center}>
        <Text style={cs.permText}>Camera permission needed</Text>
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
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, base64: false });
      const resized = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: INTERIOR_PHOTO_WIDTH } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
      );
      onCapture(resized.uri);
    } catch (e) {
      Alert.alert('Error', 'Failed to capture photo: ' + e.message);
      setCapturing(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <CameraView style={{ flex: 1 }} ref={cameraRef} facing="back">
        <View style={cs.frameOverlay}>
          <View style={cs.slotLabel}>
            <Text style={cs.slotIcon}>{slot.icon}</Text>
            <Text style={cs.slotTitle}>{slot.title}</Text>
          </View>
          <Text style={cs.frameHint}>{slot.hint}</Text>
          <Text style={cs.fraudWarning}>🛡️ AI fraud detection active</Text>
        </View>
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

// ── Interior photo card ───────────────────────────────────────
function InteriorCard({ slot, uri, onCapture, onRetake }) {
  return (
    <View style={s.photoCard}>
      <View style={s.cardHeader}>
        <Text style={s.cardIcon}>{slot.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>{slot.title}</Text>
          <Text style={s.cardSubtitle}>{slot.subtitle}</Text>
        </View>
        {uri ? (
          <View style={s.doneBadge}><Text style={s.doneBadgeText}>✓</Text></View>
        ) : (
          <View style={s.optBadge}><Text style={s.optBadgeText}>Optional</Text></View>
        )}
      </View>

      {uri ? (
        <View style={s.previewWrap}>
          <Image source={{ uri }} style={s.preview} resizeMode="cover" />
          <View style={s.previewOverlay}>
            <Text style={s.previewDone}>✓ Captured</Text>
            <TouchableOpacity style={s.retakeBtn} onPress={onRetake}>
              <Text style={s.retakeText}>Retake</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={s.captureBtn} onPress={onCapture} activeOpacity={0.8}>
          <Text style={s.captureBtnIcon}>📷</Text>
          <Text style={s.captureBtnText}>Capture {slot.title}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function InteriorCaptureScreen({ route, navigation }) {
  const params = route.params;
  const [activeSlot, setActiveSlot] = useState(null);
  const [captured, setCaptured]     = useState({});

  const capturedCount = Object.keys(captured).length;
  const canProceed    = capturedCount >= MIN_REQUIRED;

  const handlePhotoTaken = (uri) => {
    setCaptured(prev => ({ ...prev, [activeSlot]: uri }));
    setActiveSlot(null);
  };

  const activeSlotDef = INTERIOR_SLOTS.find(s => s.id === activeSlot);

  if (activeSlot) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <InteriorCamera
          slot={activeSlotDef}
          onCapture={handlePhotoTaken}
          onCancel={() => setActiveSlot(null)}
        />
      </SafeAreaView>
    );
  }

  const handleContinue = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('LivenessChallenge', {
      ...params,
      interiorPhotos: captured,
    });
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>🏢 Interior Evidence</Text>
          <Text style={s.headerSub}>
            Capture photos of the business interior. This helps our AI detect
            fake addresses, residential locations, and verify business activity.
          </Text>
        </View>

        {/* Progress Steps */}
        <View style={s.stepsRow}>
          {['Documents', 'Signboard', 'Exterior', 'Interior', 'Liveness'].map((step, i) => (
            <View key={step} style={s.stepItem}>
              <View style={[
                s.stepCircle,
                i === 3 && s.stepCircleActive,
                i < 3 && s.stepCircleDone
              ]}>
                <Text style={[s.stepNum, i <= 3 && s.stepNumActive]}>
                  {i < 3 ? '✓' : i + 1}
                </Text>
              </View>
              <Text style={[s.stepLabel, i === 3 && s.stepLabelActive]}>{step}</Text>
            </View>
          ))}
        </View>

        {/* Progress summary */}
        <View style={s.progressCard}>
          <Text style={s.progressTitle}>📊 Capture Progress</Text>
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${(capturedCount / INTERIOR_SLOTS.length) * 100}%` }]} />
          </View>
          <Text style={s.progressText}>
            {capturedCount} of {INTERIOR_SLOTS.length} photos captured
            {capturedCount < MIN_REQUIRED ? ` (${MIN_REQUIRED} minimum required)` : ' ✓'}
          </Text>
        </View>

        {/* Fraud detection notice */}
        <View style={s.fraudBox}>
          <Text style={s.fraudIcon}>🛡️</Text>
          <Text style={s.fraudText}>
            AI will analyse these photos to detect residential objects (beds, sofas, kitchens)
            that may indicate a fake business address.
          </Text>
        </View>

        {/* Tips */}
        <View style={s.tipsBox}>
          <Text style={s.tipsTitle}>📸 Interior Photo Tips</Text>
          <Text style={s.tipItem}>• Show as much of the room as possible</Text>
          <Text style={s.tipItem}>• Ensure good lighting — avoid dark or blurry shots</Text>
          <Text style={s.tipItem}>• Include relevant business items in the frame</Text>
        </View>

        {/* Photo slots */}
        {INTERIOR_SLOTS.map(slot => (
          <InteriorCard
            key={slot.id}
            slot={slot}
            uri={captured[slot.id]}
            onCapture={() => setActiveSlot(slot.id)}
            onRetake={() => setActiveSlot(slot.id)}
          />
        ))}

        {/* Continue */}
        <TouchableOpacity
          style={[s.continueBtn, !canProceed && s.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!canProceed}
          activeOpacity={0.8}
        >
          <Text style={s.continueBtnText}>Continue to Liveness Challenge  →</Text>
        </TouchableOpacity>

        {!canProceed && (
          <Text style={s.hint}>
            Capture at least {MIN_REQUIRED} interior photos to continue
          </Text>
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

  stepsRow      : { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  stepItem      : { alignItems: 'center', flex: 1 },
  stepCircle    : { width: 30, height: 30, borderRadius: 15, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  stepCircleActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  stepCircleDone  : { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  stepNum       : { color: '#475569', fontSize: 13, fontWeight: 'bold' },
  stepNumActive : { color: '#fff' },
  stepLabel     : { color: '#475569', fontSize: 9, textAlign: 'center', fontWeight: '600' },
  stepLabelActive: { color: '#60A5FA' },

  progressCard  : { backgroundColor: '#1E293B', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
  progressTitle : { color: '#94A3B8', fontSize: 12, fontWeight: '700', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  progressBar   : { height: 6, backgroundColor: '#0F172A', borderRadius: 3, marginBottom: 8, overflow: 'hidden' },
  progressFill  : { height: '100%', backgroundColor: '#2563EB', borderRadius: 3 },
  progressText  : { color: '#60A5FA', fontSize: 13, fontWeight: '600' },

  fraudBox      : { backgroundColor: '#1A0D0D', borderRadius: 12, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderLeftWidth: 3, borderLeftColor: '#DC2626' },
  fraudIcon     : { fontSize: 16, marginTop: 1 },
  fraudText     : { color: '#FCA5A5', fontSize: 13, lineHeight: 20, flex: 1 },

  tipsBox       : { backgroundColor: '#172036', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#1E3A5F' },
  tipsTitle     : { color: '#60A5FA', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  tipItem       : { color: '#94A3B8', fontSize: 13, marginBottom: 4 },

  photoCard     : { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#334155' },
  cardHeader    : { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, gap: 12 },
  cardIcon      : { fontSize: 28, marginTop: 2 },
  cardTitle     : { color: '#F8FAFC', fontSize: 15, fontWeight: '600', marginBottom: 2 },
  cardSubtitle  : { color: '#475569', fontSize: 12, lineHeight: 18 },
  doneBadge     : { width: 26, height: 26, borderRadius: 13, backgroundColor: '#16A34A', justifyContent: 'center', alignItems: 'center' },
  doneBadgeText : { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  optBadge      : { backgroundColor: '#1E293B', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#334155', justifyContent: 'center' },
  optBadgeText  : { color: '#475569', fontSize: 10, fontWeight: '600' },

  captureBtn    : { backgroundColor: '#0F172A', borderRadius: 10, padding: 18, alignItems: 'center', borderWidth: 2, borderColor: '#334155', borderStyle: 'dashed' },
  captureBtnIcon: { fontSize: 24, marginBottom: 6 },
  captureBtnText: { color: '#60A5FA', fontSize: 14, fontWeight: '600' },

  previewWrap   : { borderRadius: 10, overflow: 'hidden' },
  preview       : { width: '100%', height: 180, borderRadius: 10 },
  previewOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewDone   : { color: '#4ADE80', fontSize: 14, fontWeight: 'bold' },
  retakeBtn     : { backgroundColor: '#1E293B', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  retakeText    : { color: '#94A3B8', fontSize: 12, fontWeight: '600' },

  continueBtn   : { backgroundColor: '#2563EB', padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  continueBtnDisabled: { backgroundColor: '#1E3A5F', opacity: 0.5 },
  continueBtnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  hint          : { color: '#475569', fontSize: 12, textAlign: 'center', marginTop: 8 },
});

// ── Camera styles ─────────────────────────────────────────────
const cs = StyleSheet.create({
  center        : { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0F1E', padding: 24 },
  permText      : { color: '#F8FAFC', fontSize: 17, textAlign: 'center', marginBottom: 20 },
  btn           : { backgroundColor: '#2563EB', padding: 14, borderRadius: 10, marginBottom: 12 },
  btnText       : { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  cancelBtn     : { padding: 12 },
  cancelText    : { color: '#94A3B8', fontSize: 15 },

  frameOverlay  : { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  slotLabel     : { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24 },
  slotIcon      : { fontSize: 20 },
  slotTitle     : { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  frameHint     : { color: '#fff', fontSize: 12, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, textAlign: 'center', marginHorizontal: 20 },
  fraudWarning  : { color: '#FCA5A5', fontSize: 11, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16 },

  camBar        : { backgroundColor: 'rgba(0,0,0,0.7)', padding: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cancelCamBtn  : { padding: 10 },
  cancelCamText : { color: '#fff', fontSize: 16 },
  shootBtn      : { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  shootInner    : { width: 54, height: 54, borderRadius: 27, backgroundColor: '#fff' },
});
