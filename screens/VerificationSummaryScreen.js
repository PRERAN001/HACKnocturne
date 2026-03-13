// ═══════════════════════════════════════════════════════════════
//  Ghost Business Verifier — Verification Summary Screen
//  screens/VerificationSummaryScreen.js
//
//  Displays all collected evidence before final submission:
//    • Business info
//    • Documents uploaded
//    • Signboard photo
//    • Exterior photos
//    • Interior photos
//    • Liveness challenge result
//    • Business details
//    • GPS location
//  User reviews everything before proceeding to live video.
// ═══════════════════════════════════════════════════════════════
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, Image
} from 'react-native';
import * as Haptics from 'expo-haptics';

const BUSINESS_CATEGORY_LABELS = {
  RETAIL       : 'Retail / E-Commerce',
  TECH         : 'Technology / Software',
  MANUFACTURING: 'Manufacturing / Production',
  FOOD         : 'Food & Beverage',
  HEALTHCARE   : 'Healthcare / Pharma',
  EDUCATION    : 'Education / Training',
  FINANCE      : 'Financial Services',
  REAL_ESTATE  : 'Real Estate / Construction',
  LOGISTICS    : 'Logistics / Transport',
  PROFESSIONAL : 'Professional Services',
  HOSPITALITY  : 'Hospitality / Tourism',
  MEDIA        : 'Media / Entertainment',
  AGRICULTURE  : 'Agriculture / Agribusiness',
  OTHER        : 'Other',
};

const DOC_LABELS = {
  gst_cert    : { icon: '📄', label: 'GST Certificate' },
  shop_license: { icon: '🏪', label: 'Shop / Trade License' },
  business_reg: { icon: '📋', label: 'Business Registration' },
  owner_id    : { icon: '🪪', label: 'Owner Photo ID' },
  utility     : { icon: '🏠', label: 'Utility Bill' },
};

const EXTERIOR_LABELS = {
  entrance : { icon: '🚪', label: 'Building Entrance' },
  street   : { icon: '🛣️', label: 'Street View' },
  shopfront: { icon: '🏬', label: 'Shop Front' },
};

const INTERIOR_LABELS = {
  desks    : { icon: '🖥️', label: 'Desks / Workstations' },
  shelves  : { icon: '🗄️', label: 'Shelves / Storage' },
  products : { icon: '📦', label: 'Products / Inventory' },
  equipment: { icon: '⚙️', label: 'Equipment / Machinery' },
};

// ── Evidence section ──────────────────────────────────────────
function EvidenceSection({ title, icon, children, status }) {
  return (
    <View style={s.evidenceSection}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionIcon}>{icon}</Text>
        <Text style={s.sectionTitle}>{title}</Text>
        {status && (
          <View style={[s.statusBadge, status === 'ok' ? s.statusOk : s.statusWarn]}>
            <Text style={[s.statusText, status === 'ok' ? s.statusTextOk : s.statusTextWarn]}>
              {status === 'ok' ? '✓ Ready' : '⚠ Incomplete'}
            </Text>
          </View>
        )}
      </View>
      {children}
    </View>
  );
}

// ── Thumbnail row ─────────────────────────────────────────────
function ThumbnailRow({ items }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.thumbRow}>
      {items.map(item => (
        <View key={item.id} style={s.thumbItem}>
          {item.uri ? (
            <Image source={{ uri: item.uri }} style={s.thumb} resizeMode="cover" />
          ) : (
            <View style={s.thumbMissing}>
              <Text style={s.thumbMissingIcon}>✕</Text>
            </View>
          )}
          <Text style={s.thumbLabel} numberOfLines={1}>{item.icon} {item.label}</Text>
          {item.uri && <Text style={s.thumbDone}>✓</Text>}
        </View>
      ))}
    </ScrollView>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function VerificationSummaryScreen({ route, navigation }) {
  const params = route.params ?? {};

  const {
    // Business info
    businessName, businessId, idType, businessType,
    ownerName, phone, address,
    // Documents
    documents = {},
    // Signboard
    signboardUri,
    // Exterior
    exteriorPhotos = {},
    // Interior
    interiorPhotos = {},
    // Liveness
    livenessCompleted,
    // Business details
    bizPhone, bizEmail, bizCategory, workingDays, workingHours, website,
    // Location
    gpsLocation,
  } = params;

  // Build evidence items
  const docItems = Object.entries(DOC_LABELS).map(([id, meta]) => ({
    id,
    ...meta,
    uri: documents[id] || null,
  }));

  const exteriorItems = Object.entries(EXTERIOR_LABELS).map(([id, meta]) => ({
    id,
    ...meta,
    uri: exteriorPhotos[id] || null,
  }));

  const interiorItems = Object.entries(INTERIOR_LABELS).map(([id, meta]) => ({
    id,
    ...meta,
    uri: interiorPhotos[id] || null,
  }));

  const capturedDocs      = docItems.filter(d => d.uri).length;
  const capturedExterior  = exteriorItems.filter(e => e.uri).length;
  const capturedInterior  = interiorItems.filter(i => i.uri).length;

  const handleSubmit = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    navigation.navigate('Capture', params);
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>📋 Verification Summary</Text>
          <Text style={s.headerSub}>
            Review all collected evidence before submitting for AI verification.
            All data is encrypted end-to-end.
          </Text>
        </View>

        {/* Progress */}
        <View style={s.progressCard}>
          <Text style={s.progressTitle}>Step 8 of 8 — Final Review</Text>
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: '100%' }]} />
          </View>
          <Text style={s.progressText}>🎉 All steps complete — review and submit</Text>
        </View>

        {/* 1. Business Info */}
        <EvidenceSection title="Business Information" icon="🏢" status="ok">
          <View style={s.infoGrid}>
            <InfoRow label="Business Name"    value={businessName} />
            <InfoRow label="Owner"            value={ownerName} />
            <InfoRow label={idType || 'ID'}   value={businessId} />
            <InfoRow label="Phone"            value={phone ? `+91 ${phone}` : '—'} />
            {address ? <InfoRow label="Address" value={address} /> : null}
          </View>
        </EvidenceSection>

        {/* 2. Documents */}
        <EvidenceSection
          title="Documents"
          icon="📄"
          status={capturedDocs >= 4 ? 'ok' : 'warn'}
        >
          <Text style={s.subCount}>{capturedDocs} of {docItems.length} documents captured</Text>
          <ThumbnailRow items={docItems} />
        </EvidenceSection>

        {/* 3. Signboard */}
        <EvidenceSection title="Business Signboard" icon="📛" status={signboardUri ? 'ok' : 'warn'}>
          {signboardUri ? (
            <Image source={{ uri: signboardUri }} style={s.signboardThumb} resizeMode="cover" />
          ) : (
            <View style={s.missingItem}>
              <Text style={s.missingText}>⚠ No signboard photo captured</Text>
            </View>
          )}
        </EvidenceSection>

        {/* 4. Exterior */}
        <EvidenceSection
          title="Exterior Photos"
          icon="🏬"
          status={capturedExterior === exteriorItems.length ? 'ok' : 'warn'}
        >
          <Text style={s.subCount}>{capturedExterior} of {exteriorItems.length} exterior photos</Text>
          <ThumbnailRow items={exteriorItems} />
        </EvidenceSection>

        {/* 5. Interior */}
        <EvidenceSection
          title="Interior Evidence"
          icon="🏢"
          status={capturedInterior >= 2 ? 'ok' : 'warn'}
        >
          <Text style={s.subCount}>{capturedInterior} of {interiorItems.length} interior photos</Text>
          <ThumbnailRow items={interiorItems} />
        </EvidenceSection>

        {/* 6. Liveness */}
        <EvidenceSection title="Liveness Challenge" icon="🔴" status={livenessCompleted ? 'ok' : 'warn'}>
          <View style={[s.livenessBadge, livenessCompleted ? s.livenessBadgeOk : s.livenessBadgeWarn]}>
            <Text style={[s.livenessText, livenessCompleted ? s.livenessTextOk : s.livenessTextWarn]}>
              {livenessCompleted ? '✅ All liveness challenges passed' : '⚠ Liveness not verified'}
            </Text>
          </View>
        </EvidenceSection>

        {/* 7. Business Details */}
        <EvidenceSection title="Business Details" icon="📋" status={bizEmail ? 'ok' : 'warn'}>
          <View style={s.infoGrid}>
            {bizPhone    && <InfoRow label="Business Phone" value={`+91 ${bizPhone}`} />}
            {bizEmail    && <InfoRow label="Business Email" value={bizEmail} />}
            {bizCategory && <InfoRow label="Category" value={BUSINESS_CATEGORY_LABELS[bizCategory] || bizCategory} />}
            {workingDays && <InfoRow label="Working Days"  value={workingDays} />}
            {workingHours&& <InfoRow label="Working Hours" value={workingHours} />}
            {website     && <InfoRow label="Website"       value={website} />}
          </View>
        </EvidenceSection>

        {/* 8. GPS Location */}
        <EvidenceSection title="GPS Location" icon="📍" status={gpsLocation?.latitude ? 'ok' : 'warn'}>
          {gpsLocation?.latitude ? (
            <View style={s.gpsCard}>
              <View style={s.gpsRow}>
                <View style={s.gpsItem}>
                  <Text style={s.gpsLabel}>LATITUDE</Text>
                  <Text style={s.gpsValue}>{gpsLocation.latitude.toFixed(6)}°</Text>
                </View>
                <View style={s.gpsDivider} />
                <View style={s.gpsItem}>
                  <Text style={s.gpsLabel}>LONGITUDE</Text>
                  <Text style={s.gpsValue}>{gpsLocation.longitude.toFixed(6)}°</Text>
                </View>
              </View>
              {gpsLocation.address ? (
                <Text style={s.gpsAddress} numberOfLines={2}>{gpsLocation.address}</Text>
              ) : null}
              {gpsLocation.accuracy != null && (
                <Text style={s.gpsAccuracy}>Accuracy: ±{Math.round(gpsLocation.accuracy)}m</Text>
              )}
            </View>
          ) : (
            <View style={s.missingItem}>
              <Text style={s.missingText}>⚠ GPS location not confirmed</Text>
            </View>
          )}
        </EvidenceSection>

        {/* Final info */}
        <View style={s.finalInfoBox}>
          <Text style={s.finalInfoIcon}>🎥</Text>
          <Text style={s.finalInfoText}>
            After submitting, you will be asked to record a 30-second live
            walk-in video. All collected evidence will be submitted together
            for AI-powered KYB verification.
          </Text>
        </View>

        {/* Submit */}
        <TouchableOpacity style={s.submitBtn} onPress={handleSubmit} activeOpacity={0.8}>
          <Text style={s.submitBtnText}>Submit & Start Live Video  →</Text>
        </TouchableOpacity>

        <Text style={s.hint}>
          🔒 All data is encrypted and processed securely
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Helper component ──────────────────────────────────────────
function InfoRow({ label, value }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue} numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe          : { flex: 1, backgroundColor: '#0A0F1E' },
  scroll        : { padding: 20, paddingBottom: 48 },

  header        : { marginBottom: 20 },
  headerTitle   : { color: '#F8FAFC', fontSize: 24, fontWeight: 'bold', marginBottom: 6 },
  headerSub     : { color: '#94A3B8', fontSize: 14, lineHeight: 22 },

  progressCard  : { backgroundColor: '#1E293B', borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: '#334155' },
  progressTitle : { color: '#60A5FA', fontSize: 13, fontWeight: '700', marginBottom: 10 },
  progressBar   : { height: 6, backgroundColor: '#0F172A', borderRadius: 3, marginBottom: 8, overflow: 'hidden' },
  progressFill  : { height: '100%', backgroundColor: '#16A34A', borderRadius: 3 },
  progressText  : { color: '#4ADE80', fontSize: 12, fontWeight: '600' },

  evidenceSection: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#334155' },
  sectionHeader : { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionIcon   : { fontSize: 20 },
  sectionTitle  : { color: '#F8FAFC', fontSize: 15, fontWeight: '700', flex: 1 },
  statusBadge   : { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statusOk      : { backgroundColor: '#052E16' },
  statusWarn    : { backgroundColor: '#1A1200' },
  statusText    : { fontSize: 11, fontWeight: '700' },
  statusTextOk  : { color: '#4ADE80' },
  statusTextWarn: { color: '#FCD34D' },

  infoGrid      : { gap: 8 },
  infoRow       : { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#0F172A' },
  infoLabel     : { color: '#475569', fontSize: 12, fontWeight: '600', flex: 0.45 },
  infoValue     : { color: '#94A3B8', fontSize: 13, flex: 0.55, textAlign: 'right' },

  subCount      : { color: '#475569', fontSize: 12, marginBottom: 10 },

  thumbRow      : { marginHorizontal: -4 },
  thumbItem     : { width: 110, marginHorizontal: 4, alignItems: 'center' },
  thumb         : { width: 100, height: 70, borderRadius: 8, marginBottom: 6 },
  thumbMissing  : { width: 100, height: 70, borderRadius: 8, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center', marginBottom: 6, borderWidth: 1, borderColor: '#334155', borderStyle: 'dashed' },
  thumbMissingIcon: { color: '#334155', fontSize: 20 },
  thumbLabel    : { color: '#475569', fontSize: 10, textAlign: 'center', width: 100 },
  thumbDone     : { color: '#4ADE80', fontSize: 11, fontWeight: 'bold', marginTop: 2 },

  signboardThumb: { width: '100%', height: 120, borderRadius: 10 },

  missingItem   : { backgroundColor: '#1A1200', borderRadius: 8, padding: 12, alignItems: 'center' },
  missingText   : { color: '#FCD34D', fontSize: 13, fontWeight: '600' },

  livenessBadge : { borderRadius: 10, padding: 12, alignItems: 'center' },
  livenessBadgeOk  : { backgroundColor: '#052E16', borderWidth: 1, borderColor: '#16A34A' },
  livenessBadgeWarn: { backgroundColor: '#1A1200', borderWidth: 1, borderColor: '#92400E' },
  livenessText  : { fontSize: 14, fontWeight: '600' },
  livenessTextOk  : { color: '#4ADE80' },
  livenessTextWarn: { color: '#FCD34D' },

  gpsCard       : { backgroundColor: '#0F172A', borderRadius: 12, padding: 14 },
  gpsRow        : { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  gpsItem       : { flex: 1, alignItems: 'center' },
  gpsDivider    : { width: 1, height: 40, backgroundColor: '#334155' },
  gpsLabel      : { color: '#475569', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  gpsValue      : { color: '#60A5FA', fontSize: 15, fontWeight: 'bold' },
  gpsAddress    : { color: '#94A3B8', fontSize: 12, lineHeight: 18, marginTop: 4 },
  gpsAccuracy   : { color: '#4ADE80', fontSize: 11, marginTop: 6 },

  finalInfoBox  : { backgroundColor: '#1E293B', borderRadius: 12, padding: 14, marginBottom: 20, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderLeftWidth: 3, borderLeftColor: '#2563EB' },
  finalInfoIcon : { fontSize: 20, marginTop: 1 },
  finalInfoText : { color: '#94A3B8', fontSize: 13, lineHeight: 20, flex: 1 },

  submitBtn     : { backgroundColor: '#2563EB', padding: 18, borderRadius: 14, alignItems: 'center', marginBottom: 12 },
  submitBtnText : { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  hint          : { color: '#475569', fontSize: 12, textAlign: 'center' },
});
