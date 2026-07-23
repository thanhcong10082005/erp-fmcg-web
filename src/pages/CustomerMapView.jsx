/**
 * CustomerMapView — Tab "🗺️ Bản đồ" trong PartnersPage.
 *
 * Hiển thị tất cả partners có toạ độ trên bản đồ Vietmap.
 * - Filter theo routeCode, partner_type, province
 * - Click vào pin → popup thông tin partner
 * - Auto-fit bounds khi filter đổi
 *
 * Props:
 *   - token: JWT token
 *   - onClose: callback để quay về list view
 */

import React, { useState, useEffect, useCallback } from 'react';
import { apiCall } from '../api/client';
import VietmapMap from '../components/VietmapMap';

const PARTNER_TYPES = ['STORE', 'ASO', 'SUPERMARKET', 'CHAIN', 'AGENT', 'INDIVIDUAL', 'CORPORATE'];

export default function CustomerMapView({ token, onClose, search }) {
    const [points, setPoints]       = useState([]);
    const [routes, setRoutes]       = useState([]);
    const [provinces, setProvinces] = useState([]);
    const [filters, setFilters]     = useState({ routeCode: '', type: '', province: '' });
    const [loading, setLoading]     = useState(false);
    const [err, setErr]             = useState('');
    const [selected, setSelected]   = useState(null);
    const [total, setTotal]         = useState(0);

    const load = useCallback(async () => {
        setLoading(true);
        setErr('');
        try {
            const qs = new URLSearchParams();
            if (search)            qs.set('search', search);
            if (filters.routeCode) qs.set('routeCode', filters.routeCode);
            if (filters.type)      qs.set('type', filters.type);
            if (filters.province)  qs.set('province', filters.province);
            const data = await apiCall('GET', `/partners/geojson/all?${qs.toString()}`, null, token);
            const features = data?.features || [];

            const mapped = features
                .map(f => ({
                    id:    f.properties.partner_id,
                    lat:   f.geometry.coordinates?.[1],
                    lng:   f.geometry.coordinates?.[0],
                    label: f.properties.partner_name,
                    icon:  '🏪',
                    color: f.properties.partner_type === 'ASO' ? '#F59E0B' : '#2563EB',
                    metadata: f.properties,
                }))
                .filter(p => typeof p.lat === 'number' && typeof p.lng === 'number'
                    && Number.isFinite(p.lat) && Number.isFinite(p.lng));

            setPoints(mapped);
            setTotal(data?.total ?? features.length);

            // Extract unique routes + provinces cho filter dropdown
            const rSet = new Set();
            const pSet = new Set();
            features.forEach(f => {
                if (f.properties.route_code) rSet.add(f.properties.route_code);
                if (f.properties.province)   pSet.add(f.properties.province);
            });
            setRoutes([...rSet].sort());
            setProvinces([...pSet].sort());
        } catch (e) {
            setErr(e.message);
        } finally {
            setLoading(false);
        }
    }, [token, filters, search]);

    useEffect(() => { if (token) load(); }, [load, token]);

    return (
        <div>
            {/* Header + filter bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ margin: 0 }}>🗺️ Bản đồ khách hàng — {total} điểm</h3>
                <button className="btn btn-outline btn-sm" onClick={onClose}>← Quay lại danh sách</button>
            </div>

            {err && (
                <div style={{ background: '#FEE2E2', color: '#B91C1C', padding: 8, borderRadius: 4, marginBottom: 12 }}>
                    ⚠️ {err}
                </div>
            )}

            {/* Filters */}
            <div className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                    <select className="input" value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}>
                        <option value="">— Tất cả loại —</option>
                        {PARTNER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select className="input" value={filters.routeCode} onChange={e => setFilters(f => ({ ...f, routeCode: e.target.value }))}>
                        <option value="">— Tất cả tuyến —</option>
                        {routes.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <select className="input" value={filters.province} onChange={e => setFilters(f => ({ ...f, province: e.target.value }))}>
                        <option value="">— Tất cả tỉnh —</option>
                        {provinces.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <button className="btn btn-primary btn-sm" onClick={load} disabled={loading}>
                        {loading ? '⏳ Đang tải...' : '🔄 Làm mới'}
                    </button>
                </div>
            </div>

            {/* Map */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <VietmapMap
                    points={points}
                    height="600px"
                    fitBounds={true}
                    onPointClick={setSelected}
                />
            </div>

            {/* Selected partner detail */}
            {selected && (
                <div className="card" style={{ marginTop: 12, borderLeft: `4px solid ${selected.color}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h4 style={{ margin: 0 }}>🏪 {selected.metadata.partner_name}</h4>
                            <div style={{ fontSize: '0.85rem', color: '#6B7280', marginTop: 4 }}>
                                Mã: <strong>{selected.metadata.partner_code}</strong> · Loại: {selected.metadata.partner_type}
                            </div>
                            <div style={{ marginTop: 8, fontSize: '0.9rem' }}>
                                📍 {selected.metadata.address_line || '—'}<br />
                                {selected.metadata.ward && <>P. {selected.metadata.ward}<br /></>}
                                {selected.metadata.district && <>Q. {selected.metadata.district}<br /></>}
                                {selected.metadata.province && <>Tỉnh {selected.metadata.province}</>}
                            </div>
                            {selected.metadata.route_code && (
                                <div style={{ marginTop: 8, fontSize: '0.85rem' }}>
                                    🛣️ Tuyến: <strong>{selected.metadata.route_code}</strong>
                                    {selected.metadata.route_name && ` — ${selected.metadata.route_name}`}
                                </div>
                            )}
                            <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#6B7280' }}>
                                Toạ độ: {selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}
                                {selected.metadata.geocoding_confidence && (
                                    <> · Độ chính xác: <span style={{ color: selected.metadata.geocoding_confidence === 'HIGH' ? '#059669' : selected.metadata.geocoding_confidence === 'MEDIUM' ? '#D97706' : '#6B7280' }}>
                                        {selected.metadata.geocoding_confidence}
                                    </span></>
                                )}
                            </div>
                        </div>
                        <button className="btn btn-outline btn-sm" onClick={() => setSelected(null)}>✕</button>
                    </div>
                </div>
            )}
        </div>
    );
}