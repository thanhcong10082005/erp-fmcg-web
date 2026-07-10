/**
 * AuthContext — ERP-FMCG Authentication Flow
 *
 * Refresh Token Flow:
 * - Login → receives { access_token, refresh_token }
 * - Both stored in localStorage
 * - Silent refresh: every 14 minutes, try to refresh proactively
 * - On 401: apiClient interceptor calls POST /auth/refresh → updates tokens
 * - Logout: clears tokens + calls POST /auth/logout
 *
 * Flow:
 *  ┌─────────────────────────────────────────────────────┐
 *  │ Password Login:                                     │
 *  │   POST /api/auth/login { email, password }          │
 *  │   → { access_token, refresh_token, user }          │
 *  │   → GET /api/mfa/status → MFA?                     │
 *  │   → MfaSetup / MfaVerify / Dashboard              │
 *  └─────────────────────────────────────────────────────┘
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

  const processingUid = useRef(null);

  // ── Mount: restore session from localStorage ─────────────────────────────
  useEffect(() => {
    const stored = (() => {
      try { return localStorage.getItem(ACCESS_TOKEN_KEY); } catch { return null; }
    })();
    if (!stored) {
      setLoading(false);
      return;
    }
    // Có token cũ → thử restore session
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
          if (json.user && json.user.tenant_id) {
            setJwtToken(stored);
            setUser(json.user);
            // Fetch role + MFA state với token đã restore
            await setupUserSession(stored, false);
          } else {
            // Token hợp lệ nhưng user không có tenant → không đủ quyền
            setLoading(false);
            return;
          }
        } else if (r.status === 401) {
          // Token có thể hết hạn → thử refresh trước
          try {
            const ctrl2 = new AbortController();
            const t2 = setTimeout(() => ctrl2.abort(), 8000);
            const refreshResp = await fetch(`${ERP_API}/auth/refresh`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh_token: getRefreshToken() }),
              signal: ctrl2.signal,
            });
            clearTimeout(t2);
            if (refreshResp.ok) {
              const refreshJson = await refreshResp.json();
              if (refreshJson.success && refreshJson.data) {
                const { access_token, refresh_token: newRefresh } = refreshJson.data;
                setTokens(access_token, newRefresh);
                setJwtToken(access_token);
                // Fetch user info với token mới
                const meResp = await fetch(`${ERP_API}/auth/me`, {
                  headers: { Authorization: `Bearer ${access_token}` },
                });
                if (meResp.ok) {
                  const meJson = await meResp.json();
                  if (meJson.user && meJson.user.tenant_id) {
                    setUser(meJson.user);
                    await setupUserSession(access_token, false);
                    setLoading(false);
                    return;
                  }
                }
              }
            }
          } catch (_) {
            // Refresh thất bại → xóa
          }
          clearTokens();
        }
        // Các lỗi khác (500, CORS, timeout...) → GIỮ nguyên token,
        // để apiCall interceptor xử lý refresh hoặc force re-login
      } catch (_) {
        // Lỗi mạng/CORS/timeout → KHÔNG xóa token
      } finally {
        setLoading(false);
      }
    })();
  }, []); // mount-only

  // ── Clear auth state on logout ────────────────────────────────────────────
  const clearAuthState = useCallback(() => {
    clearTokens();
    setUser(null);
    setJwtToken(null);
    setUserRole(null);
    setMfaState({ enabled: false, setupRequired: false, verified: false, mfa_required: false });
    setError(null);
    processingUid.current = null;
  }, []);

  // ── Logout: call backend + clear local state ──────────────────────────────
  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    try {
      await fetch(`${ERP_API}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken() || ''}` },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch (err) {
      console.warn('[Auth] logout API failed (non-fatal):', err);
    }
    clearAuthState();
  }, [clearAuthState]);

  // ── Fetch role from JWT-protected endpoint ─────────────────────────────────
  const fetchUserRole = useCallback(async (token) => {
    try {
      const r = await fetch(`${ERP_API}/rbac/role`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.status === 401) return null;
      const json = await r.json();
      if (json.success) return json.data;
      return null;
    } catch (e) {
      return null;
    }
  }, []);

  // ── Fetch MFA status ──────────────────────────────────────────────────────
  const fetchMfaStatus = useCallback(async (token) => {
    try {
      const r = await fetch(`${ERP_API}/mfa/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.status === 401) {
        return { mfa_enabled: false, mfa_setup_required: false, verified: false, mfa_required: false };
      }
      const json = await r.json();
      if (json.success && json.data) return json.data;
      if (json.mfa_required !== undefined || json.mfa_setup_required !== undefined) return json;
      return null;
    } catch (e) {
      return { mfa_enabled: false, mfa_setup_required: false, verified: false, mfa_required: false };
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
      const roleSensitive = role ? ['OWNER', 'SALES_ADMIN', 'ADMIN'].includes(role.toUpperCase()) : false;
      const mfaRequired = mfaData ? Boolean(mfaData.mfa_required) : roleSensitive;
      const setupReq    = mfaData ? Boolean(mfaData.mfa_setup_required) : roleSensitive;

      setUserRole(role);
        setMfaState({
          enabled:       mfaEnabled,
          setupRequired: setupReq,
          verified:      false,
          mfa_required:  mfaRequired,
        });

      return { role, mfaRequired, mfaEnabled, setupRequired: setupReq };
    } catch (e) {
      console.error('[Auth] setupUserSession error:', e);
      setMfaState(prev => ({ ...prev, verified: false, mfa_required: true }));
      return null;
    }
  }, [fetchUserRole, fetchMfaStatus]);

  // ── Firebase login ────────────────────────────────────────────────────────
  const firebaseLogin = useCallback(async (idToken, firebaseUser) => {
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

      if (!r.ok) {
        throw new Error(json.message || json.error || `HTTP ${r.status}`);
      }

      const { access_token, refresh_token, user: userData } = json.data;
      setTokens(access_token, refresh_token);
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
  }, []);

  // ── Password login ─────────────────────────────────────────────────────────
  const passwordLogin = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(`${ERP_API}/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
        signal:  ctrl.signal,
      });
      clearTimeout(t);
      const json = await r.json();

      if (!r.ok) {
        throw new Error(json.message || json.error || `HTTP ${r.status}`);
      }

      // Backend returns { success: true, data: { access_token, refresh_token, user } }
      const { access_token, refresh_token, user: userData } = json.data;
      setTokens(access_token, refresh_token);
      setJwtToken(access_token);
      setUser(userData);
      await setupUserSession(access_token, false);
      setLoading(false);
      return { success: true };
    } catch (err) {
      clearTimeout(t);
      const msg = err.name === 'AbortError'
        ? 'Yêu cầu quá thời gian. Kiểm tra backend có đang chạy không.'
        : err.message;
      setError(msg);
      setLoading(false);
      return { success: false, error: msg };
    }
  }, []);

  // ── Silent refresh: proactive refresh every 14 minutes ───────────────────
  useEffect(() => {
    if (!jwtToken) return;
    const interval = setInterval(async () => {
      try {
        const refreshToken = getRefreshToken();
        if (!refreshToken) return;
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
          // Refresh failed (token expired or revoked) → clear session
          console.warn('[Auth] Silent refresh failed, clearing session');
          clearAuthState();
        }
      } catch (_) { /* silent ignore */ }
    }, 14 * 60 * 1000);
    return () => clearInterval(interval);
  }, [jwtToken, clearAuthState]);

  // ── Listen for logout event from apiClient interceptor ─────────────────────
  useEffect(() => {
    const handler = () => clearAuthState();
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
