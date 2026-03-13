// ═══════════════════════════════════════════════════════════════
//  Ghost Business Verifier — Document Capture Screen
//  screens/DocumentScreen.js
//
//  Step 2 of onboarding: upload GST certificate + owner ID
// ═══════════════════════════════════════════════════════════════
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, Alert, ActivityIndicator, Image
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { useState, useRef } from 'react';

const MAX_DOCUMENT_WIDTH = 1200;

const DOC_TYPES = [
  {
    id      : 'gst_cert',
    title   : 'GST Certificate',
    subtitle: 'Registration certificate or acknowledgement',
    icon    : '📄',
    required: true,
  },
  {
    id      : 'shop_license',
    title   : 'Shop / Trade License',
    subtitle: 'Municipal shop act license or trade license',
    icon    : '🏪',
    required: true,
  },
  {
    id      : 'business_reg',
    title   : 'Business Registration',
    subtitle: 'Certificate of Incorporation, MOA, or Partnership deed',
    icon    : '📋',
    required: true,
  },
  {
    id      : 'owner_id',
    title   : 'Owner / Director Photo ID',
    subtitle: 'Aadhaar, PAN, Passport or Driving Licence',
    icon    : '🪪',
    required: true,
  },
  {
    id      : 'utility',
    title   : 'Utility Bill',
    subtitle: 'Electricity, water, or gas bill for address proof',
    icon    : '🏠',
    required: false,
  },
];

// ── Camera capture modal ──────────────────────────────────────
function CameraCapture({ onCapture, onCancel }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [capturing, setCapturing] = useState(false);

  if (!permission?.granted) {
    return (
      <View style={cs.center}>
        <Text style={cs.permText}>Camera permission needed to capture document</Text>
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
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, base64: false });
      // Resize to a reasonable size
      const resized = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: MAX_DOCUMENT_WIDTH } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
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
        {/* Document frame overlay */}
        <View style={cs.frameOverlay}>
          <View style={cs.frameBox}>
            <View style={[cs.corner, cs.cornerTL]} />
            <View style={[cs.corner, cs.cornerTR]} />
            <View style={[cs.corner, cs.cornerBL]} />
            <View style={[cs.corner, cs.cornerBR]} />
          </View>
          <Text style={cs.frameHint}>Align document within the frame</Text>
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

// ── Document card ─────────────────────────────────────────────
function DocCard({ doc, uri, onCapture, onRetake }) {
  return (
    <View style={s.docCard}>
      <View style={s.docHeader}>
        <Text style={s.docIcon}>{doc.icon}</Text>
        <View style={{ flex: 1 }}>
          <View style={s.docTitleRow}>
            <Text style={s.docTitle}>{doc.title}</Text>
            {doc.required
              ? <View style={s.reqBadge}><Text style={s.reqBadgeText}>Required</Text></View>
              : <View style={s.optBadge}><Text style={s.optBadgeText}>Optional</Text></View>}
          </View>
          <Text style={s.docSubtitle}>{doc.subtitle}</Text>
        </View>
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
          <Text style={s.captureBtnText}>Capture Document</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function DocumentScreen({ route, navigation }) {
  const params = route.params;

  const [activeCapture, setActiveCapture] = useState(null); // doc id being captured
  const [captured,      setCaptured]      = useState({});   // { docId: uri }

  const requiredDocs = DOC_TYPES.filter(d => d.required);
  const allRequiredCaptured = requiredDocs.every(d => !!captured[d.id]);

  const handleCapture = (docId) => setActiveCapture(docId);
  const handleRetake  = (docId) => setActiveCapture(docId);

  const handlePhotoTaken = (uri) => {
    setCaptured(prev => ({ ...prev, [activeCapture]: uri }));
    setActiveCapture(null);
  };

  const handleContinue = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('Signboard', {
      ...params,
      documents: captured,
    });
  };

  // Show camera capture mode
  if (activeCapture) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraCapture
          onCapture={handlePhotoTaken}
          onCancel={() => setActiveCapture(null)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>Document Verification</Text>
          <Text style={s.headerSub}>
            Upload clear photos of your business documents. These are used to
            cross-verify your registration details.
          </Text>
        </View>

        {/* Onboarding Steps */}
        <View style={s.stepsRow}>
          {['Business Info', 'Documents', 'Signboard', 'Exterior', 'More…'].map((step, i) => (
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

        {/* Business summary */}
        <View style={s.summaryCard}>
          <Text style={s.summaryName}>{params.businessName}</Text>
          <Text style={s.summaryId}>{params.idType} · {params.businessId}</Text>
          <Text style={s.summaryOwner}>👤 {params.ownerName}</Text>
        </View>

        {/* Tips */}
        <View style={s.tipsBox}>
          <Text style={s.tipsTitle}>📸 Photo Tips</Text>
          <Text style={s.tipItem}>• Ensure document is flat and well-lit</Text>
          <Text style={s.tipItem}>• All four corners must be visible</Text>
          <Text style={s.tipItem}>• Avoid glare, shadows, and blurry shots</Text>
        </View>

        {/* Document cards */}
        {DOC_TYPES.map(doc => (
          <DocCard
            key={doc.id}
            doc={doc}
            uri={captured[doc.id]}
            onCapture={() => handleCapture(doc.id)}
            onRetake={() => handleRetake(doc.id)}
          />
        ))}

        {/* Continue */}
        <TouchableOpacity
          style={[s.continueBtn, !allRequiredCaptured && s.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!allRequiredCaptured}
          activeOpacity={0.8}
        >
          <Text style={s.continueBtnText}>Continue to Signboard Capture  →</Text>
        </TouchableOpacity>

        {!allRequiredCaptured && (
          <Text style={s.hint}>
            Capture all required documents to continue
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

  summaryCard   : { backgroundColor: '#1E293B', borderRadius: 14, padding: 14, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#2563EB' },
  summaryName   : { color: '#F8FAFC', fontSize: 16, fontWeight: 'bold' },
  summaryId     : { color: '#60A5FA', fontSize: 12, marginTop: 2 },
  summaryOwner  : { color: '#94A3B8', fontSize: 13, marginTop: 6 },

  tipsBox       : { backgroundColor: '#172036', borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: '#1E3A5F' },
  tipsTitle     : { color: '#60A5FA', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  tipItem       : { color: '#94A3B8', fontSize: 13, marginBottom: 4 },

  // Doc cards
  docCard       : { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#334155' },
  docHeader     : { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, gap: 12 },
  docIcon       : { fontSize: 28, marginTop: 2 },
  docTitleRow   : { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  docTitle      : { color: '#F8FAFC', fontSize: 15, fontWeight: '600' },
  reqBadge      : { backgroundColor: '#1E3A5F', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  reqBadgeText  : { color: '#60A5FA', fontSize: 10, fontWeight: '600' },
  optBadge      : { backgroundColor: '#1E293B', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#334155' },
  optBadgeText  : { color: '#475569', fontSize: 10, fontWeight: '600' },
  docSubtitle   : { color: '#475569', fontSize: 12 },

  captureBtn    : { backgroundColor: '#0F172A', borderRadius: 10, padding: 16, alignItems: 'center', borderWidth: 2, borderColor: '#334155', borderStyle: 'dashed' },
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

// ── Camera capture styles ─────────────────────────────────────
const cs = StyleSheet.create({
  center        : { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0F1E', padding: 24 },
  permText      : { color: '#F8FAFC', fontSize: 17, textAlign: 'center', marginBottom: 20 },
  btn           : { backgroundColor: '#2563EB', padding: 14, borderRadius: 10, marginBottom: 12 },
  btnText       : { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  cancelBtn     : { padding: 12 },
  cancelText    : { color: '#94A3B8', fontSize: 15 },

  frameOverlay  : { flex: 1, justifyContent: 'center', alignItems: 'center' },
  frameBox      : { width: '82%', aspectRatio: 1.58, position: 'relative' },
  corner        : { position: 'absolute', width: 28, height: 28, borderColor: '#2563EB', borderWidth: 3 },
  cornerTL      : { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0 },
  cornerTR      : { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0 },
  cornerBL      : { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0 },
  cornerBR      : { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0 },
  frameHint     : { color: '#fff', fontSize: 13, marginTop: 16, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },

  camBar        : { backgroundColor: 'rgba(0,0,0,0.7)', padding: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cancelCamBtn  : { padding: 10 },
  cancelCamText : { color: '#fff', fontSize: 16 },
  shootBtn      : { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  shootInner    : { width: 54, height: 54, borderRadius: 27, backgroundColor: '#fff' },
});
