// ═══════════════════════════════════════════════════════════════
//  Ghost Business Verifier — Root Layout
//  app/_layout.tsx
//
//  CHANGE: AuditOverlay now receives businessId (not activeSessionId).
//  businessId is read from SessionContext — it is set once when the
//  business logs in and stays set across multiple verification
//  sessions so AuditOverlay keeps listening the whole time.
// ═══════════════════════════════════════════════════════════════
import { Stack } from 'expo-router';
import { SessionProvider, useSession } from './SessionContext';
import AuditOverlay from './AuditScreen';

// Inner component so it can call useSession() inside the Provider
function RootLayoutInner() {
  const { businessId } = useSession(); // ✅ CHANGE: was sessionId

  return (
    <>
      {/* AuditOverlay sits above the entire navigator.
          It renders null when businessId is null or no audit is pending. */}
      <AuditOverlay businessId={businessId ?? null} />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootLayoutInner />
    </SessionProvider>
  );
}
