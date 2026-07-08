/**
 * AuthContext — ERP-FMCG Authentication Flow
 *
 * Flow:
 *  ┌─────────────────────────────────────────────────────┐
 *  │ Dev Mode:                                           │
 *  │   Click "Dev Mode" → POST /api/auth/dev-login      │
 *  │   → JWT access_token + user info                   │
 *  │   → Dashboard (no MFA)                             │
 *  ├─────────────────────────────────────────────────────┤
 *  │ Firebase Login:                                     │
 *  │   1. signInWithEmailAndPassword (Firebase Client)  │
 *  │   2. → Firebase ID Token                          │
 *  │   3. POST /api/auth/login with id_token            │
 *  │   4. → JWT access_token + user info               │
 *  │   5. GET /api/rbac/role → role                   │
 *  │   6. GET /api/mfa/status → MFA required?          │
 *  │   7. If sensitive role + no MFA → setup page      │
 *  │   8. If sensitive role + MFA enabled → verify OTP │
 *  │   9. Otherwise → Dashboard                        │
 *  └─────────────────────────────────────────────────────┘
 *
 * All API calls go to ERP backend at localhost:3001.
 * JWT from /api/auth/login is used for ALL subsequent API calls.
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

const AuthContext = createContext(null);
 
const ERP_API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const ROLES = {
  OWNER:       'OWNER',
  SALES_ADMIN: 'SALES_ADMIN',
  ADMIN:       'ADMIN',
  DCR:         'DCR',
};

export const MFA_REQUIRED_ROLES = [ROLES.OWNER, ROLES.SALES_ADMIN, ROLES.ADMIN];

export function AuthProvider({ children }) {
  const [user, setUser]                 = useState(null);   // user object from /auth/me
  const [jwtToken, setJwtToken]         = useState(null);   // JWT from ERP backend
  const [userRole, setUserRole]         = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);

  const [mfaState, setMfaState] = useState({
    enabled:       false,
    setupRequired: false,
    verified:      false,
    mfa_required:  false,
  });

  const [devMode, setDevMode] = useState(false);
  const processingUid = useRef(null);

  // ── Mount: nếu chưa có phiên thì tắt loading để hiển thị LoginPage ─────────
  useEffect(() => {
    const stored = (() => {
      try { return localStorage.getItem('erp_jwt'); } catch { return null; }
    })();
    if (!stored) {
      setLoading(false);
      return;
    }
    // Có token cũ → thử restore session, nếu fail thì clear
    (async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(`${ERP_API}/auth/me`, {
          headers: { Authorization: `Bearer ${stored}` },
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (r.ok) {
          const json = await r.json();
          // Backend returns { user, permissions } — no wrapper
          if (json.user && json.user.tenant_id) {
            setJwtToken(stored);
            setUser(json.user); // { sub, username, tenant_id, role_code, role_id, ... }
            setDevMode(true);
            await setupUserSession(stored, true);
          } else {
            localStorage.removeItem('erp_jwt');
          }
        } else {
          localStorage.removeItem('erp_jwt');
        }
      } catch (e) {
        console.warn('[Auth] restore session failed:', e.message);
        try { localStorage.removeItem('erp_jwt'); } catch {}
      } finally {
        setLoading(false);
      }
    })();
  }, []); // mount-only: setupUserSession stable qua useCallback, tránh TDZ

  // ── Clear auth state on logout ────────────────────────────────────────────
  const clearAuthState = useCallback(() => {
    try { localStorage.removeItem('erp_jwt'); } catch {}
    setUser(null);
    setJwtToken(null);
    setUserRole(null);
    setMfaState({ enabled: false, setupRequired: false, verified: false, mfa_required: false });
    setError(null);
    setDevMode(false);
    processingUid.current = null;
  }, []);

  // ── Fetch role from JWT-protected endpoint ─────────────────────────────────
  const fetchUserRole = useCallback(async (token) => {
    try {
      const r = await fetch(`${ERP_API}/rbac/role`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await r.json();
      if (json.success) return json.data;
      console.warn('[Auth] /rbac/role failed:', json);
      return null;
    } catch (e) {
      console.error('[Auth] fetchUserRole error:', e);
      return null;
    }
  }, []);

  // ── Fetch MFA status ──────────────────────────────────────────────────────
  const fetchMfaStatus = useCallback(async (token) => {
    try {
      const r = await fetch(`${ERP_API}/mfa/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await r.json();
      // Backend wraps response in { success, data }
      if (json.success && json.data) return json.data;
      // Fallback: if backend returns raw object (no wrapper), use it directly
      if (json.mfa_required !== undefined || json.mfa_setup_required !== undefined) return json;
      console.warn('[Auth] /mfa/status unexpected response:', json);
      return null;
    } catch (e) {
      console.error('[Auth] fetchMfaStatus error:', e);
      return null;
    }
  }, []);

  // ── Setup user session after receiving JWT ─────────────────────────────────
  const setupUserSession = useCallback(async (token, isDev = false) => {
    try {
      const [roleData, mfaData] = await Promise.all([
        fetchUserRole(token),
        fetchMfaStatus(token),
      ]);

      const role        = roleData?.role || null;
      const mfaEnabled  = Boolean(mfaData?.mfa_enabled);
      // If mfaData is null (backend/RTDB unreachable), fall back to role-based decision.
      // This prevents silent MFA bypass when the backend is partially down.
      const roleSensitive = role ? ['OWNER', 'SALES_ADMIN', 'ADMIN'].includes(role.toUpperCase()) : false;
      const mfaRequired = mfaData ? Boolean(mfaData.mfa_required) : roleSensitive;
      const setupReq    = mfaData ? Boolean(mfaData.mfa_setup_required) : roleSensitive;

      setUserRole(role);
        setMfaState({
          enabled:       mfaEnabled,
          setupRequired: setupReq,
          verified:      false, // always false on login — user must re-verify OTP on each login
          mfa_required:  mfaRequired,
        });

      return { role, mfaRequired, mfaEnabled, setupRequired: setupReq };
    } catch (e) {
      console.error('[Auth] setupUserSession error:', e);
      // On any error, we cannot determine MFA status — treat as MFA required
      setMfaState(prev => ({ ...prev, verified: false, mfa_required: true }));
      return null;
    }
  }, [fetchUserRole, fetchMfaStatus]);

  // ── POST /api/auth/dev-login ───────────────────────────────────────────────
  const devLogin = useCallback(async (userId) => {
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const body = userId
        ? JSON.stringify({ user_id: userId })
        : JSON.stringify({ tenant_id: 'PHN' });
      const r = await fetch(`${ERP_API}/auth/dev-login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal:  ctrl.signal,
      });
      clearTimeout(t);
      const json = await r.json();

      if (!r.ok) {
        throw new Error(json.message || json.error || `HTTP ${r.status}`);
      }

      const { access_token, user: userData } = json;
      try { localStorage.setItem('erp_jwt', access_token); } catch {}
      setJwtToken(access_token);
      setUser(userData);
      setDevMode(true);
      await setupUserSession(access_token, true);
      setLoading(false);
      return { success: true };
    } catch (err) {
      clearTimeout(t);
      const msg = err.name === 'AbortError' ? 'Yêu cầu quá thời gian (timeout). Kiểm tra backend có đang chạy ở port 3001 không.' : err.message;
      setError(msg);
      setLoading(false);
      return { success: false, error: msg };
    }
  }, []); // mount-only: setupUserSession stable via useCallback, avoids TDZ

  // ── Firebase login: verify → get JWT from ERP backend ─────────────────────
  const firebaseLogin = useCallback(async (idToken, firebaseUser) => {
    if (processingUid.current === firebaseUser.uid) return;
    processingUid.current = firebaseUser.uid;

    setLoading(true);
    setError(null);
    try {
      // Exchange Firebase ID token for ERP JWT
      const r = await fetch(`${ERP_API}/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ firebase_id_token: idToken }),
      });
      const json = await r.json();

      if (!r.ok) {
        throw new Error(json.message || json.error || `HTTP ${r.status}`);
      }

      const { access_token, user: userData } = json;
      setJwtToken(access_token);
      setUser(userData);
      await setupUserSession(access_token, false);
      setLoading(false);
      return { success: true };
    } catch (err) {
      setError(err.message);
      processingUid.current = null;
      setLoading(false);
      return { success: false, error: err.message };
    }
  }, []); // mount-only: setupUserSession stable qua useCallback, tránh TDZ

  // ── Auto-refresh JWT every 14 minutes ──────────────────────────────────────
  useEffect(() => {
    if (!jwtToken || devMode) return;
    const interval = setInterval(async () => {
      try {
        const r = await fetch(`${ERP_API}/auth/me`, {
          headers: { Authorization: `Bearer ${jwtToken}` },
        });
        if (r.status === 401) {
          clearAuthState();
        }
      } catch (_) { /* ignore */ }
    }, 14 * 60 * 1000);
    return () => clearInterval(interval);
  }, [jwtToken, devMode, clearAuthState]);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    clearAuthState();
  }, [clearAuthState]);

  const markMfaVerified = useCallback(() => {
    setMfaState(prev => ({ ...prev, verified: true }));
  }, []);

  const refreshMfaStatus = useCallback(async () => {
    if (!jwtToken) return;
    const mfaData = await fetchMfaStatus(jwtToken);
    if (mfaData) {
      setMfaState({
        enabled:       Boolean(mfaData.mfa_enabled),
        setupRequired: Boolean(mfaData.mfa_setup_required),
        verified:      Boolean(mfaData.verified),
        mfa_required:  Boolean(mfaData.mfa_required),
      });
    }
  }, [jwtToken, fetchMfaStatus]);

  const isSensitiveRole = userRole && MFA_REQUIRED_ROLES.includes(userRole.toUpperCase());

  const value = {
    user, jwtToken, userRole, loading, error,
    mfaState, devMode, isSensitiveRole,
    devLogin, firebaseLogin, logout,
    markMfaVerified, refreshMfaStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

export default AuthContext;
