// ═══════════════════════════════════════════════════════════════
//  Ghost Business Verifier — Home Screen
//  screens/HomeScreen.js
// ═══════════════════════════════════════════════════════════════
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform
} from 'react-native';
import { useState } from 'react';

export default function HomeScreen({ navigation }) {
  const [businessId,   setBusinessId]   = useState('');
  const [businessName, setBusinessName] = useState('');

  const canProceed = businessId.trim().length > 0 && businessName.trim().length > 0;

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={s.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.logo}>🔍</Text>
          <Text style={s.title}>Ghost Verifier</Text>
          <Text style={s.subtitle}>Active KYB Platform</Text>
          <View style={s.badge}>
            <Text style={s.badgeText}>Hardware-Locked Verification</Text>
          </View>
        </View>

        {/* Form */}
        <View style={s.form}>
          <Text style={s.label}>Business ID (GST / CIN)</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. GST27AAACR5055K1Z5"
            placeholderTextColor="#475569"
            value={businessId}
            onChangeText={setBusinessId}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          <Text style={s.label}>Business Name</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. Global Tech Solutions Pvt Ltd"
            placeholderTextColor="#475569"
            value={businessName}
            onChangeText={setBusinessName}
            autoCorrect={false}
          />
        </View>

        {/* Button */}
        <TouchableOpacity
          style={[s.btn, !canProceed && s.btnDisabled]}
          onPress={() => navigation.navigate('Capture', {
            businessId  : businessId.trim(),
            businessName: businessName.trim()
          })}
          disabled={!canProceed}
        >
          <Text style={s.btnText}>Start Verification  →</Text>
        </TouchableOpacity>

        <Text style={s.hint}>
          GPS + Camera + Motion sensors will activate on next screen
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe      : { flex: 1, backgroundColor: '#0F172A' },
  container : { flex: 1, justifyContent: 'center', padding: 24 },
  header    : { alignItems: 'center', marginBottom: 40 },
  logo      : { fontSize: 56, marginBottom: 8 },
  title     : { fontSize: 32, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 4 },
  subtitle  : { fontSize: 16, color: '#94A3B8', marginBottom: 12 },
  badge     : { backgroundColor: '#1E3A5F', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  badgeText : { color: '#60A5FA', fontSize: 12, fontWeight: '600' },
  form      : { marginBottom: 24 },
  label     : { color: '#94A3B8', fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  input     : { backgroundColor: '#1E293B', color: '#F8FAFC', padding: 14, borderRadius: 10, fontSize: 15, borderWidth: 1, borderColor: '#334155' },
  btn       : { backgroundColor: '#2563EB', padding: 16, borderRadius: 12, alignItems: 'center' },
  btnDisabled: { backgroundColor: '#1E3A5F', opacity: 0.5 },
  btnText   : { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  hint      : { color: '#475569', fontSize: 12, textAlign: 'center', marginTop: 16 },
});
