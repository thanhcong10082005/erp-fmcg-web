/**
 * AuthContext — ERP-FMCG Authentication Flow
 *
 * Token Storage:
 * - access_token  → localStorage key 'erp_access_token'  (JWT, 15m TTL)
 * - refresh_token → localStorage key 'erp_refresh_token' (jti, 7d TTL, Redis-backed)
 *
 * Restore Session Flow (on page load):
 *  1. Read tokens from localStorage
 *  2. /auth/me with existing access token
 *     • 200 → valid token → setup session → done
 *     • 401 → token expired → POST /auth/refresh
 *       • refresh OK → /auth/me with new token → setup session → done
 *       • refresh FAIL → clear tokens → show login
 *     • other HTTP error → keep tokens (lazy refresh via apiCall) → show login
 *  3. Network/CORS error → keep tokens → show login (apiCall will retry)
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

export function AuthProvider({ children }) {
  const [user, setUser]           = useState(null);
  const [jwtToken, setJwtToken]   = useState(null);
  const [userRole, setUserRole]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const [mfaState, setMfaState] = useState({
    enabled:       false,
    setupRequired: false,
    verified:      false,
    mfa_required:  false,
  });

  const processingUid = useRef(null);

  // ── Restore session on mount ───────────────────────────────────────────────
  useEffect(() => {
    const storedAccess  = (() => { try { return localStorage.getItem(ACCESS_TOKEN_KEY); } catch { return null; } })();
    const storedRefresh = (() => { try { return localStorage.getItem(REFRESH_TOKEN_KEY); } catch { return null; } })();

    console.log('[Auth] mount — access:', !!storedAccess, '| refresh:', !!storedRefresh);

    if (!storedAccess || !storedRefresh) {
      console.log('[Auth] mount — no tokens, show login');
      setLoading(false);
      return;
    }

    (async () => {
      // ── Step A: try /auth/me with existing access token ─────────────────
      try {
        const ctrl = new AbortController();
        const tok  = setTimeout(() => ctrl.abort(), 8000);
        const r    = await fetch(`${ERP_API}/auth/me`, {
          headers: { Authorization: `Bearer ${storedAccess}` },
          signal:  ctrl.signal,
        });
        clearTimeout(tok);
        console.log('[Auth] mount — /auth/me →', r.status);

        if (r.ok) {
          // Token still valid
          const json = await r.json();
          if (!json.user?.tenant_id) {
            clearTokens();
            setLoading(false);
            return;
          }
          // Restore user + fetch role/MFA
          setJwtToken(storedAccess);
          setUser(json.user);
          const session = await setupUserSession(storedAccess);
          setLoading(false);
          return;
        }

        if (r.status === 401) {
          // Token expired — try refresh
          console.log('[Auth] mount — token expired, attempting refresh...');
          const refreshed = await tryRefreshToken(storedRefresh);
          if (!refreshed) {
            console.warn('[Auth] mount — refresh failed, clearing tokens');
            clearTokens();
            setLoading(false);
            return;
          }

          // Refresh OK — fetch /auth/me with new token
          console.log('[Auth] mount — refresh OK, fetching user...');
          const meResp = await fetch(`${ERP_API}/auth/me`, {
            headers: { Authorization: `Bearer ${refreshed.access_token}` },
          });
          if (!meResp.ok) {
            clearTokens();
            setLoading(false);
            return;
          }
          const meJson = await meResp.json();
          if (!meJson.user?.tenant_id) {
            clearTokens();
            setLoading(false);
            return;
          }

          // Persist new token pair
          setTokens(refreshed.access_token, refreshed.refresh_token);
          setJwtToken(refreshed.access_token);
          setUser(meJson.user);
          await setupUserSession(refreshed.access_token);
          setLoading(false);
          return;
        }

        // Non-401 error (500, 503, etc.) — keep tokens, show login.
        // apiCall interceptor will retry lazily on next request.
        console.warn('[Auth] mount — /auth/me non-401 HTTP', r.status, '— keeping tokens');
        setLoading(false);
        return;

      } catch (e) {
        // Network/CORS error — keep tokens, show login.
        // apiCall interceptor will retry on first API call.
        console.warn('[Auth] mount — network error (tokens kept):', e.message);
        setLoading(false);
        return;
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Try refresh a given refresh token ─────────────────────────────────────
  const tryRefreshToken = useCallback(async (refreshToken: string) => {
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
      return json.data as { access_token: string; refresh_token: string };
    } catch (e) {
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

  // ── Clear auth state ───────────────────────────────────────────────────────
  const clearAuthState = useCallback(() => {
    clearTokens();
    setUser(null);
    setJwtToken(null);
    setUserRole(null);
    setMfaState({ enabled: false, setupRequired: false, verified: false, mfa_required: false });
    setError(null);
    processingUid.current = null;
  }, []);

  // ── Logout ─────────────────────────────────────────────────────────────────
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
    clearAuthState();
  }, [clearAuthState]);

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
        setError('Không thể khởi tạo phiên làm việc.');
        clearAuthState();
        return { success: false, error: 'Không thể khởi tạo phiên làm việc.' };
      }
      return { success: true };
    } catch (err) {
      clearTimeout(tok);
      const msg = err.name === 'AbortError'
        ? 'Yêu cầu quá thời gian. Kiểm tra backend có đang chạy không.'
        : err.message;
      setError(msg);
      setLoading(false);
      return { success: false, error: msg };
    }
  }, [setupUserSession, clearAuthState]);

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
        setError('Không thể khởi tạo phiên làm việc.');
        clearAuthState();
        return { success: false, error: 'Không thể khởi tạo phiên làm việc.' };
      }
      return { success: true };
    } catch (err) {
      setError(err.message);
      processingUid.current = null;
      setLoading(false);
      return { success: false, error: err.message };
    }
  }, [setupUserSession, clearAuthState]);

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
          console.warn('[Auth] Silent refresh failed (' + r.status + '), clearing session');
          clearAuthState();
        }
      } catch (_) { /* network error → silent, next interval will retry */ }
    }, 14 * 60 * 1000);
    return () => clearInterval(id);
  }, [jwtToken, clearAuthState]);

  // ── Receive logout events from apiClient interceptor ───────────────────────
  useEffect(() => {
    const handler = () => {
      console.warn('[Auth] Received auth:logout event — clearing session');
      clearAuthState();
    };
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, [clearAuthState]);

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
