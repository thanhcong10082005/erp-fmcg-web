/**
 * API Client cho ERP-FMCG Backend.
 * Dùng chung với dev-mode / Firebase ID token.
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
    try {
        localStorage.setItem(ACCESS_TOKEN_KEY, access_token);
        localStorage.setItem(REFRESH_TOKEN_KEY, refresh_token);
    } catch {}
}

export function clearTokens() {
    try {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch {}
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
export async function apiCall(method, path, body, token?) {
    const accessToken = token || getAccessToken();

    const doRequest = async (authToken?: string) => {
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
                        // Retry request với token mới
                        const newHeaders = { 'Content-Type': 'application/json' };
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
                return new Promise((resolve, reject) => {
                    subscribeTokenRefresh(async (newToken) => {
                        try {
                            const newHeaders = { 'Content-Type': 'application/json' };
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

async function handleResponse(res: Response) {
    let data = {};
    try { data = await res.json(); } catch (e) { /* non-JSON */ }
    if (!res.ok) {
        const msg = data?.message || data?.error || `HTTP ${res.status}`;
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
        const json = await res.json();
        if (json.success && json.data) {
            const { access_token, refresh_token } = json.data;
            setTokens(access_token, refresh_token);
            return access_token;
        }
        return null;
    } catch (err) {
        console.warn('[apiCall] Refresh error:', err);
        return null;
    }
}

// ── Legacy: apiCall với token truyền trực tiếp (backward compat) ──────────
// Deprecate dần — ưu tiên dùng getAccessToken()
// Keep signature: apiCall(method, path, body, token)

export const fmt = {
    vnd: (v) => typeof v === 'number' ? new Intl.NumberFormat('vi-VN').format(v) + ' ₫' : `${v} ₫`,
    num: (v) => typeof v === 'number' ? new Intl.NumberFormat('vi-VN').format(v) : v,
    date: (v) => v ? new Date(v).toLocaleString('vi-VN') : '—',
    dateOnly: (v) => v ? new Date(v).toLocaleDateString('vi-VN') : '—',
};

export function StatusBadge({ s, type = 'generic' }) {
    const colorMap = {
        // Order status
        DRAFT: '#6B7280', CONFIRMED: '#3B82F6', PICKING: '#F59E0B',
        DELIVERING: '#F97316', DELIVERED: '#10B981', INVOICED: '#059669',
        CLOSED: '#374151', CANCELLED: '#DC2626', PENDING: '#6B7280',
        APPROVED: '#3B82F6', RECEIVED: '#10B981',
        // Payment
        UNPAID: '#DC2626', PAID: '#10B981', OVERDUE: '#B91C1C',
        UNALLOCATED: '#F59E0B', ALLOCATED: '#10B981',
        RECONCILED: '#059669', POSTED: '#3B82F6', IMPORTED: '#6B7280',
        RECONCILING: '#F59E0B', ARCHIVED: '#374151',
        // Invoice
        ISSUED: '#10B981',
        // e-invoice
        SENT: '#3B82F6', ACCEPTED: '#10B981', REJECTED: '#DC2626',
        TIMEOUT: '#B91C1C', ERROR: '#DC2626',
        // Stock
        OK: '#10B981', LOW_STOCK: '#F59E0B', OUT_OF_STOCK: '#DC2626',
        // Delivery
        ASSIGNED: '#3B82F6', FAILED: '#DC2626', RETURNED: '#F97316',
        // COD
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
