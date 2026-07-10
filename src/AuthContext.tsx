/**
 * AuthContext — ERP-FMCG Authentication Flow
 *
 * Token Storage (localStorage):
 *   - erp_access_token  → JWT, 15 min TTL
 *   - erp_refresh_token → jti, 7 day TTL (Redis-backed)
 *
 * Mount restore flow (single, atomic decision matrix):
 *   1. Read both tokens from localStorage
 *      → no tokens              : show login
 *   2. /auth/me with access token
 *      → 200, has tenant_id    : restore session, show dashboard
 *      → 200, no tenant_id     : forceLogout (corrupt account)
 *      → 401                    : try refresh
 *           refresh OK          : setTokens(new), /auth/me again, restore
 *           refresh FAIL        : forceLogout (token revoked / expired)
 *      → 5xx / network error   : keepTokensShowLogin (don't wipe storage;
 *                                apiCall interceptor retries lazily)
 *
 * IMPORTANT: apiCall does NOT clear localStorage on refresh failure.
 * Only AuthContext decides when to wipe — via auth:logout event.
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './api/client';

const AuthContext = createContext(null);

const ERP_API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const ACCESS_TOKEN_KEY = 'erp_access_token';
const REFRESH_TOKEN_KEY = 'erp_refresh_token';

export const ROLES = {
  OWNER:       'OWNER',
  SALES_ADMIN: 'SALES_ADMIN',
  ADMIN:       'ADMIN',
  DCR:         'DCR',
};

export const MFA_REQUIRED_ROLES = [ROLES.OWNER, ROLES.SALES_ADMIN, ROLES.ADMIN];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]           = useState<any>(null);
  const [jwtToken, setJwtToken]   = useState<string | null>(null);
  const [userRole, setUserRole]   = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const [mfaState, setMfaState] = useState({
    enabled:       false,
    setupRequired: false,
    verified:      false,
    mfa_required:  false,
  });

  const processingUid = useRef<string | null>(null);

  // ── Try refresh a given refresh token ─────────────────────────────────────
  const tryRefreshToken = useCallback(async (refreshToken: string): Promise<{ access_token: string; refresh_token: string } | null> => {
    try {
      const ctrl = new AbortController();
      const tok  = setTimeout(() => ctrl.abort(), 8000);
      const r    = await fetch(`${ERP_API}/auth/refresh`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refresh_token: refreshToken }),
        signal:  ctrl.signal,
      });
      clearTimeout(tok);
      console.log('[Auth] tryRefreshToken →', r.status);
      if (!r.ok) return null;
      const json = await r.json();
      if (!json.success || !json.data) {
        console.warn('[Auth] tryRefreshToken — bad shape:', json);
        return null;
      }
      console.log('[Auth] tryRefreshToken — SUCCESS');
      return json.data;
    } catch (e: any) {
      console.warn('[Auth] tryRefreshToken — error:', e.message);
      return null;
    }
  }, []);

  // ── Fetch role ─────────────────────────────────────────────────────────────
  const fetchUserRole = useCallback(async (token: string) => {
    try {
      const r = await fetch(`${ERP_API}/rbac/role`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.status === 401) return null;
      const json = await r.json();
      return json.success ? json.data : null;
    } catch (_) {
      return null;
    }
  }, []);

  // ── Fetch MFA status ──────────────────────────────────────────────────────
  const fetchMfaStatus = useCallback(async (token: string) => {
    try {
      const r = await fetch(`${ERP_API}/mfa/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.status === 401) {
        return { mfa_enabled: false, mfa_setup_required: false, verified: false, mfa_required: false };
      }
      const json = await r.json();
      if (json.success && json.data) return json.data;
      if (json.mfa_required !== undefined) return json;
      return null;
    } catch (_) {
      return { mfa_enabled: false, mfa_setup_required: false, verified: false, mfa_required: false };
    }
  }, []);

  // ── Populate userRole + mfaState after receiving JWT ──────────────────────
  const setupUserSession = useCallback(async (token: string) => {
    try {
      const [roleData, mfaData] = await Promise.all([
        fetchUserRole(token),
        fetchMfaStatus(token),
      ]);

      const role          = roleData?.role || null;
      const mfaEnabled    = Boolean(mfaData?.mfa_enabled);
      const roleSensitive = role ? ['OWNER', 'SALES_ADMIN', 'ADMIN'].includes(role.toUpperCase()) : false;
      const mfaRequired   = mfaData ? Boolean(mfaData.mfa_required) : roleSensitive;
      const setupRequired = mfaData ? Boolean(mfaData.mfa_setup_required) : roleSensitive;

      setUserRole(role);
      setMfaState({ enabled: mfaEnabled, setupRequired, verified: false, mfa_required: mfaRequired });
      return { role, mfaEnabled, mfaRequired, setupRequired };
    } catch (e) {
      console.error('[Auth] setupUserSession error:', e);
      setMfaState(prev => ({ ...prev, verified: false, mfa_required: true }));
      return null;
    }
  }, [fetchUserRole, fetchMfaStatus]);

  // ── Clear auth state — DOES NOT dispatch events, used internally only ──────
  const clearAuthState = useCallback(() => {
    clearTokens();
    setUser(null);
    setJwtToken(null);
    setUserRole(null);
    setMfaState({ enabled: false, setupRequired: false, verified: false, mfa_required: false });
    setError(null);
    processingUid.current = null;
  }, []);

  // ── Wipe everything: tokens + React state. Used by explicit logout only ──
  const wipeSession = useCallback(() => {
    console.log('[Auth] wipeSession — clearing tokens + state');
    clearAuthState();
  }, [clearAuthState]);

  // ── Restore session on mount (atomic decision matrix) ──────────────────────
  useEffect(() => {
    const storedAccess  = (() => { try { return localStorage.getItem(ACCESS_TOKEN_KEY); } catch { return null; } })();
    const storedRefresh = (() => { try { return localStorage.getItem(REFRESH_TOKEN_KEY); } catch { return null; } })();

    console.log('[Auth] mount — access:', !!storedAccess, '| refresh:', !!storedRefresh);

    // ── 1) No tokens → straight to login ────────────────────────────────
    if (!storedAccess || !storedRefresh) {
      console.log('[Auth] mount — no tokens, show login');
      setLoading(false);
      return;
    }

    const restoreSession = async (accessToken: string, userObj: any) => {
      setJwtToken(accessToken);
      setUser(userObj);
      console.log('[Auth] mount — session RESTORED:', userObj?.email);
      const session = await setupUserSession(accessToken);
      setLoading(false);
      if (!session) {
        console.warn('[Auth] mount — setupUserSession returned null (non-fatal)');
      }
    };

    const forceLogout = (reason: string) => {
      console.warn('[Auth] mount — force logout:', reason);
      clearTokens();
      setUser(null);
      setJwtToken(null);
      setUserRole(null);
      setMfaState({ enabled: false, setupRequired: false, verified: false, mfa_required: false });
      setLoading(false);
    };

    const keepTokensShowLogin = (reason: string) => {
      console.warn('[Auth] mount —', reason, '— keeping tokens, showing login');
      setLoading(false);
    };

    (async () => {
      // ── 2) Try /auth/me with existing access token ─────────────────────
      try {
        const ctrl = new AbortController();
        const tok  = setTimeout(() => ctrl.abort(), 8000);
        const r    = await fetch(`${ERP_API}/auth/me`, {
          headers: { Authorization: `Bearer ${storedAccess}` },
          signal:  ctrl.signal,
        });
        clearTimeout(tok);
        console.log('[Auth] mount — /auth/me →', r.status);

        // ── 2a) Token still valid ─────────────────────────────────────────
        if (r.ok) {
          const json = await r.json();
          if (!json.user?.tenant_id) {
            forceLogout('valid token but no tenant_id');
            return;
          }
          await restoreSession(storedAccess, json.user);
          return;
        }

        // ── 2b) Token expired → try refresh ───────────────────────────────
        if (r.status === 401) {
          console.log('[Auth] mount — access token expired, attempting refresh...');
          const refreshed = await tryRefreshToken(storedRefresh);
          if (!refreshed) {
            forceLogout('refresh token expired/revoked');
            return;
          }

          // Persist new token pair immediately
          setTokens(refreshed.access_token, refreshed.refresh_token);

          // Fetch /auth/me with new token
          const meResp = await fetch(`${ERP_API}/auth/me`, {
            headers: { Authorization: `Bearer ${refreshed.access_token}` },
          });
          if (!meResp.ok) {
            forceLogout('/auth/me failed after refresh: ' + meResp.status);
            return;
          }
          const meJson = await meResp.json();
          if (!meJson.user?.tenant_id) {
            forceLogout('valid refresh but no tenant_id');
            return;
          }
          await restoreSession(refreshed.access_token, meJson.user);
          return;
        }

        // ── 2c) Server error (5xx) or other 4xx — keep tokens, show login ──
        keepTokensShowLogin('/auth/me returned HTTP ' + r.status);

      } catch (e: any) {
        // ── 2d) Network/CORS error — keep tokens, show login ──────────────
        keepTokensShowLogin('network error: ' + (e?.message || 'unknown'));
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Logout: call backend + wipe everything ───────────────────────────────
  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    try {
      await fetch(`${ERP_API}/auth/logout`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken() || ''}` },
        body:    JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch (err) {
      console.warn('[Auth] logout API failed (non-fatal):', err);
    }
    wipeSession();
  }, [wipeSession]);

  // ── Password login ─────────────────────────────────────────────────────────
  const passwordLogin = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    const tok  = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(`${ERP_API}/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
        signal:  ctrl.signal,
      });
      clearTimeout(tok);
      const json = await r.json();

      if (!r.ok) {
        throw new Error(json.message || json.error || `HTTP ${r.status}`);
      }

      const { access_token, refresh_token, user: userData } = json.data;
      console.log('[Auth] passwordLogin — storing tokens');
      setTokens(access_token, refresh_token);
      setJwtToken(access_token);
      setUser(userData);
      const session = await setupUserSession(access_token);
      setLoading(false);
      if (!session) {
        // Don't wipe — role/MFA is fetched, just log warning
        console.warn('[Auth] passwordLogin — setupUserSession returned null');
      }
      return { success: true };
    } catch (err: any) {
      clearTimeout(tok);
      const msg = err.name === 'AbortError'
        ? 'Yêu cầu quá thời gian. Kiểm tra backend có đang chạy không.'
        : err.message;
      setError(msg);
      setLoading(false);
      return { success: false, error: msg };
    }
  }, [setupUserSession]);

  // ── Firebase login ────────────────────────────────────────────────────────
  const firebaseLogin = useCallback(async (idToken: string, firebaseUser: { uid: string }) => {
    if (processingUid.current === firebaseUser.uid) return;
    processingUid.current = firebaseUser.uid;

    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${ERP_API}/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ firebase_id_token: idToken }),
      });
      const json = await r.json();

      if (!r.ok) throw new Error(json.message || json.error || `HTTP ${r.status}`);

      const { access_token, refresh_token, user: userData } = json.data;
      setTokens(access_token, refresh_token);
      setJwtToken(access_token);
      setUser(userData);
      const session = await setupUserSession(access_token);
      setLoading(false);
      if (!session) {
        console.warn('[Auth] firebaseLogin — setupUserSession returned null');
      }
      return { success: true };
    } catch (err: any) {
      setError(err.message);
      processingUid.current = null;
      setLoading(false);
      return { success: false, error: err.message };
    }
  }, [setupUserSession]);

  // ── Silent proactive refresh every 14 minutes ──────────────────────────────
  useEffect(() => {
    if (!jwtToken) return;
    const id = setInterval(async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return;
      try {
        const r = await fetch(`${ERP_API}/auth/refresh`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ refresh_token: refreshToken }),
        });
        if (r.ok) {
          const json = await r.json();
          if (json.success && json.data) {
            const { access_token, refresh_token } = json.data;
            setTokens(access_token, refresh_token);
            setJwtToken(access_token);
            console.log('[Auth] Silent refresh OK');
          }
        } else {
          console.warn('[Auth] Silent refresh failed (' + r.status + ')');
          // DO NOT wipe tokens here — let apiCall surface 401s naturally.
          // If user is actively using the app, their next API call will
          // trigger another refresh attempt.
        }
      } catch (_) { /* network error → silent, next interval will retry */ }
    }, 14 * 60 * 1000);
    return () => clearInterval(id);
  }, [jwtToken]);

  // ── Receive logout events from explicit logout only ───────────────────────
  useEffect(() => {
    const handler = () => {
      console.warn('[Auth] Received auth:logout event — wiping session');
      wipeSession();
    };
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, [wipeSession]);

  // ── MFA helpers ────────────────────────────────────────────────────────────
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
    mfaState, isSensitiveRole,
    firebaseLogin, passwordLogin, logout,
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