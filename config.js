// ═══════════════════════════════════════════════════════════════
//  Ghost Business Verifier — Central Config
//  config.js
//  UPDATE the API_URL to your Render backend URL
// ═══════════════════════════════════════════════════════════════

export const API_URL    = 'https://ghost-verifier01.onrender.com';
export const SOCKET_URL = 'https://ghost-verifier01.onrender.com';

// Session ID generator
export const generateSessionId = () =>
  `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
