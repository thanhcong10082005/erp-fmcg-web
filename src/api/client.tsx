/**
 * API Client cho ERP-FMCG Backend.
 *
 * Auto-unwrap: nếu response có dạng { success, data } thì trả về data.
 * Giữ backward-compat với các endpoint trả thẳng array/object.
 *
 * Refresh token flow:
 * - access_token: lưu trong localStorage key 'erp_access_token'
 * - refresh_token: lưu trong localStorage key 'erp_refresh_token'
 * - Khi nhận HTTP 401 → gọi POST /auth/refresh → lưu tokens mới → retry request
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const ACCESS_TOKEN_KEY = 'erp_access_token';
const REFRESH_TOKEN_KEY = 'erp_refresh_token';

// ── Token helpers ──────────────────────────────────────────────────────────
export function getAccessToken(): string | null {
    try { return localStorage.getItem(ACCESS_TOKEN_KEY); } catch { return null; }
}

export function getRefreshToken(): string | null {
    try { return localStorage.getItem(REFRESH_TOKEN_KEY); } catch { return null; }
}

export function setTokens(access_token: string, refresh_token: string) {
    if (!access_token || !refresh_token) {
        console.error('[api/client] setTokens — received empty token!');
        return;
    }
    try {
        localStorage.setItem(ACCESS_TOKEN_KEY, access_token);
        localStorage.setItem(REFRESH_TOKEN_KEY, refresh_token);
    } catch (err) {
        console.error('[api/client] localStorage write failed:', err);
        throw err; // surface the error instead of swallowing it
    }
}

export function clearTokens() {
    try {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch (_) { /* ignore */ }
}

// ── Refresh lock — chỉ 1 request refresh tại 1 thời điểm (tránh race condition) ──
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
    refreshSubscribers.push(cb);
}

function onTokenRefreshed(newToken: string) {
    refreshSubscribers.forEach(cb => cb(newToken));
    refreshSubscribers = [];
}

// ── Core fetch với interceptor ───────────────────────────────────────────
export async function apiCall(method: string, path: string, body?: unknown, token?: string | null) {
    const accessToken = token || getAccessToken();

    const doRequest = async (authToken?: string | null) => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        const res = await fetch(`${API_BASE}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        // ── 401: try refresh ──────────────────────────────────────────────
        if (res.status === 401 && !path.includes('/auth/')) {
            if (!isRefreshing) {
                isRefreshing = true;
                try {
                    const refreshed = await performTokenRefresh();
                    if (refreshed) {
                        onTokenRefreshed(refreshed);
                        const newHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
                        newHeaders['Authorization'] = `Bearer ${refreshed}`;
                        const retry = await fetch(`${API_BASE}${path}`, {
                            method,
                            headers: newHeaders,
                            body: body ? JSON.stringify(body) : undefined,
                        });
                        return handleResponse(retry);
                    }
                } catch (err) {
                    console.warn('[apiCall] Token refresh failed:', err);
                    clearTokens();
                    window.dispatchEvent(new CustomEvent('auth:logout'));
                    throw err;
                } finally {
                    isRefreshing = false;
                    refreshSubscribers = [];
                }
            } else {
                // Đang refresh → đợi token mới rồi retry
                return new Promise<unknown>((resolve, reject) => {
                    subscribeTokenRefresh(async (newToken: string) => {
                        try {
                            const newHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
                            newHeaders['Authorization'] = `Bearer ${newToken}`;
                            const retry = await fetch(`${API_BASE}${path}`, {
                                method,
                                headers: newHeaders,
                                body: body ? JSON.stringify(body) : undefined,
                            });
                            const result = await handleResponse(retry);
                            resolve(result);
                        } catch (err) {
                            reject(err);
                        }
                    });
                });
            }
        }

        return handleResponse(res);
    };

    return doRequest(accessToken);
}

async function handleResponse(res: Response): Promise<unknown> {
    let data: Record<string, unknown> = {};
    try { data = await res.json() as Record<string, unknown>; } catch (_) { /* non-JSON */ }
    if (!res.ok) {
        const msg = (data?.message || data?.error || `HTTP ${res.status}`) as string;
        throw new Error(Array.isArray(msg) ? msg.join(', ') : msg);
    }
    // Auto-unwrap: backend wraps most responses in { success, data }
    // eslint-disable-next-line no-prototype-builtins
    if (data && data.hasOwnProperty('success') && data.hasOwnProperty('data')) {
        return data.data;
    }
    return data;
}

async function performTokenRefresh(): Promise<string | null> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
        console.warn('[apiCall] No refresh token — cannot refresh');
        return null;
    }
    try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) {
            console.warn('[apiCall] Refresh failed:', res.status);
            return null;
        }
        const json = await res.json() as { success: boolean; data?: { access_token: string; refresh_token: string } };
        if (json.success && json.data) {
            const { access_token, refresh_token } = json.data;
            // Verify tokens are non-empty strings before storing
            if (!access_token || !refresh_token) {
                console.error('[apiCall] Refresh returned empty token(s):', json.data);
                return null;
            }
            setTokens(access_token, refresh_token);
            // Double-check localStorage write succeeded
            const storedAccess  = localStorage.getItem(ACCESS_TOKEN_KEY);
            const storedRefresh = localStorage.getItem(REFRESH_TOKEN_KEY);
            if (storedAccess !== access_token || storedRefresh !== refresh_token) {
                console.error('[apiCall] localStorage write FAILED!', {
                    expectedAccess:  access_token,
                    actualAccess:   storedAccess,
                    expectedRefresh: refresh_token,
                    actualRefresh:  storedRefresh,
                });
                return null;
            }
            console.log('[apiCall] performTokenRefresh — SUCCESS, tokens updated');
            return access_token;
        }
        console.warn('[apiCall] Refresh bad shape:', json);
        return null;
    } catch (err) {
        console.warn('[apiCall] Refresh error:', err);
        return null;
    }
}

// ── Formatting helpers ────────────────────────────────────────────────────
export const fmt = {
    vnd: (v: unknown) => typeof v === 'number' ? new Intl.NumberFormat('vi-VN').format(v) + ' ₫' : `${v} ₫`,
    num: (v: unknown) => typeof v === 'number' ? new Intl.NumberFormat('vi-VN').format(v) : v,
    date: (v: unknown) => v ? new Date(v as string).toLocaleString('vi-VN') : '—',
    dateOnly: (v: unknown) => v ? new Date(v as string).toLocaleDateString('vi-VN') : '—',
};

export function StatusBadge({ s, type = 'generic' }: { s: string; type?: string }) {
    const colorMap: Record<string, string> = {
        DRAFT: '#6B7280', CONFIRMED: '#3B82F6', PICKING: '#F59E0B',
        DELIVERING: '#F97316', DELIVERED: '#10B981', INVOICED: '#059669',
        CLOSED: '#374151', CANCELLED: '#DC2626', PENDING: '#6B7280',
        APPROVED: '#3B82F6', RECEIVED: '#10B981',
        UNPAID: '#DC2626', PAID: '#10B981', OVERDUE: '#B91C1C',
        UNALLOCATED: '#F59E0B', ALLOCATED: '#10B981',
        RECONCILED: '#059669', POSTED: '#3B82F6', IMPORTED: '#6B7280',
        RECONCILING: '#F59E0B', ARCHIVED: '#374151',
        ISSUED: '#10B981',
        SENT: '#3B82F6', ACCEPTED: '#10B981', REJECTED: '#DC2626',
        TIMEOUT: '#B91C1C', ERROR: '#DC2626',
        OK: '#10B981', LOW_STOCK: '#F59E0B', OUT_OF_STOCK: '#DC2626',
        ASSIGNED: '#3B82F6', FAILED: '#DC2626', RETURNED: '#F97316',
        MATCHED: '#10B981', MISMATCHED: '#DC2626',
    };
    const color = colorMap[s] || '#6B7280';
    return (
        <span style={{
            background: color, color: '#fff', padding: '2px 8px',
            borderRadius: 4, fontSize: '.7rem', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: 0.4,
        }}>{s}</span>
    );
}
