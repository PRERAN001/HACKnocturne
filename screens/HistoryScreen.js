// ═══════════════════════════════════════════════════════════════
//  Ghost Business Verifier — Verification History Screen
//  screens/HistoryScreen.js
//
//  Local history of all verifications stored in AsyncStorage
// ═══════════════════════════════════════════════════════════════
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Alert, ActivityIndicator
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY        = '@ghost_verifier_history';
const MAX_HISTORY_ENTRIES = 50;

// Status colour helper
const statusColor = (st) =>
  st === 'PASSED' ? '#16A34A' :
  st === 'REVIEW' ? '#D97706' :
  st === 'FAILED' ? '#DC2626' : '#94A3B8';

const statusIndicator = (st) =>
  st === 'PASSED' ? 'P' :
  st === 'REVIEW' ? 'R' :
  st === 'FAILED' ? 'F' : '-';

// ── Exposed helper — call from ResultScreen to save on completion ──
export const saveVerificationToHistory = async (entry) => {
  try {
    const raw      = await AsyncStorage.getItem(HISTORY_KEY);
    const existing = raw ? JSON.parse(raw) : [];
    const updated  = [entry, ...existing].slice(0, MAX_HISTORY_ENTRIES);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('History save failed:', e.message);
  }
};

// ── History item card ─────────────────────────────────────────
function HistoryCard({ item }) {
  const ts  = new Date(item.timestamp).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const col = statusColor(item.status);

  return (
    <View style={s.card}>
      <View style={s.cardLeft}>
        <View style={[s.statusDot, { backgroundColor: col }]}>
          <Text style={s.statusDotText}>{statusIndicator(item.status)}</Text>
        </View>
      </View>
      <View style={s.cardBody}>
        <Text style={s.cardName} numberOfLines={1}>{item.businessName}</Text>
        <Text style={s.cardId} numberOfLines={1}>{item.businessId}</Text>
        <Text style={s.cardTs}>{ts}</Text>
      </View>
      <View style={s.cardRight}>
        <Text style={[s.cardScore, { color: col }]}>{item.score ?? '–'}</Text>
        <Text style={[s.cardStatus, { color: col }]}>{item.status ?? 'PENDING'}</Text>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function HistoryScreen({ navigation }) {
  const [history,  setHistory]  = useState([]);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await AsyncStorage.getItem(HISTORY_KEY);
      setHistory(raw ? JSON.parse(raw) : []);
    } catch (e) {
      console.warn('History load failed:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const clearHistory = () => {
    Alert.alert(
      'Clear History',
      'Delete all saved verification records?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem(HISTORY_KEY);
            setHistory([]);
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <ActivityIndicator color="#2563EB" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Verification History</Text>
        {history.length > 0 && (
          <TouchableOpacity style={s.clearBtn} onPress={clearHistory}>
            <Text style={s.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {history.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyTitle}>No History Yet</Text>
          <Text style={s.emptyText}>
            Completed verifications will appear here.
          </Text>
          <TouchableOpacity
            style={s.startBtn}
            onPress={() => navigation.navigate('Home')}
          >
            <Text style={s.startBtnText}>Start a Verification</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => <HistoryCard item={item} />}
          contentContainerStyle={s.list}
          ListHeaderComponent={
            <Text style={s.count}>{history.length} verification{history.length !== 1 ? 's' : ''}</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe       : { flex: 1, backgroundColor: '#0A0F1E' },
  center     : { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },

  header     : { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  backBtn    : { padding: 4, marginRight: 8 },
  backText   : { color: '#60A5FA', fontSize: 18 },
  headerTitle: { flex: 1, color: '#F8FAFC', fontSize: 18, fontWeight: 'bold' },
  clearBtn   : { padding: 4 },
  clearText  : { color: '#EF4444', fontSize: 14, fontWeight: '600' },

  list       : { padding: 16, gap: 10 },
  count      : { color: '#475569', fontSize: 13, marginBottom: 8 },

  card       : { backgroundColor: '#1E293B', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#334155' },
  cardLeft   : { width: 40, alignItems: 'center' },
  statusDot  : { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  statusDotText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cardBody   : { flex: 1 },
  cardName   : { color: '#F8FAFC', fontSize: 15, fontWeight: '600', marginBottom: 2 },
  cardId     : { color: '#475569', fontSize: 12, marginBottom: 4 },
  cardTs     : { color: '#334155', fontSize: 11 },
  cardRight  : { alignItems: 'flex-end' },
  cardScore  : { fontSize: 26, fontWeight: 'bold' },
  cardStatus : { fontSize: 11, fontWeight: '700', marginTop: 2 },

  emptyTitle : { color: '#F8FAFC', fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  emptyText  : { color: '#475569', fontSize: 14, textAlign: 'center', marginBottom: 32 },

  startBtn   : { backgroundColor: '#2563EB', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
