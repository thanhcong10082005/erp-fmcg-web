/**
 * API Client cho ERP-FMCG Backend.
 * Dùng chung với dev-mode / Firebase ID token.
 */
const API_BASE = (import.meta as unknown as { env: { VITE_API_URL?: string } }).env.VITE_API_URL || 'http://localhost:3001/api';

export async function apiCall(method, path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* non-JSON */ }
    if (!res.ok) {
        const msg = data?.message || data?.error || `HTTP ${res.status}`;
        throw new Error(Array.isArray(msg) ? msg.join(', ') : msg);
    }
    return data;
}

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
