/**
 * DispatcherMapPage — Bản đồ điều phối (Phase 3).
 *
 * Features:
 *   - Hiển thị tất cả partners có toạ độ lên bản đồ Vietmap
 *   - Color-coded theo trạng thái gán chuyến (unassigned / trip X)
 *   - Click pin → popup info + nút "Gán vào chuyến"
 *   - Drag pin → PATCH /partners/:id/location (chỉ OWNER/ADMIN/DISPATCHER)
 *   - Side panel: danh sách trips đang PREPARING/LOADING + số orders
 *   - Filter theo route_code, partner_type
 *
 * Endpoints dùng:
 *   GET  /partners/geojson/all            — load pins
 *   PATCH /partners/:id/location          — drag pin
 *   GET  /sales/trips?status=PREPARING    — load trips
 *   POST /sales/trips/:id/orders          — gán order vào trip
 *   GET  /sales/orders?status=CONFIRMED   — orders chưa gán
 */

import React, { useState, useEffect, useCallback } from 'react';
import { apiCall } from '../api/client';
import VietmapMap from '../components/VietmapMap';

const PARTNER_TYPES = ['STORE', 'ASO', 'SUPERMARKET', 'CHAIN', 'AGENT', 'INDIVIDUAL', 'CORPORATE'];

// Màu theo trip_id (hash đơn giản)
const TRIP_COLORS = ['#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1'];
function colorForTrip(tripId) {
    if (tripId === null || tripId === undefined) return '#3B82F6'; // unassigned: xanh dương
    return TRIP_COLORS[Math.abs(tripId) % TRIP_COLORS.length];
}

export default function DispatcherMapPage({ token, userRole }) {
    const [points, setPoints]               = useState([]);
    const [trips, setTrips]                 = useState([]);
    const [selectedPoint, setSelectedPoint] = useState(null);
    const [selectedTripId, setSelectedTripId] = useState('');
    const [loading, setLoading]             = useState(false);
    const [err, setErr]                     = useState('');
    const [filters, setFilters]             = useState({ routeCode: '', type: '' });
    const [routes, setRoutes]               = useState([]);
    const [savingId, setSavingId]           = useState(null);

    // Geocoding state
    const [pendingCount, setPendingCount]   = useState(0);
    const [geocodeRunning, setGeocodeRunning] = useState(false);
    const [geocodeProgress, setGeocodeProgress] = useState(null);
    const [geocodeMsg, setGeocodeMsg]       = useState('');

    const canEdit = ['OWNER', 'ADMIN', 'DISPATCHER'].includes((userRole || '').toUpperCase());
    const canAdmin = ['OWNER', 'ADMIN'].includes((userRole || '').toUpperCase());

    // Map từ partner_id → trip_id (để color pin)
    const partnerToTripMap = React.useMemo(() => {
        const m = new Map();
        trips.forEach(t => {
            (t.orders || []).forEach(o => {
                m.set(o.partner_id, t.trip_id);
            });
        });
        return m;
    }, [trips]);

    // Load partners (pins) + trips song song
    const loadAll = useCallback(async () => {
        setLoading(true);
        setErr('');
        try {
            const qs = new URLSearchParams();
            if (filters.routeCode) qs.set('routeCode', filters.routeCode);
            if (filters.type)      qs.set('type', filters.type);
            qs.set('limit', '5000');

            const [geoRes, tripsRes] = await Promise.all([
                apiCall('GET', `/partners/geojson/all?${qs.toString()}`, null, token),
                apiCall('GET', '/sales/trips?status=PREPARING', null, token),
            ]);

            const features = geoRes?.features || [];
            const mapped = features
                .map(f => {
                    const tripId = partnerToTripMap.get(f.properties.partner_id) || null;
                    return {
                        id:    f.properties.partner_id,
                        lat:   f.geometry.coordinates?.[1],
                        lng:   f.geometry.coordinates?.[0],
                        label: f.properties.partner_name,
                        icon:  '🏪',
                        color: colorForTrip(tripId),
                        metadata: { ...f.properties, trip_id: tripId },
                    };
                })
                .filter(p => typeof p.lat === 'number' && typeof p.lng === 'number'
                    && Number.isFinite(p.lat) && Number.isFinite(p.lng));

            setPoints(mapped);
            setRoutes([...new Set(features.map(f => f.properties.route_code).filter(Boolean))].sort());
            setTrips(Array.isArray(tripsRes) ? tripsRes : (tripsRes?.data || []));
        } catch (e) {
            setErr(e.message);
        } finally {
            setLoading(false);
        }
    }, [token, filters, partnerToTripMap]);

    // Reload khi filters đổi
    useEffect(() => { if (token) loadAll(); }, [filters, token]);

    // ── Geocoding helpers ────────────────────────────────────────
    const loadGeocodeStatus = useCallback(async () => {
        try {
            const s = await apiCall('GET', '/admin/geocode/status', null, token);
            setPendingCount(s?.status?.pendingCount ?? 0);
            setGeocodeRunning(!!s?.status?.running);
            setGeocodeProgress(s?.progress ?? null);
        } catch (e) {
            // Endpoint có thể từ chối nếu không phải OWNER/ADMIN — log nhẹ, không spam
            if (e?.message && !e.message.includes('Forbidden')) {
                console.warn('[GeocodeStatus] load failed:', e.message);
            }
        }
    }, [token]);

    const handleGeocodeRefresh = async () => {
        if (geocodeRunning) return;
        setErr('');
        setGeocodeMsg('⏳ Đang gửi yêu cầu...');
        try {
            const r = await apiCall('POST', '/admin/geocode/refresh', { reason: 'manual-dispatcher' }, token);
            setGeocodeMsg(r.message || 'Đã trigger');
            setGeocodeRunning(true);
            // Poll mỗi 3s
            const iv = setInterval(async () => {
                const cur = await apiCall('GET', '/admin/geocode/status', null, token).catch(() => null);
                if (!cur) return;
                setPendingCount(cur?.status?.pendingCount ?? 0);
                setGeocodeProgress(cur?.progress ?? null);
                setGeocodeRunning(!!cur?.status?.running);
                if (!cur?.status?.running) {
                    clearInterval(iv);
                    setGeocodeRunning(false);
                    const ok      = cur?.status?.lastOk      ?? 0;
                    const failed  = cur?.status?.lastFailed  ?? 0;
                    setGeocodeMsg(`✓ Hoàn tất: ${ok} OK / ${failed} failed`);
                    loadAll(); // refresh pins
                    setTimeout(() => setGeocodeMsg(''), 6000);
                }
            }, 3000);
        } catch (e) {
            setGeocodeMsg('✗ Lỗi: ' + e.message);
            setTimeout(() => setGeocodeMsg(''), 6000);
        }
    };

    // Poll status mỗi 30s (không gate theo canAdmin — vẫn poll để hiển thị trạng thái
    // mới nhất cho mọi role; endpoint sẽ trả 403 nếu user không phải OWNER/ADMIN)
    useEffect(() => {
        if (!token) return;
        loadGeocodeStatus();
        const iv = setInterval(loadGeocodeStatus, 30_000);
        return () => clearInterval(iv);
    }, [loadGeocodeStatus, token]);

    // Khi trips thay đổi → re-color pins
    useEffect(() => {
        setPoints(prev => prev.map(p => {
            const tripId = partnerToTripMap.get(p.id) || null;
            return { ...p, color: colorForTrip(tripId), metadata: { ...p.metadata, trip_id: tripId } };
        }));
    }, [partnerToTripMap]);

    // Drag pin handler
    const handleLocationChange = async (point) => {
        if (!canEdit) {
            alert('Bạn không có quyền sửa toạ độ.');
            return;
        }
        setSavingId(point.id);
        try {
            await apiCall('PATCH', `/partners/${point.id}/location`, {
                latitude:  point.lat,
                longitude: point.lng,
            }, token);
            // Refresh point metadata để confidence = MANUAL
            setPoints(prev => prev.map(p =>
                p.id === point.id
                    ? { ...p, lat: point.lat, lng: point.lng, metadata: { ...p.metadata, geocoding_confidence: 'MANUAL' } }
                    : p,
            ));
        } catch (e) {
            setErr(e.message);
            alert('Lỗi khi lưu toạ độ: ' + e.message);
        } finally {
            setSavingId(null);
        }
    };

    // Gán order vào trip
    const handleAssignToTrip = async (partnerId, tripId) => {
        if (!tripId) {
            alert('Vui lòng chọn chuyến.');
            return;
        }
        try {
            // Tìm order pending của partner này
            const orders = await apiCall('GET', `/sales/orders?status=CONFIRMED&partner_id=${partnerId}&limit=1`, null, token);
            const order = Array.isArray(orders) ? orders[0] : (orders?.data?.[0]);
            if (!order) {
                alert(`Không tìm thấy đơn CONFIRMED nào của partner #${partnerId}.`);
                return;
            }
            await apiCall('POST', `/sales/trips/${tripId}/orders`, { so_id: order.so_id }, token);
            alert(`Đã gán SO #${order.so_id} vào chuyến #${tripId}.`);
            loadAll();
        } catch (e) {
            setErr(e.message);
            alert('Lỗi khi gán: ' + e.message);
        }
    };

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ margin: 0 }}>🚚 Bản đồ điều phối — {points.length} điểm / {trips.length} chuyến đang mở</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Badge geocode status — hiển thị cho mọi role */}
                    <span style={{
                        fontSize: '0.75rem',
                        color: pendingCount === 0 ? '#059669' : '#92400E',
                        background: pendingCount === 0 ? '#D1FAE5' : '#FEF3C7',
                        padding: '2px 8px',
                        borderRadius: 12,
                    }} title="Số partner trong DB chưa có toạ độ — được tính tự động từ backend">
                        {geocodeRunning
                            ? `⏳ Đang geocode ${geocodeProgress?.current ?? 0}/${(geocodeProgress?.total ?? pendingCount) || '?'}`
                            : pendingCount === 0
                                ? '✓ Toạ độ đầy đủ'
                                : `⚠️ ${pendingCount} ASO thiếu toạ độ`
                        }
                    </span>
                    {/* Nút trigger — chỉ OWNER/ADMIN thấy */}
                    {canAdmin && pendingCount > 0 && (
                        <button
                            className="btn btn-sm"
                            onClick={handleGeocodeRefresh}
                            disabled={geocodeRunning}
                            style={{
                                background: geocodeRunning ? '#FCD34D' : '#F59E0B',
                                color: '#fff',
                                border: 'none',
                                cursor: geocodeRunning ? 'wait' : 'pointer',
                            }}
                            title={`Có ${pendingCount} partners chưa có toạ độ. Click để geocode tự động (~${Math.ceil(pendingCount / 40)} giây).`}
                        >
                            {geocodeRunning ? '⏳ Đang chạy...' : `🛰️ Geocode ${pendingCount} ASO`}
                        </button>
                    )}
                    <button className="btn btn-outline btn-sm" onClick={loadAll} disabled={loading}>
                        {loading ? '⏳ Đang tải...' : '🔄 Làm mới'}
                    </button>
                </div>
            </div>
            {geocodeMsg && (
                <div style={{
                    background: geocodeMsg.startsWith('✓') ? '#D1FAE5' : geocodeMsg.startsWith('✗') ? '#FEE2E2' : '#FEF3C7',
                    color: '#1F2937',
                    padding: 8,
                    borderRadius: 4,
                    marginBottom: 8,
                    fontSize: '0.85rem',
                }}>
                    {geocodeMsg}
                </div>
            )}
            {canAdmin && geocodeProgress && geocodeRunning && geocodeProgress.lastError && (
                <div style={{ fontSize: '0.75rem', color: '#6B7280', marginBottom: 8 }}>
                    Last error: <code>{geocodeProgress.lastError}</code>
                </div>
            )}

            {err && (
                <div style={{ background: '#FEE2E2', color: '#B91C1C', padding: 8, borderRadius: 4, marginBottom: 12 }}>
                    ⚠️ {err}
                </div>
            )}

            {!canEdit && (
                <div style={{ background: '#FEF3C7', color: '#92400E', padding: 8, borderRadius: 4, marginBottom: 12, fontSize: '0.85rem' }}>
                    ℹ️ Bạn đang xem ở chế độ chỉ-đọc. Chỉ OWNER/ADMIN/DISPATCHER mới có quyền kéo pin sửa toạ độ.
                </div>
            )}

            {/* Layout 2 cột: map + side panel */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 12 }}>
                {/* Map */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <VietmapMap
                        points={points}
                        height="650px"
                        fitBounds={true}
                        draggable={canEdit}
                        onPointClick={setSelectedPoint}
                        onLocationChange={handleLocationChange}
                    />
                    {savingId && (
                        <div style={{ padding: 8, fontSize: '0.8rem', color: '#6B7280', background: '#F3F4F6' }}>
                            ⏳ Đang lưu toạ độ partner #{savingId}...
                        </div>
                    )}
                </div>

                {/* Side panel */}
                <div>
                    {/* Filters */}
                    <div className="card" style={{ marginBottom: 12 }}>
                        <div className="card-header"><h4 style={{ margin: 0, fontSize: '0.95rem' }}>🔍 Lọc</h4></div>
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <select className="input" value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}>
                                <option value="">— Tất cả loại —</option>
                                {PARTNER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <select className="input" value={filters.routeCode} onChange={e => setFilters(f => ({ ...f, routeCode: e.target.value }))}>
                                <option value="">— Tất cả tuyến —</option>
                                {routes.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Trips list */}
                    <div className="card" style={{ marginBottom: 12 }}>
                        <div className="card-header">
                            <h4 style={{ margin: 0, fontSize: '0.95rem' }}>🚚 Chuyến đang mở ({trips.length})</h4>
                        </div>
                        <div className="card-body" style={{ maxHeight: 280, overflowY: 'auto' }}>
                            {trips.length === 0 ? (
                                <div style={{ color: '#6B7280', fontSize: '0.85rem' }}>Không có chuyến nào đang mở.</div>
                            ) : trips.map(t => (
                                <div
                                    key={t.trip_id}
                                    style={{
                                        padding: 8, marginBottom: 6, borderRadius: 4, cursor: 'pointer',
                                        background: selectedTripId === String(t.trip_id) ? '#DBEAFE' : '#F9FAFB',
                                        border: `2px solid ${colorForTrip(t.trip_id)}`,
                                    }}
                                    onClick={() => setSelectedTripId(String(t.trip_id))}
                                >
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                        {t.trip_number}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                                        {t.driver_name || '—'} · {t.vehicle_plate || '—'}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', marginTop: 2 }}>
                                        📦 {t.total_orders || 0} đơn · <span style={{ color: colorForTrip(t.trip_id) }}>{t.status}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Selected point detail */}
                    {selectedPoint && (
                        <div className="card" style={{ borderLeft: `4px solid ${selectedPoint.color}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>🏪 {selectedPoint.metadata.partner_name}</h4>
                                <button className="btn btn-outline btn-sm" onClick={() => setSelectedPoint(null)}>✕</button>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#6B7280', marginTop: 4 }}>
                                #{selectedPoint.id} · {selectedPoint.metadata.partner_type}
                            </div>
                            <div style={{ fontSize: '0.8rem', marginTop: 6 }}>
                                📍 {selectedPoint.metadata.address_line || '—'}
                                {selectedPoint.metadata.ward && <>, P. {selectedPoint.metadata.ward}</>}
                                {selectedPoint.metadata.district && <>, Q. {selectedPoint.metadata.district}</>}
                                {selectedPoint.metadata.province && <>, {selectedPoint.metadata.province}</>}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#6B7280', marginTop: 4 }}>
                                Toạ độ: {selectedPoint.lat.toFixed(6)}, {selectedPoint.lng.toFixed(6)} ·
                                <span style={{ color: selectedPoint.metadata.geocoding_confidence === 'HIGH' ? '#059669'
                                                  : selectedPoint.metadata.geocoding_confidence === 'MEDIUM' ? '#D97706'
                                                  : selectedPoint.metadata.geocoding_confidence === 'MANUAL' ? '#2563EB' : '#6B7280' }}>
                                    {' '}{selectedPoint.metadata.geocoding_confidence || 'N/A'}
                                </span>
                            </div>

                            <div style={{ marginTop: 10, borderTop: '1px solid #E5E7EB', paddingTop: 8 }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Gán vào chuyến:</label>
                                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                    <select
                                        className="input"
                                        value={selectedTripId}
                                        onChange={e => setSelectedTripId(e.target.value)}
                                        style={{ flex: 1 }}
                                    >
                                        <option value="">— Chọn chuyến —</option>
                                        {trips.map(t => (
                                            <option key={t.trip_id} value={t.trip_id}>{t.trip_number}</option>
                                        ))}
                                    </select>
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={() => handleAssignToTrip(selectedPoint.id, selectedTripId)}
                                        disabled={!selectedTripId}
                                    >
                                        ➕ Gán
                                    </button>
                                </div>
                                {selectedPoint.metadata.trip_id && (
                                    <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#2563EB' }}>
                                        ✓ Đang thuộc chuyến #{selectedPoint.metadata.trip_id}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}