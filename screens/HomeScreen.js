// ═══════════════════════════════════════════════════════════════
//  Ghost Business Verifier — Home Screen
//  screens/HomeScreen.js
// ═══════════════════════════════════════════════════════════════
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ScrollView, Modal, FlatList
} from 'react-native';
import { useState } from 'react';

const BUSINESS_TYPES = [
  { label: 'Private Limited (Pvt Ltd)',   value: 'PVT_LTD' },
  { label: 'Public Limited (Ltd)',         value: 'LTD' },
  { label: 'Limited Liability Partnership (LLP)', value: 'LLP' },
  { label: 'One Person Company (OPC)',    value: 'OPC' },
  { label: 'Partnership Firm',            value: 'PARTNERSHIP' },
  { label: 'Sole Proprietorship',         value: 'PROPRIETORSHIP' },
  { label: 'Section 8 / NGO',             value: 'NGO' },
  { label: 'Startup (DPIIT Recognized)',  value: 'STARTUP' },
];

const ID_TYPES = [
  { label: 'GST Number',     value: 'GST',   placeholder: 'e.g. 27AAACR5055K1Z5' },
  { label: 'CIN Number',     value: 'CIN',   placeholder: 'e.g. U72900MH2020PTC345678' },
  { label: 'UDYAM Number',   value: 'UDYAM', placeholder: 'e.g. UDYAM-MH-14-0012345' },
  { label: 'PAN Number',     value: 'PAN',   placeholder: 'e.g. AAACR5055K' },
];

// ── Mini-dropdown component ───────────────────────────────────
function Dropdown({ label, options, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const found = options.find(o => o.value === selected);
  return (
    <>
      <TouchableOpacity style={s.dropdownBtn} onPress={() => setOpen(true)} activeOpacity={0.8}>
        <Text style={found ? s.dropdownSelected : s.dropdownPlaceholder}>
          {found ? found.label : `Select ${label}`}
        </Text>
        <Text style={s.dropdownArrow}>▾</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={i => i.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.sheetItem, item.value === selected && s.sheetItemActive]}
                  onPress={() => { onSelect(item.value); setOpen(false); }}
                >
                  <Text style={[s.sheetItemText, item.value === selected && s.sheetItemTextActive]}>
                    {item.label}
                  </Text>
                  {item.value === selected && <Text style={s.check}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export default function HomeScreen({ navigation }) {
  const [businessName, setBusinessName] = useState('');
  const [idType,       setIdType]       = useState('GST');
  const [businessId,   setBusinessId]   = useState('');
  const [bizType,      setBizType]      = useState('');
  const [ownerName,    setOwnerName]    = useState('');
  const [phone,        setPhone]        = useState('');
  const [address,      setAddress]      = useState('');

  const selectedId = ID_TYPES.find(i => i.value === idType);

  const canProceed =
    businessId.trim().length > 0 &&
    businessName.trim().length > 0 &&
    bizType.length > 0 &&
    ownerName.trim().length > 0 &&
    phone.trim().length === 10;

  const handleStart = () => {
    navigation.navigate('Document', {
      businessId  : businessId.trim(),
      businessName: businessName.trim(),
      businessType: bizType,
      idType,
      ownerName   : ownerName.trim(),
      phone       : phone.trim(),
      address     : address.trim(),
    });
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Header */}
          <View style={s.header}>
            <View style={s.logoWrap}>
              <Text style={s.logo}>GV</Text>
            </View>
            <Text style={s.title}>Ghost Verifier</Text>
            <Text style={s.subtitle}>B2B Fintech  |  Active KYB Platform</Text>
            <View style={s.badgeRow}>
              <View style={s.badge}><Text style={s.badgeText}>Hardware-Locked</Text></View>
              <View style={s.badge}><Text style={s.badgeText}>GPS + AI</Text></View>
              <View style={s.badge}><Text style={s.badgeText}>Anti-Deepfake</Text></View>
            </View>
          </View>

          {/* Onboarding Steps */}
          <View style={s.stepsRow}>
            {['Business Info', 'Documents', 'Live Video', 'AI Result'].map((step, i) => (
              <View key={step} style={s.stepItem}>
                <View style={[s.stepCircle, i === 0 && s.stepCircleActive]}>
                  <Text style={[s.stepNum, i === 0 && s.stepNumActive]}>{i + 1}</Text>
                </View>
                <Text style={[s.stepLabel, i === 0 && s.stepLabelActive]}>{step}</Text>
              </View>
            ))}
          </View>

          {/* Form Card */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Business Details</Text>

            {/* Business Name */}
            <Text style={s.label}>Business Name *</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Global Tech Solutions Pvt Ltd"
              placeholderTextColor="#475569"
              value={businessName}
              onChangeText={setBusinessName}
              autoCorrect={false}
            />

            {/* Business Type */}
            <Text style={s.label}>Business Type *</Text>
            <Dropdown
              label="Business Type"
              options={BUSINESS_TYPES}
              selected={bizType}
              onSelect={setBizType}
            />

            {/* ID Type + ID Number */}
            <Text style={s.label}>Registration ID Type *</Text>
            <Dropdown
              label="ID Type"
              options={ID_TYPES}
              selected={idType}
              onSelect={v => { setIdType(v); setBusinessId(''); }}
            />

            <Text style={s.label}>{selectedId?.label ?? 'ID Number'} *</Text>
            <TextInput
              style={s.input}
              placeholder={selectedId?.placeholder ?? 'Enter registration number'}
              placeholderTextColor="#475569"
              value={businessId}
              onChangeText={setBusinessId}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>

          {/* Owner Details Card */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Authorized Representative</Text>

            <Text style={s.label}>Full Name *</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Rahul Sharma"
              placeholderTextColor="#475569"
              value={ownerName}
              onChangeText={setOwnerName}
              autoCorrect={false}
            />

            <Text style={s.label}>Mobile Number *</Text>
            <View style={s.phoneRow}>
              <View style={s.countryCode}>
                <Text style={s.countryCodeText}>+91</Text>
              </View>
              <TextInput
                style={[s.input, s.phoneInput]}
                placeholder="98765 43210"
                placeholderTextColor="#475569"
                value={phone}
                onChangeText={t => setPhone(t.replace(/[^0-9]/g, ''))}
                keyboardType="phone-pad"
                maxLength={10}
              />
            </View>

            <Text style={s.label}>Business Address (Optional)</Text>
            <TextInput
              style={[s.input, s.textArea]}
              placeholder="Street, City, State, PIN"
              placeholderTextColor="#475569"
              value={address}
              onChangeText={setAddress}
              multiline
              numberOfLines={3}
              autoCorrect={false}
            />
          </View>

          {/* Info box */}
          <View style={s.infoBox}>
            <Text style={s.infoIcon}>i</Text>
            <Text style={s.infoText}>
              You will be asked to upload business documents and record a live walk-in video.
              GPS, Camera, and Motion sensors will activate during verification.
            </Text>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[s.btn, !canProceed && s.btnDisabled]}
            onPress={handleStart}
            disabled={!canProceed}
            activeOpacity={0.8}
          >
            <Text style={s.btnText}>Continue to Documents</Text>
          </TouchableOpacity>

          {/* History link */}
          <TouchableOpacity
            style={s.historyLink}
            onPress={() => navigation.navigate('History')}
          >
            <Text style={s.historyLinkText}>View Verification History</Text>
          </TouchableOpacity>

          <Text style={s.hint}>
            * Required fields  ·  All data is encrypted end-to-end
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe           : { flex: 1, backgroundColor: '#0A0F1E' },
  scroll         : { padding: 20, paddingBottom: 48 },

  // Header
  header         : { alignItems: 'center', marginBottom: 28, paddingTop: 12 },
  logoWrap       : { width: 72, height: 72, borderRadius: 16, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center', marginBottom: 14, borderWidth: 1.5, borderColor: '#2563EB' },
  logo           : { fontSize: 22, fontWeight: '700', color: '#60A5FA', letterSpacing: 3 },
  title          : { fontSize: 28, fontWeight: '700', color: '#F8FAFC', marginBottom: 4, letterSpacing: 0.5 },
  subtitle       : { fontSize: 13, color: '#94A3B8', marginBottom: 14, letterSpacing: 0.3 },
  badgeRow       : { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  badge          : { backgroundColor: '#1E293B', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: '#334155' },
  badgeText      : { color: '#60A5FA', fontSize: 11, fontWeight: '600' },

  // Steps
  stepsRow       : { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  stepItem       : { alignItems: 'center', flex: 1 },
  stepCircle     : { width: 30, height: 30, borderRadius: 15, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  stepCircleActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  stepNum        : { color: '#475569', fontSize: 13, fontWeight: 'bold' },
  stepNumActive  : { color: '#fff' },
  stepLabel      : { color: '#475569', fontSize: 9, textAlign: 'center', fontWeight: '600' },
  stepLabelActive: { color: '#60A5FA' },

  // Cards
  card           : { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
  cardTitle      : { color: '#F8FAFC', fontSize: 16, fontWeight: 'bold', marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#334155' },

  // Form
  label          : { color: '#94A3B8', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  input          : { backgroundColor: '#0F172A', color: '#F8FAFC', padding: 13, borderRadius: 10, fontSize: 15, borderWidth: 1, borderColor: '#334155' },
  textArea       : { height: 80, textAlignVertical: 'top' },

  // Dropdown
  dropdownBtn    : { backgroundColor: '#0F172A', borderRadius: 10, borderWidth: 1, borderColor: '#334155', padding: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dropdownSelected: { color: '#F8FAFC', fontSize: 15 },
  dropdownPlaceholder: { color: '#475569', fontSize: 15 },
  dropdownArrow  : { color: '#94A3B8', fontSize: 16 },

  // Modal sheet
  overlay        : { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet          : { backgroundColor: '#1E293B', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  sheetTitle     : { color: '#94A3B8', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  sheetItem      : { paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#334155', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetItemActive: { },
  sheetItemText  : { color: '#94A3B8', fontSize: 15 },
  sheetItemTextActive: { color: '#60A5FA', fontWeight: '600' },
  check          : { color: '#2563EB', fontSize: 16, fontWeight: 'bold' },

  // Phone
  phoneRow       : { flexDirection: 'row', gap: 8 },
  countryCode    : { backgroundColor: '#0F172A', borderRadius: 10, borderWidth: 1, borderColor: '#334155', padding: 13, justifyContent: 'center' },
  countryCodeText: { color: '#94A3B8', fontSize: 14 },
  phoneInput     : { flex: 1 },

  // Info
  infoBox        : { backgroundColor: '#1E293B', borderRadius: 12, padding: 14, marginBottom: 20, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderLeftWidth: 3, borderLeftColor: '#2563EB' },
  infoIcon       : { fontSize: 16, marginTop: 1, color: '#60A5FA', fontWeight: 'bold', width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: '#60A5FA', textAlign: 'center', lineHeight: 18 },
  infoText       : { color: '#94A3B8', fontSize: 13, lineHeight: 20, flex: 1 },

  // Button
  btn            : { backgroundColor: '#2563EB', padding: 16, borderRadius: 14, alignItems: 'center', marginBottom: 8 },
  btnDisabled    : { backgroundColor: '#1E3A5F', opacity: 0.5 },
  btnText        : { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  hint           : { color: '#475569', fontSize: 12, textAlign: 'center' },
  historyLink    : { alignItems: 'center', paddingVertical: 12 },
  historyLinkText: { color: '#60A5FA', fontSize: 14, fontWeight: '500' },
});
