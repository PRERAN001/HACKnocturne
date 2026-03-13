// ═══════════════════════════════════════════════════════════════
//  Ghost Business Verifier — Business Details Confirmation Screen
//  screens/BusinessDetailsScreen.js
//
//  Collect additional business information:
//    • Business phone number
//    • Business email
//    • Operating hours
//    • Business category
//  Metadata is sent to backend for verification.
// ═══════════════════════════════════════════════════════════════
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, ScrollView,
  Modal, FlatList
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';

const BUSINESS_CATEGORIES = [
  { label: 'Retail / E-Commerce',            value: 'RETAIL' },
  { label: 'Technology / Software',          value: 'TECH' },
  { label: 'Manufacturing / Production',     value: 'MANUFACTURING' },
  { label: 'Food & Beverage',                value: 'FOOD' },
  { label: 'Healthcare / Pharma',            value: 'HEALTHCARE' },
  { label: 'Education / Training',           value: 'EDUCATION' },
  { label: 'Financial Services',             value: 'FINANCE' },
  { label: 'Real Estate / Construction',     value: 'REAL_ESTATE' },
  { label: 'Logistics / Transport',          value: 'LOGISTICS' },
  { label: 'Professional Services',          value: 'PROFESSIONAL' },
  { label: 'Hospitality / Tourism',          value: 'HOSPITALITY' },
  { label: 'Media / Entertainment',          value: 'MEDIA' },
  { label: 'Agriculture / Agribusiness',     value: 'AGRICULTURE' },
  { label: 'Other',                          value: 'OTHER' },
];

const DAY_OPTIONS = [
  { label: 'Monday – Friday',              value: 'MON_FRI' },
  { label: 'Monday – Saturday',            value: 'MON_SAT' },
  { label: 'Monday – Sunday (All days)',   value: 'ALL_DAYS' },
  { label: 'Tuesday – Sunday',             value: 'TUE_SUN' },
  { label: 'Weekends only (Sat–Sun)',       value: 'WEEKENDS' },
  { label: 'Custom schedule',              value: 'CUSTOM' },
];

const TIME_OPTIONS = [
  { label: '6:00 AM – 2:00 PM',   value: '06:00-14:00' },
  { label: '8:00 AM – 4:00 PM',   value: '08:00-16:00' },
  { label: '9:00 AM – 5:00 PM',   value: '09:00-17:00' },
  { label: '9:00 AM – 6:00 PM',   value: '09:00-18:00' },
  { label: '10:00 AM – 7:00 PM',  value: '10:00-19:00' },
  { label: '10:00 AM – 8:00 PM',  value: '10:00-20:00' },
  { label: '12:00 PM – 8:00 PM',  value: '12:00-20:00' },
  { label: '24 Hours',            value: '00:00-23:59' },
];

// ── Mini dropdown ─────────────────────────────────────────────
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

// ── Main Screen ───────────────────────────────────────────────
export default function BusinessDetailsScreen({ route, navigation }) {
  const params = route.params;

  const [bizPhone,    setBizPhone]    = useState('');
  const [bizEmail,    setBizEmail]    = useState('');
  const [category,    setCategory]    = useState('');
  const [workingDays, setWorkingDays] = useState('');
  const [workingHours,setWorkingHours]= useState('');
  const [website,     setWebsite]     = useState('');

  const canProceed =
    bizPhone.trim().length === 10 &&
    bizEmail.trim().includes('@') &&
    category.length > 0 &&
    workingDays.length > 0 &&
    workingHours.length > 0;

  const handleContinue = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('MapLocation', {
      ...params,
      bizPhone     : bizPhone.trim(),
      bizEmail     : bizEmail.trim().toLowerCase(),
      bizCategory  : category,
      workingDays,
      workingHours,
      website      : website.trim(),
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
            <Text style={s.headerTitle}>📋 Business Details</Text>
            <Text style={s.headerSub}>
              Provide additional business contact and operational information.
              This metadata will be verified against public records.
            </Text>
          </View>

          {/* Progress steps (abbreviated) */}
          <View style={s.progressCard}>
            <Text style={s.progressTitle}>Step 6 of 8 — Business Details</Text>
            <View style={s.progressBar}>
              <View style={[s.progressFill, { width: '75%' }]} />
            </View>
            <Text style={s.progressText}>Almost there — 2 more steps after this</Text>
          </View>

          {/* Contact Card */}
          <View style={s.card}>
            <Text style={s.cardTitle}>📞 Business Contact</Text>

            <Text style={s.label}>Business Phone Number *</Text>
            <View style={s.phoneRow}>
              <View style={s.countryCode}>
                <Text style={s.countryCodeText}>🇮🇳 +91</Text>
              </View>
              <TextInput
                style={[s.input, s.phoneInput]}
                placeholder="Business landline or mobile"
                placeholderTextColor="#475569"
                value={bizPhone}
                onChangeText={t => setBizPhone(t.replace(/[^0-9]/g, ''))}
                keyboardType="phone-pad"
                maxLength={10}
              />
            </View>

            <Text style={s.label}>Business Email Address *</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. info@yourbusiness.com"
              placeholderTextColor="#475569"
              value={bizEmail}
              onChangeText={setBizEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={s.label}>Website (Optional)</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. https://yourbusiness.com"
              placeholderTextColor="#475569"
              value={website}
              onChangeText={setWebsite}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>

          {/* Category Card */}
          <View style={s.card}>
            <Text style={s.cardTitle}>🏷️ Business Category</Text>
            <Text style={s.label}>Primary Business Category *</Text>
            <Dropdown
              label="Business Category"
              options={BUSINESS_CATEGORIES}
              selected={category}
              onSelect={setCategory}
            />
          </View>

          {/* Operating Hours Card */}
          <View style={s.card}>
            <Text style={s.cardTitle}>🕐 Operating Hours</Text>

            <Text style={s.label}>Working Days *</Text>
            <Dropdown
              label="Working Days"
              options={DAY_OPTIONS}
              selected={workingDays}
              onSelect={setWorkingDays}
            />

            <Text style={s.label}>Working Hours *</Text>
            <Dropdown
              label="Working Hours"
              options={TIME_OPTIONS}
              selected={workingHours}
              onSelect={setWorkingHours}
            />
          </View>

          {/* Info */}
          <View style={s.infoBox}>
            <Text style={s.infoIcon}>🔒</Text>
            <Text style={s.infoText}>
              This information will be cross-checked with GST portal data, MCA filings,
              and public business directories as part of AI-powered KYB verification.
            </Text>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[s.continueBtn, !canProceed && s.continueBtnDisabled]}
            onPress={handleContinue}
            disabled={!canProceed}
            activeOpacity={0.8}
          >
            <Text style={s.continueBtnText}>Continue to Location Confirmation  →</Text>
          </TouchableOpacity>

          {!canProceed && (
            <Text style={s.hint}>Fill all required fields (*) to continue</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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

  progressCard  : { backgroundColor: '#1E293B', borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: '#334155' },
  progressTitle : { color: '#60A5FA', fontSize: 13, fontWeight: '700', marginBottom: 10 },
  progressBar   : { height: 6, backgroundColor: '#0F172A', borderRadius: 3, marginBottom: 8, overflow: 'hidden' },
  progressFill  : { height: '100%', backgroundColor: '#2563EB', borderRadius: 3 },
  progressText  : { color: '#475569', fontSize: 12 },

  card          : { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
  cardTitle     : { color: '#F8FAFC', fontSize: 16, fontWeight: 'bold', marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#334155' },

  label         : { color: '#94A3B8', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  input         : { backgroundColor: '#0F172A', color: '#F8FAFC', padding: 13, borderRadius: 10, fontSize: 15, borderWidth: 1, borderColor: '#334155' },

  phoneRow      : { flexDirection: 'row', gap: 8 },
  countryCode   : { backgroundColor: '#0F172A', borderRadius: 10, borderWidth: 1, borderColor: '#334155', padding: 13, justifyContent: 'center' },
  countryCodeText: { color: '#94A3B8', fontSize: 14 },
  phoneInput    : { flex: 1 },

  dropdownBtn   : { backgroundColor: '#0F172A', borderRadius: 10, borderWidth: 1, borderColor: '#334155', padding: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dropdownSelected: { color: '#F8FAFC', fontSize: 15 },
  dropdownPlaceholder: { color: '#475569', fontSize: 15 },
  dropdownArrow : { color: '#94A3B8', fontSize: 16 },

  overlay       : { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet         : { backgroundColor: '#1E293B', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  sheetTitle    : { color: '#94A3B8', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  sheetItem     : { paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#334155', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetItemActive: {},
  sheetItemText : { color: '#94A3B8', fontSize: 15 },
  sheetItemTextActive: { color: '#60A5FA', fontWeight: '600' },
  check         : { color: '#2563EB', fontSize: 16, fontWeight: 'bold' },

  infoBox       : { backgroundColor: '#1E293B', borderRadius: 12, padding: 14, marginBottom: 20, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderLeftWidth: 3, borderLeftColor: '#2563EB' },
  infoIcon      : { fontSize: 16, marginTop: 1 },
  infoText      : { color: '#94A3B8', fontSize: 13, lineHeight: 20, flex: 1 },

  continueBtn   : { backgroundColor: '#2563EB', padding: 16, borderRadius: 14, alignItems: 'center', marginBottom: 8 },
  continueBtnDisabled: { backgroundColor: '#1E3A5F', opacity: 0.5 },
  continueBtnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  hint          : { color: '#475569', fontSize: 12, textAlign: 'center' },
});
