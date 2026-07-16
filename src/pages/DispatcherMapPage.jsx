/**
 * DispatcherMapPage — Bản đồ điều phối (v11).
 *
 * Features v11:
 *   Phase 3: Route Line Visualization — vẽ LineString khi chọn trip
 *   Phase 4: Gán đơn qua Popup — click pin → popup → dropdown → Gán
 *   Phase 5: Data-rich Pins — stop_order số + scale theo weight
 *   Phase 2 (backend): "Tối ưu lộ trình" — TSP button
 *
 * Phase 6 (Audit Map): Xem ở trang riêng AuditMapPage
 */

import React, { useState, useEffect, useCallback } from 'react';
import { apiCall } from '../api/client';
import VietmapMap from '../components/VietmapMap';

const PARTNER_TYPES = ['STORE', 'ASO', 'SUPERMARKET', 'CHAIN', 'AGENT', 'INDIVIDUAL', 'CORPORATE'];

const TRIP_COLORS = [
  '#10B981', '#F59E0B', '#8B5CF6', '#EC4899',
  '#14B8A6', '#F97316', '#6366F1', '#EF4444',
];
function colorForTrip(tripId) {
    if (tripId === null || tripId === undefined) return '#3B82F6';
    return TRIP_COLORS[Math.abs(tripId) % TRIP_COLORS.length];
}

export default function DispatcherMapPage({ token, userRole }) {
    const [points, setPoints]                 = useState([]);
    const [trips, setTrips]                   = useState([]);
    const [selectedTripId, setSelectedTripId]  = useState('');
    const [selectedPoint, setSelectedPoint]    = useState(null);
    const [loading, setLoading]               = useState(false);
    const [err, setErr]                     = useState('');
    const [filters, setFilters]               = useState({ routeCode: '', type: '', geoConfidence: '' });
    const [searchText, setSearchText]       = useState('');
    const [routes, setRoutes]               = useState([]);
    const [savingId, setSavingId]           = useState(null);
    // Force-reload markers counter
    const [forceRenderKey, setForceRenderKey] = useState(0);

    // ── Geocoding state ────────────────────────────────────────
    const [pendingCount, setPendingCount]   = useState(0);
    const [geocodeRunning, setGeocodeRunning] = useState(false);
    const [geocodeProgress, setGeocodeProgress] = useState(null);
    const [geocodeMsg, setGeocodeMsg]       = useState('');

    // ── Phase 3: Route geometry ───────────────────────────────
    const [routeGeometry, setRouteGeometry]   = useState(null);
    const [routeDistance, setRouteDistance]  = useState(0);
    const [routeLoading, setRouteLoading]   = useState(false);

    // ── Phase 2: TSP optimization ─────────────────────────────
    const [optimizing, setOptimizing]       = useState(false);
    const [optimizeResult, setOptimizeResult] = useState(null);
    const [optimizeMsg, setOptimizeMsg]     = useState('');

    // ── Phase 4: Popup assign state ───────────────────────────
    const [popupTripId, setPopupTripId]    = useState('');
    const [assignLoading, setAssignLoading] = useState(false);

    const canEdit = ['OWNER', 'ADMIN', 'DISPATCHER'].includes((userRole || '').toUpperCase());
    const canAdmin = ['OWNER', 'ADMIN'].includes((userRole || '').toUpperCase());

    // ── Map partner_id → trip_id (coloring) ────────────────────
    const partnerToTripMap = React.useMemo(() => {
        const m = new Map();
        trips.forEach(t => {
            (t.orders || []).forEach(o => {
                m.set(o.partner_id, t.trip_id);
            });
        });
        return m;
    }, [trips]);

    // ── Map partner_id → stop_order + total_weight (Phase 5) ──
    const partnerMetaMap = React.useMemo(() => {
        const m = new Map();
        trips.forEach(t => {
            (t.orders || []).forEach(o => {
                m.set(o.partner_id, {
                    trip_id:     t.trip_id,
                    stop_order:  o.stop_order,
                    total_weight: o.total_amount || 0,
                });
            });
        });
        return m;
    }, [trips]);

    // ── Client-side filter: trip + search text + geocoding confidence ─
    const filteredPoints = React.useMemo(() => {
        const q = searchText.trim().toLowerCase();
        return points.filter(p => {
            // Trip filter: when a trip is selected, show only its partners
            if (selectedTripId) {
                if (String(p.metadata?.trip_id) !== String(selectedTripId)) return false;
            }
            // Search filter
            if (q) {
                const name  = (p.metadata?.partner_name || '').toLowerCase();
                const code  = (p.metadata?.partner_code || '').toLowerCase();
                const route = (p.metadata?.route_code  || '').toLowerCase();
                if (!name.includes(q) && !code.includes(q) && !route.includes(q)) return false;
            }
            // Confidence filter
            if (filters.geoConfidence) {
                const conf = p.metadata?.geocoding_confidence;
                if (filters.geoConfidence === 'HIGH') {
                    if (conf !== 'HIGH' && conf !== 'MANUAL') return false;
                } else if (filters.geoConfidence === 'MEDIUM') {
                    if (conf !== 'MEDIUM') return false;
                } else if (filters.geoConfidence === 'LOW') {
                    if (conf !== 'LOW') return false;
                } else if (filters.geoConfidence === 'NONE') {
                    if (conf && conf !== 'NONE') return false;
                }
            }
            return true;
        });
    }, [points, searchText, filters.geoConfidence, selectedTripId]);

    // ── Load partners + trips ────────────────────────────────────
    // IMPORTANT: loadAll KHÔNG phụ thuộc partnerToTripMap/partnerMetaMap
    // vì sẽ gây infinite loop (trips → maps → trips → ...)
    // Maps được build TRONG loadAll từ tripsRes, không từ state trips
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

            // Build maps từ tripsRes (fresh data) — KHÔNG dùng state trips ở đây
            const incomingTrips = Array.isArray(tripsRes) ? tripsRes : (tripsRes?.data || []);
            const pToTripMap = new Map();
            const pMetaMap   = new Map();
            incomingTrips.forEach(t => {
                (t.orders || []).forEach(o => {
                    pToTripMap.set(o.partner_id, t.trip_id);
                    pMetaMap.set(o.partner_id, {
                        trip_id:     t.trip_id,
                        stop_order:  o.stop_order,
                        total_weight: o.total_amount || 0,
                    });
                });
            });

            const features = geoRes?.features || [];
            const mapped = features.map(f => {
                const tripId = pToTripMap.get(f.properties.partner_id) || null;
                const meta   = pMetaMap.get(f.properties.partner_id);
                return {
                    id:    f.properties.partner_id,
                    lat:   f.geometry.coordinates?.[1],
                    lng:   f.geometry.coordinates?.[0],
                    label: f.properties.partner_name,
                    icon:  '🏪',
                    color: colorForTrip(tripId),
                    metadata: {
                        ...f.properties,
                        trip_id:    tripId,
                        stop_order: meta?.stop_order || null,
                        total_weight: meta?.total_weight || null,
                    },
                };
            }).filter(p =>
                typeof p.lat === 'number' && typeof p.lng === 'number'
                && Number.isFinite(p.lat) && Number.isFinite(p.lng)
            );

            setPoints(mapped);
            setRoutes([...new Set(features.map(f => f.properties.route_code).filter(Boolean))].sort());
            setTrips(incomingTrips);
        } catch (e) {
            setErr(e.message);
        } finally {
            setLoading(false);
        }
    }, [token, filters]); // KHÔNG thêm partnerToTripMap/partnerMetaMap

    useEffect(() => { if (token) loadAll(); }, [filters, token]);

    // ── Phase 3: Fetch route khi selectedTripId đổi ─────────────
    const fetchTripRoute = useCallback(async (tripId) => {
        if (!tripId) {
            setRouteGeometry(null);
            setRouteDistance(0);
            return;
        }
        setRouteLoading(true);
        try {
            const r = await apiCall('GET', `/vietmap/trips/${tripId}/route`, null, token);
            console.log(`[DispatcherMap] fetch route success: geometry=${r.geometry ? 'present' : 'null'}, distance=${r.distance_m}`);
            setRouteGeometry(r.geometry || null);
            setRouteDistance(r.distance_m || 0);
        } catch (e) {
            console.error('[DispatcherMap] fetch route failed:', e.message, 'status:', e.status, 'response:', e.response);
            setRouteGeometry(null);
        } finally {
            setRouteLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (selectedTripId) {
            fetchTripRoute(selectedTripId);
        } else {
            setRouteGeometry(null);
            setRouteDistance(0);
        }
    }, [selectedTripId, fetchTripRoute]);

    // ── Phase 2: TSP Optimization ────────────────────────────────
    const handleOptimize = async () => {
        if (!selectedTripId) { alert('Hãy chọn một chuyến xe trước.'); return; }
        if (optimizing) return;

        const trip = trips.find(t => String(t.trip_id) === String(selectedTripId));
        if (!trip) return;

        setOptimizing(true);
        setOptimizeMsg('');
        setOptimizeResult(null);
        setErr('');
        try {
            const r = await apiCall('POST', '/vietmap/optimize', { trip_id: Number(selectedTripId) }, token);
            setOptimizeResult(r);
            const savings = r.savings_m > 0 ? `Tiết kiệm ${(r.savings_m / 1000).toFixed(1)}km (${r.savings_percent}%)` : 'Đã tối ưu (không cải thiện)';
            setOptimizeMsg(`✓ Tối ưu hoàn tất. ${savings}`);
            // Refresh data
            await loadAll();
            // Refetch route với thứ tự mới
            await fetchTripRoute(selectedTripId);
        } catch (e) {
            setErr(e.message);
            setOptimizeMsg('✗ Lỗi: ' + e.message);
        } finally {
            setOptimizing(false);
            setTimeout(() => { setOptimizeMsg(''); setOptimizeResult(null); }, 8000);
        }
    };

    // ── Geocoding helpers ────────────────────────────────────────
    const loadGeocodeStatus = useCallback(async () => {
        try {
            const s = await apiCall('GET', '/admin/geocode/status', null, token);
            setPendingCount(s?.status?.pendingCount ?? 0);
            setGeocodeRunning(!!s?.status?.running);
            setGeocodeProgress(s?.progress ?? null);
        } catch (e) {
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
            const iv = setInterval(async () => {
                const cur = await apiCall('GET', '/admin/geocode/status', null, token).catch(() => null);
                if (!cur) return;
                setPendingCount(cur?.status?.pendingCount ?? 0);
                setGeocodeProgress(cur?.progress ?? null);
                setGeocodeRunning(!!cur?.status?.running);
                if (!cur?.status?.running) {
                    clearInterval(iv);
                    setGeocodeRunning(false);
                    const ok     = cur?.status?.lastOk     ?? 0;
                    const failed = cur?.status?.lastFailed ?? 0;
                    setGeocodeMsg(`✓ Hoàn tất: ${ok} OK / ${failed} failed`);
                    loadAll();
                    setTimeout(() => setGeocodeMsg(''), 6000);
                }
            }, 3000);
        } catch (e) {
            setGeocodeMsg('✗ Lỗi: ' + e.message);
            setTimeout(() => setGeocodeMsg(''), 6000);
        }
    };

    useEffect(() => {
        if (!token) return;
        loadGeocodeStatus();
        const iv = setInterval(loadGeocodeStatus, 30_000);
        return () => clearInterval(iv);
    }, [loadGeocodeStatus, token]);

    // ── Drag pin handler ───────────────────────────────────────────
    const handleLocationChange = async (point) => {
        if (!canEdit) { alert('Bạn không có quyền sửa toạ độ.'); return; }
        setSavingId(point.id);
        try {
            await apiCall('PATCH', `/partners/${point.id}/location`, {
                latitude:  point.lat,
                longitude: point.lng,
            }, token);
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

    // ── Phase 4: Assign via popup ─────────────────────────────────
    const handlePopupAssign = async () => {
        if (!popupTripId) { alert('Vui lòng chọn chuyến.'); return; }
        if (!selectedPoint) return;

        setAssignLoading(true);
        try {
            const orders = await apiCall(
                'GET',
                `/sales/orders?status=CONFIRMED&partner_id=${selectedPoint.id}&limit=1`,
                null, token,
            );
            const order = Array.isArray(orders) ? orders[0] : (orders?.data?.[0]);
            if (!order) {
                alert(`Không tìm thấy đơn CONFIRMED nào của partner #${selectedPoint.id}.`);
                return;
            }
            await apiCall('POST', `/sales/trips/${popupTripId}/orders`, { so_id: order.so_id }, token);
            // Clear selection, refresh
            setSelectedPoint(null);
            setPopupTripId('');
            await loadAll();
            if (selectedTripId) await fetchTripRoute(selectedTripId);
        } catch (e) {
            setErr(e.message);
            alert('Lỗi khi gán: ' + e.message);
        } finally {
            setAssignLoading(false);
        }
    };

    // ── Sidebar: Assign trip selected (legacy sidebar method) ──────
    const handleAssignFromSidebar = async (partnerId, tripId) => {
        if (!tripId) { alert('Vui lòng chọn chuyến.'); return; }
        try {
            const orders = await apiCall(
                'GET', `/sales/orders?status=CONFIRMED&partner_id=${partnerId}&limit=1`, null, token,
            );
            const order = Array.isArray(orders) ? orders[0] : (orders?.data?.[0]);
            if (!order) { alert(`Không tìm thấy đơn CONFIRMED nào của partner #${partnerId}.`); return; }
            await apiCall('POST', `/sales/trips/${tripId}/orders`, { so_id: order.so_id }, token);
            await loadAll();
            if (selectedTripId) await fetchTripRoute(selectedTripId);
        } catch (e) {
            setErr(e.message);
            alert('Lỗi khi gán: ' + e.message);
        }
    };

    // ── Build trip options for popup ──────────────────────────────
    const tripOptions = trips.map(t => ({ trip_id: t.trip_id, trip_number: t.trip_number }));

    // ── Route color based on selected trip ────────────────────────
    const selectedTripColor = selectedTripId
        ? colorForTrip(Number(selectedTripId))
        : '#2563EB';

    // ── Legend ────────────────────────────────────────────────────
    const routeDistKm = routeDistance > 0 ? (routeDistance / 1000).toFixed(1) : null;

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ margin: 0 }}>
                    🚚 Bản đồ điều phối — {points.length} điểm / {trips.length} chuyến đang mở
                </h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Geocode status badge */}
                    <span style={{
                        fontSize: '0.75rem',
                        color: pendingCount === 0 ? '#059669' : '#92400E',
                        background: pendingCount === 0 ? '#D1FAE5' : '#FEF3C7',
                        padding: '2px 8px', borderRadius: 12,
                    }}>
                        {geocodeRunning
                            ? `⏳ Geocode ${geocodeProgress?.current ?? 0}/${geocodeProgress?.total ?? (pendingCount || '?')}`
                            : pendingCount === 0
                                ? '✓ Toạ độ đầy đủ'
                                : `⚠️ ${pendingCount} ASO thiếu toạ độ`
                        }
                    </span>
                    {canAdmin && pendingCount > 0 && (
                        <button className="btn btn-sm" onClick={handleGeocodeRefresh} disabled={geocodeRunning}
                            style={{ background: geocodeRunning ? '#FCD34D' : '#F59E0B', color: '#fff', border: 'none', cursor: geocodeRunning ? 'wait' : 'pointer' }}>
                            {geocodeRunning ? '⏳ Đang chạy...' : `🛰️ Geocode ${pendingCount} ASO`}
                        </button>
                    )}
                    <button className="btn btn-outline btn-sm" onClick={loadAll} disabled={loading}>
                        {loading ? '⏳ Đang tải...' : '🔄 Làm mới'}
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => setForceRenderKey(k => k + 1)} title="Force re-render markers">
                        🎯 Hiện markers
                    </button>
                </div>
            </div>

            {/* Messages */}
            {geocodeMsg && (
                <div style={{ background: geocodeMsg.startsWith('✓') ? '#D1FAE5' : geocodeMsg.startsWith('✗') ? '#FEE2E2' : '#FEF3C7', color: '#1F2937', padding: 8, borderRadius: 4, marginBottom: 8, fontSize: '0.85rem' }}>
                    {geocodeMsg}
                </div>
            )}
            {optimizeMsg && (
                <div style={{ background: optimizeMsg.startsWith('✓') ? '#D1FAE5' : '#FEE2E2', color: '#1F2937', padding: 8, borderRadius: 4, marginBottom: 8, fontSize: '0.85rem' }}>
                    {optimizeMsg}
                </div>
            )}
            {err && (
                <div style={{ background: '#FEE2E2', color: '#B91C1C', padding: 8, borderRadius: 4, marginBottom: 12 }}>
                    ⚠️ {err}
                </div>
            )}
            {!canEdit && (
                <div style={{ background: '#FEF3C7', color: '#92400E', padding: 8, borderRadius: 4, marginBottom: 12, fontSize: '0.85rem' }}>
                    ℹ️ Bạn đang xem ở chế độ chỉ-đọc.
                </div>
            )}

            {/* Route action bar */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                <select
                    className="input"
                    value={selectedTripId}
                    onChange={e => { setSelectedTripId(e.target.value); setOptimizeResult(null); }}
                    style={{ maxWidth: 220 }}
                >
                    <option value="">— Chọn chuyến để xem lộ trình —</option>
                    {trips.map(t => (
                        <option key={t.trip_id} value={t.trip_id}>
                            {t.trip_number} ({t.total_orders || 0} đơn)
                        </option>
                    ))}
                </select>
                {selectedTripId && canEdit && (
                    <button
                        className="btn btn-sm"
                        onClick={handleOptimize}
                        disabled={optimizing || routeLoading}
                        style={{ background: optimizing ? '#93C5FD' : '#7C3AED', color: '#fff', border: 'none' }}
                    >
                        {optimizing ? '⏳ Đang tối ưu...' : '🗺️ Tối ưu lộ trình (TSP)'}
                    </button>
                )}
                {routeLoading && (
                    <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>⏳ Đang tải lộ trình...</span>
                )}
                {routeDistKm && !routeLoading && (
                    <span style={{ fontSize: '0.8rem', color: '#374151', background: '#F3F4F6', padding: '2px 8px', borderRadius: 4 }}>
                        📏 ~{routeDistKm} km
                    </span>
                )}
                {selectedTripId && (
                    <button
                        className="btn btn-outline btn-sm"
                        onClick={() => {
                            // Fly to trip orders
                            const trip = trips.find(t => String(t.trip_id) === String(selectedTripId));
                            if (trip?.orders?.length > 0) {
                                // Re-center map — no-op for now, map auto-fits
                            }
                        }}
                        title="Xem chi tiết chuyến"
                        style={{ fontSize: '0.8rem' }}
                    >
                        🔍 Chi tiết chuyến
                    </button>
                )}
            </div>

            {/* Route legend */}
            {routeGeometry && !routeLoading && (
                <div style={{ display: 'flex', gap: 16, fontSize: '0.75rem', color: '#374151', marginBottom: 8, flexWrap: 'wrap' }}>
                    <span>
                        <span style={{ display: 'inline-block', width: 20, height: 3, background: selectedTripColor, borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }}></span>
                        Lộ trình kế hoạch ({routeDistKm}km)
                    </span>
                    <span style={{ color: '#6B7280' }}>
                        Click pin → popup → Gán đơn
                    </span>
                    <span style={{ color: '#6B7280' }}>
                        Pin số = thứ tự giao
                    </span>
                </div>
            )}

            {/* Layout 2 cột: map + side panel */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 12 }}>
                {/* Map */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <VietmapMap
                        points={filteredPoints}
                        height="650px"
                        fitBounds={true}
                        boundsKey={selectedTripId}
                        draggable={canEdit}
                        onPointClick={setSelectedPoint}
                        onLocationChange={handleLocationChange}
                        // Phase 3: Route Line
                        routeGeometry={routeGeometry}
                        routeColor={selectedTripColor}
                        routeWidth={3}
                        routeOpacity={0.8}
                        // Phase 4: Popup
                        selectedPoint={selectedPoint}
                        tripOptions={tripOptions}
                        selectedTripIdForAssign={popupTripId}
                        onSelectTripForAssign={setPopupTripId}
                        onConfirmAssign={handlePopupAssign}
                        assignLoading={assignLoading}
                        // Force-render fallback
                        forceRender={forceRenderKey}
                        onMapReady={(map) => {
                            if (map && filteredPoints.length > 0) {
                                // Double-ensure markers are rendered on map ready
                                setTimeout(() => {
                                    if (!map.isRemoved?.()) {
                                        // Force a re-render of markers
                                        setForceRenderKey(k => k + 1);
                                    }
                                }, 100);
                            }
                        }}
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
                        <div className="card-header"><h4 style={{ margin: 0, fontSize: '0.95rem' }}>🔍 Lọc & Tìm kiếm</h4></div>
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <input
                                type="text"
                                className="input"
                                placeholder="🔎 Tìm tên / mã ASO..."
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                                style={{ fontSize: '0.85rem' }}
                            />
                            <select className="input" value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}>
                                <option value="">— Tất cả loại —</option>
                                {PARTNER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <select className="input" value={filters.routeCode} onChange={e => setFilters(f => ({ ...f, routeCode: e.target.value }))}>
                                <option value="">— Tất cả tuyến —</option>
                                {routes.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <select
                                className="input"
                                value={filters.geoConfidence}
                                onChange={e => setFilters(f => ({ ...f, geoConfidence: e.target.value }))}
                                style={{ fontSize: '0.85rem' }}
                            >
                                <option value="">— Tất cả tọa độ —</option>
                                <option value="HIGH">✓ Chỉ tọa độ tốt (HIGH / MANUAL)</option>
                                <option value="MEDIUM">○ Tọa độ trung bình (MEDIUM)</option>
                                <option value="LOW">⚠️ Tọa độ yếu (LOW)</option>
                                <option value="NONE">❌ Chưa có tọa độ</option>
                            </select>
                            {(searchText || filters.geoConfidence) && (
                                <button
                                    className="btn btn-outline btn-sm"
                                    onClick={() => { setSearchText(''); setFilters(f => ({ ...f, geoConfidence: '' })); }}
                                    style={{ fontSize: '0.8rem' }}
                                >
                                    ✕ Xóa bộ lọc
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Trips list */}
                    <div className="card" style={{ marginBottom: 12 }}>
                        <div className="card-header">
                            <h4 style={{ margin: 0, fontSize: '0.95rem' }}>🚚 Chuyến đang mở ({trips.length})</h4>
                        </div>
                        <div className="card-body" style={{ maxHeight: 260, overflowY: 'auto' }}>
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
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t.trip_number}</div>
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

                    {/* Selected point detail (sidebar fallback) */}
                    {selectedPoint && (
                        <div className="card" style={{ borderLeft: `4px solid ${selectedPoint.color}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>
                                    🏪 {selectedPoint.metadata.partner_name || `Partner #${selectedPoint.id}`}
                                </h4>
                                <button className="btn btn-outline btn-sm" onClick={() => { setSelectedPoint(null); setPopupTripId(''); }}>✕</button>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#6B7280', marginTop: 4 }}>
                                #{selectedPoint.id} · {selectedPoint.metadata.partner_type}
                            </div>
                            {selectedPoint.metadata.stop_order && (
                                <div style={{ fontSize: '0.8rem', color: '#7C3AED', fontWeight: 600, marginTop: 4 }}>
                                    🔢 Stop #{selectedPoint.metadata.stop_order}
                                </div>
                            )}
                            {selectedPoint.metadata.total_weight && (
                                <div style={{ fontSize: '0.8rem', marginTop: 4 }}>
                                    📦 {Number(selectedPoint.metadata.total_weight).toLocaleString('vi-VN')} đ
                                </div>
                            )}
                            <div style={{ fontSize: '0.8rem', marginTop: 6 }}>
                                📍 {selectedPoint.metadata.address_line || '—'}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#6B7280', marginTop: 4 }}>
                                Toạ độ: {selectedPoint.lat.toFixed(6)}, {selectedPoint.lng.toFixed(6)}
                            </div>

                            {/* Sidebar assign (backup cho popup) */}
                            <div style={{ marginTop: 10, borderTop: '1px solid #E5E7EB', paddingTop: 8 }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Gán vào chuyến (sidebar):</label>
                                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                    <select
                                        className="input"
                                        value={selectedTripId}
                                        onChange={e => setSelectedTripId(e.target.value)}
                                        style={{ flex: 1, fontSize: '0.85rem' }}
                                    >
                                        <option value="">— Chọn chuyến —</option>
                                        {trips.map(t => (
                                            <option key={t.trip_id} value={t.trip_id}>{t.trip_number}</option>
                                        ))}
                                    </select>
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={() => handleAssignFromSidebar(selectedPoint.id, selectedTripId)}
                                        disabled={!selectedTripId}
                                    >
                                        ➕ Gán
                                    </button>
                                </div>
                                {selectedPoint.metadata.trip_id && (
                                    <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#2563EB' }}>
                                        ✓ Thuộc chuyến #{selectedPoint.metadata.trip_id}
                                    </div>
                                )}
                                <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#2563EB' }}>
                                    💡 Tip: Click trực tiếp vào pin trên bản đồ để mở popup gán nhanh
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
