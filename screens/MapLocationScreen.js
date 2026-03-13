// ═══════════════════════════════════════════════════════════════
//  Ghost Business Verifier — Map Location Confirmation Screen
//  screens/MapLocationScreen.js
//
//  Detects GPS location via expo-location.
//  Displays coordinates and address on a styled map card.
//  User must confirm the business location before proceeding.
// ═══════════════════════════════════════════════════════════════
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, ActivityIndicator, Linking, Platform
} from 'react-native';
import * as Location from 'expo-location';
import * as Haptics  from 'expo-haptics';
import { useState, useEffect } from 'react';

// ── Simple visual map grid ────────────────────────────────────
function MapVisual({ lat, lng }) {
  const gridRows = 7;
  const gridCols = 9;

  return (
    <View style={mv.container}>
      {/* Grid overlay */}
      {Array.from({ length: gridRows }).map((_, row) => (
        <View key={row} style={mv.row}>
          {Array.from({ length: gridCols }).map((_, col) => (
            <View key={col} style={mv.cell} />
          ))}
        </View>
      ))}
      {/* Pin */}
      <View style={mv.pinContainer}>
        <View style={mv.pinOuter}>
          <View style={mv.pinInner} />
        </View>
        <View style={mv.pinStem} />
        <View style={mv.pinShadow} />
      </View>
      {/* Coordinate label */}
      <View style={mv.coordLabel}>
        <Text style={mv.coordText}>
          {lat.toFixed(5)}° N, {lng.toFixed(5)}° E
        </Text>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function MapLocationScreen({ route, navigation }) {
  const params = route.params;

  const [loading,    setLoading]    = useState(true);
  const [location,   setLocation]   = useState(null);
  const [address,    setAddress]    = useState(null);
  const [error,      setError]      = useState(null);
  const [confirmed,  setConfirmed]  = useState(false);

  useEffect(() => {
    fetchLocation();
  }, []);

  const fetchLocation = async () => {
    setLoading(true);
    setError(null);
    setConfirmed(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission was denied. GPS verification is required.');
        setLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation(loc.coords);

      // Reverse geocode
      try {
        const geocoded = await Location.reverseGeocodeAsync({
          latitude : loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (geocoded.length > 0) {
          setAddress(geocoded[0]);
        }
      } catch (_) {
        // Reverse geocode is optional
      }
    } catch (e) {
      setError('Failed to get location: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (addr) => {
    if (!addr) return null;
    const parts = [
      addr.name,
      addr.street,
      addr.district,
      addr.city,
      addr.region,
      addr.postalCode,
      addr.country,
    ].filter(Boolean);
    return parts.join(', ');
  };

  const openInMaps = () => {
    if (!location) return;
    const { latitude, longitude } = location;
    const url = Platform.OS === 'ios'
      ? `maps://?ll=${latitude},${longitude}&q=Business+Location`
      : `geo:${latitude},${longitude}?q=${latitude},${longitude}(Business Location)`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://maps.google.com/?q=${latitude},${longitude}`);
    });
  };

  const handleConfirm = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setConfirmed(true);
  };

  const handleContinue = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('VerificationSummary', {
      ...params,
      gpsLocation: {
        latitude : location?.latitude,
        longitude: location?.longitude,
        accuracy : location?.accuracy,
        address  : formatAddress(address),
      },
    });
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>📍 Location Confirmation</Text>
          <Text style={s.headerSub}>
            Verify the GPS coordinates detected at your current location match
            the registered business address.
          </Text>
        </View>

        {/* Progress */}
        <View style={s.progressCard}>
          <Text style={s.progressTitle}>Step 7 of 8 — Location Verification</Text>
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: '87.5%' }]} />
          </View>
          <Text style={s.progressText}>One more step after this</Text>
        </View>

        {/* Location content */}
        {loading ? (
          <View style={s.loadingCard}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={s.loadingText}>Acquiring GPS signal...</Text>
            <Text style={s.loadingSubText}>High-accuracy mode active</Text>
          </View>
        ) : error ? (
          <View style={s.errorCard}>
            <Text style={s.errorIcon}>⚠️</Text>
            <Text style={s.errorTitle}>Location Error</Text>
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={fetchLocation} activeOpacity={0.8}>
              <Text style={s.retryBtnText}>↩ Retry</Text>
            </TouchableOpacity>
          </View>
        ) : location ? (
          <>
            {/* Map visual */}
            <MapVisual lat={location.latitude} lng={location.longitude} />

            {/* Coordinates card */}
            <View style={s.coordCard}>
              <View style={s.coordRow}>
                <View style={s.coordItem}>
                  <Text style={s.coordLabel}>LATITUDE</Text>
                  <Text style={s.coordValue}>{location.latitude.toFixed(6)}°</Text>
                </View>
                <View style={s.coordDivider} />
                <View style={s.coordItem}>
                  <Text style={s.coordLabel}>LONGITUDE</Text>
                  <Text style={s.coordValue}>{location.longitude.toFixed(6)}°</Text>
                </View>
              </View>
              {location.accuracy != null && (
                <View style={s.accuracyRow}>
                  <Text style={s.accuracyDot}>●</Text>
                  <Text style={s.accuracyText}>
                    GPS Accuracy: ±{Math.round(location.accuracy)} metres
                  </Text>
                </View>
              )}
            </View>

            {/* Address card */}
            {address && (
              <View style={s.addressCard}>
                <Text style={s.addressIcon}>🏠</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.addressLabel}>DETECTED ADDRESS</Text>
                  <Text style={s.addressText}>{formatAddress(address)}</Text>
                </View>
              </View>
            )}

            {/* Open in Maps */}
            <TouchableOpacity style={s.mapsBtn} onPress={openInMaps} activeOpacity={0.8}>
              <Text style={s.mapsBtnText}>🗺️  Open in Maps App</Text>
            </TouchableOpacity>

            {/* Warning */}
            <View style={s.warningBox}>
              <Text style={s.warningIcon}>⚠️</Text>
              <Text style={s.warningText}>
                Confirm only if this GPS location matches your actual business premises.
                False location confirmation may result in verification failure.
              </Text>
            </View>

            {/* Confirm / Continue */}
            {!confirmed ? (
              <TouchableOpacity style={s.confirmBtn} onPress={handleConfirm} activeOpacity={0.8}>
                <Text style={s.confirmBtnText}>✓  Confirm This is My Business Location</Text>
              </TouchableOpacity>
            ) : (
              <>
                <View style={s.confirmedBadge}>
                  <Text style={s.confirmedText}>✅ Location Confirmed</Text>
                </View>
                <TouchableOpacity style={s.continueBtn} onPress={handleContinue} activeOpacity={0.8}>
                  <Text style={s.continueBtnText}>Continue to Summary  →</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={s.refreshBtn} onPress={fetchLocation} activeOpacity={0.8}>
              <Text style={s.refreshBtnText}>🔄  Refresh Location</Text>
            </TouchableOpacity>
          </>
        ) : null}
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

  progressCard  : { backgroundColor: '#1E293B', borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: '#334155' },
  progressTitle : { color: '#60A5FA', fontSize: 13, fontWeight: '700', marginBottom: 10 },
  progressBar   : { height: 6, backgroundColor: '#0F172A', borderRadius: 3, marginBottom: 8, overflow: 'hidden' },
  progressFill  : { height: '100%', backgroundColor: '#2563EB', borderRadius: 3 },
  progressText  : { color: '#475569', fontSize: 12 },

  loadingCard   : { backgroundColor: '#1E293B', borderRadius: 16, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: '#334155', marginBottom: 20 },
  loadingText   : { color: '#F8FAFC', fontSize: 16, fontWeight: '600', marginTop: 16 },
  loadingSubText: { color: '#475569', fontSize: 13, marginTop: 6 },

  errorCard     : { backgroundColor: '#1A0D0D', borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#DC2626', marginBottom: 20 },
  errorIcon     : { fontSize: 40, marginBottom: 12 },
  errorTitle    : { color: '#FCA5A5', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  errorText     : { color: '#94A3B8', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  retryBtn      : { backgroundColor: '#2563EB', padding: 14, borderRadius: 10, paddingHorizontal: 24 },
  retryBtnText  : { color: '#fff', fontSize: 15, fontWeight: 'bold' },

  coordCard     : { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#334155' },
  coordRow      : { flexDirection: 'row', alignItems: 'center' },
  coordItem     : { flex: 1, alignItems: 'center' },
  coordDivider  : { width: 1, height: 50, backgroundColor: '#334155' },
  coordLabel    : { color: '#475569', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  coordValue    : { color: '#60A5FA', fontSize: 18, fontWeight: 'bold', fontVariant: ['tabular-nums'] },
  accuracyRow   : { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#334155' },
  accuracyDot   : { color: '#4ADE80', fontSize: 10 },
  accuracyText  : { color: '#94A3B8', fontSize: 13 },

  addressCard   : { backgroundColor: '#1E293B', borderRadius: 12, padding: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderColor: '#334155' },
  addressIcon   : { fontSize: 24, marginTop: 2 },
  addressLabel  : { color: '#475569', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  addressText   : { color: '#94A3B8', fontSize: 13, lineHeight: 20 },

  mapsBtn       : { backgroundColor: '#1E293B', padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 14, borderWidth: 1, borderColor: '#334155' },
  mapsBtnText   : { color: '#60A5FA', fontSize: 14, fontWeight: '600' },

  warningBox    : { backgroundColor: '#1A1200', borderRadius: 12, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderLeftWidth: 3, borderLeftColor: '#F59E0B' },
  warningIcon   : { fontSize: 16, marginTop: 1 },
  warningText   : { color: '#FCD34D', fontSize: 13, lineHeight: 20, flex: 1 },

  confirmBtn    : { backgroundColor: '#16A34A', padding: 16, borderRadius: 14, alignItems: 'center', marginBottom: 12 },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  confirmedBadge: { backgroundColor: '#052E16', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#16A34A' },
  confirmedText : { color: '#4ADE80', fontSize: 15, fontWeight: 'bold' },

  continueBtn   : { backgroundColor: '#2563EB', padding: 16, borderRadius: 14, alignItems: 'center', marginBottom: 12 },
  continueBtnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },

  refreshBtn    : { alignItems: 'center', padding: 12 },
  refreshBtnText: { color: '#475569', fontSize: 14 },
});

// ── Map visual styles ─────────────────────────────────────────
const mv = StyleSheet.create({
  container    : { height: 200, backgroundColor: '#0F1B2D', borderRadius: 16, marginBottom: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#1E3A5F', justifyContent: 'center', alignItems: 'center' },
  row          : { flexDirection: 'row', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  cell         : { flex: 1, borderWidth: 0.5, borderColor: 'rgba(37, 99, 235, 0.15)' },

  pinContainer : { position: 'absolute', alignItems: 'center' },
  pinOuter     : { width: 36, height: 36, borderRadius: 18, backgroundColor: '#DC2626', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 4 },
  pinInner     : { width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff' },
  pinStem      : { width: 3, height: 12, backgroundColor: '#DC2626', borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  pinShadow    : { width: 14, height: 5, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 7, marginTop: 2 },

  coordLabel   : { position: 'absolute', bottom: 10, left: 0, right: 0, alignItems: 'center' },
  coordText    : { color: '#60A5FA', fontSize: 11, fontWeight: '600', backgroundColor: 'rgba(10,15,30,0.8)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
});
