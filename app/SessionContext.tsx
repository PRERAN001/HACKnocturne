// ═══════════════════════════════════════════════════════════════
//  Ghost Business Verifier — Session Context
//  app/SessionContext.tsx
//
//  CHANGE: businessId added alongside sessionId so _layout.tsx
//  can pass it down to AuditOverlay. businessId is set once on
//  login and intentionally NOT cleared on restart — the business
//  identity stays constant across multiple verification sessions.
// ═══════════════════════════════════════════════════════════════
import React, { createContext, useContext, useState } from 'react';

type SessionContextType = {
  sessionId   : string | null;
  setSessionId: (id: string | null) => void;
  businessId  : string | null;          // ✅ ADDED
  setBusinessId: (id: string | null) => void; // ✅ ADDED
};

const SessionContext = createContext<SessionContextType>({
  sessionId    : null,
  setSessionId : () => {},
  businessId   : null,
  setBusinessId: () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessionId,  setSessionId]  = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);

  return (
    <SessionContext.Provider value={{ sessionId, setSessionId, businessId, setBusinessId }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
