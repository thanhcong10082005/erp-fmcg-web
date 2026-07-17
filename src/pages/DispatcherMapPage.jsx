/**
 * DispatcherMapPage — Bản đồ điều phối (v12).
 *
 * Features v11:
 *   Phase 3: Route Line Visualization — vẽ LineString khi chọn trip
 *   Phase 4: Gán đơn qua Popup — click pin → popup → dropdown → Gán
 *   Phase 5: Data-rich Pins — stop_order số + scale theo weight
 *   Phase 2 (backend): "Tối ưu lộ trình" — TSP button
 *
 * Features v12:
 *   Phase H: Audit Map được gộp vào — dùng tab/toggle để chuyển chế độ
 *   Phase L: "Gom chuyến" — vẽ vùng chọn hình chữ nhật, batch gán đơn
 */

// ─── Batch selection helpers ─────────────────────────────────
function pointInBounds(lat, lng, bounds) {
    if (!bounds) return false;
    return lat >= bounds.minLat && lat <= bounds.maxLat
        && lng >= bounds.minLng && lng <= bounds.maxLng;
}

import React, { useState, useEffect, useCallback, useRef } from 'react';
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

// ─── Audit Map helpers ───────────────────────────────────────
const PLAN_COLOR = '#2563EB';
const ACTUAL_COLOR = '#EF4444';

function haversineDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
        * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export default function DispatcherMapPage({ token, userRole }) {
    // ── Mode toggle: 'dispatch' | 'audit' ─────────────────────
    const [mapMode, setMapMode] = useState('dispatch');

    // ── Dispatch mode state ────────────────────────────────────
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
    const [forceRenderKey, setForceRenderKey] = useState(0);

    // Geocoding state
    const [pendingCount, setPendingCount]   = useState(0);
    const [geocodeRunning, setGeocodeRunning] = useState(false);
    const [geocodeProgress, setGeocodeProgress] = useState(null);
    const [geocodeMsg, setGeocodeMsg]       = useState('');

    // Route geometry
    const [routeGeometry, setRouteGeometry]   = useState(null);
    const [routeDistance, setRouteDistance]  = useState(0);
    const [routeLoading, setRouteLoading]   = useState(false);
    const [tripOrders, setTripOrders]         = useState([]);

    // TSP optimization
    const [optimizing, setOptimizing]       = useState(false);
    const [optimizeResult, setOptimizeResult] = useState(null);
    const [optimizeMsg, setOptimizeMsg]     = useState('');

    // Popup assign state
    const [popupTripId, setPopupTripId]    = useState('');
    const [assignLoading, setAssignLoading] = useState(false);

    // ── "Gom chuyến" (Batch Assignment) state ───────────────────
    const [batchMode, setBatchMode]           = useState(false);    // đang ở chế độ vẽ vùng
    const [batchDrawing, setBatchDrawing]      = useState(false);    // đang kéo vẽ
    const [batchRect, setBatchRect]            = useState(null);     // { startX, startY, endX, endY } (pixel coords)
    const [batchBounds, setBatchBounds]        = useState(null);     // { minLat, maxLat, minLng, maxLng } (lat/lng)
    const [batchSelected, setBatchSelected]    = useState([]);       // danh sách partner đã chọn trong vùng
    const [batchCreating, setBatchCreating]   = useState(false);    // đang tạo chuyến
    const batchMapRef = useRef(null);                               // ref đến map container cho drawing

    // ── Audit mode state ──────────────────────────────────────
    const [auditTrips, setAuditTrips]           = useState([]);
    const [auditTripId, setAuditTripId]         = useState('');
    const [auditData, setAuditData]             = useState(null);
    const [auditLoading, setAuditLoading]       = useState(false);
    const [auditMapReady, setAuditMapReady]     = useState(false);
    const auditMapRef = useRef(null);

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
        // Build set of partner_ids trong trip đang chọn (nếu có)
        const tripPartnerIds = new Set();
        if (selectedTripId && tripOrders.length > 0) {
            tripOrders.forEach((o) => {
                const pid = String(o.partner_id);
                if (pid) tripPartnerIds.add(pid);
            });
        }
        return points.filter(p => {
            // Trip filter: khi có trip được chọn, hiển thị partners trong tripOrders
            if (selectedTripId) {
                // p.id là partner_id sau transform, hoặc dùng metadata
                const pid = String(p.id || (p.metadata && p.metadata.partner_id) || '');
                if (tripPartnerIds.size > 0) {
                    if (!tripPartnerIds.has(pid)) return false;
                } else {
                    // Fallback: dùng metadata.trip_id
                    if (String((p.metadata && p.metadata.trip_id) || '') !== String(selectedTripId)) return false;
                }
            }
            // Search filter
            if (q) {
                const name  = (p.metadata && p.metadata.partner_name) || '';
                const code  = (p.metadata && p.metadata.partner_code) || '';
                const route = (p.metadata && p.metadata.route_code)  || '';
                if (!name.toLowerCase().includes(q) && !code.toLowerCase().includes(q) && !route.toLowerCase().includes(q)) return false;
            }
            // Confidence filter
            if (filters.geoConfidence) {
                const conf = p.metadata && p.metadata.geocoding_confidence;
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
    }, [points, searchText, filters.geoConfidence, selectedTripId, tripOrders]);

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
            console.log(`[DispatcherMap] fetch route success: geometry=${r.geometry ? 'present' : 'null'}, distance=${r.distance_m}, orders=${r.orders?.length || 0}`);
            setRouteGeometry(r.geometry || null);
            setRouteDistance(r.distance_m || 0);
            // Cập nhật tripOrders cho trip đang chọn - dùng để filter markers
            if (r.orders && Array.isArray(r.orders)) {
                setTripOrders(r.orders);
            }
        } catch (e) {
            console.error('[DispatcherMap] fetch route failed:', e.message, 'status:', e.status, 'response:', e.response);
            setRouteGeometry(null);
            setTripOrders([]);
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
            setTripOrders([]);
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

    // ── Phase L: Gom chuyến (Batch Assignment) ────────────────────

    /** Bắt đầu chế độ vẽ vùng chọn */
    const handleStartBatchMode = () => {
        setBatchMode(true);
        setBatchDrawing(false);
        setBatchRect(null);
        setBatchBounds(null);
        setBatchSelected([]);
    };

    /** Hủy chế độ vẽ */
    const handleCancelBatchMode = () => {
        setBatchMode(false);
        setBatchDrawing(false);
        setBatchRect(null);
        setBatchBounds(null);
        setBatchSelected([]);
    };

    /** Chuyển pixel coords → lat/lng bounds dùng map.unproject */
    const pixelToBounds = (map, rect) => {
        if (!map || !rect) return null;
        const { startX, startY, endX, endY } = rect;
        const sw = map.unproject([Math.min(startX, endX), Math.max(startY, endY)]);
        const ne = map.unproject([Math.max(startX, endX), Math.min(startY, endY)]);
        return {
            minLat: sw.lat,
            maxLat: ne.lat,
            minLng: sw.lng,
            maxLng: ne.lng,
        };
    };

    /** Tính danh sách partner trong vùng chọn */
    const getPointsInBounds = useCallback((bounds) => {
        return points.filter(p => pointInBounds(p.lat, p.lng, bounds));
    }, [points]);

    /** Khi hoàn thành vẽ → lấy danh sách partners trong vùng */
    const handleBatchDrawComplete = useCallback((map) => {
        if (!batchRect || !map) return;
        const bounds = pixelToBounds(map, batchRect);
        setBatchBounds(bounds);
        setBatchDrawing(false);
        const inBounds = getPointsInBounds(bounds);
        setBatchSelected(inBounds);
    }, [batchRect, getPointsInBounds]);

    /** Toggle chọn/bỏ 1 partner khỏi batch */
    const toggleBatchPartner = (partnerId) => {
        setBatchSelected(prev => {
            const idx = prev.findIndex(p => String(p.id) === String(partnerId));
            if (idx >= 0) {
                return prev.filter(p => String(p.id) !== String(partnerId));
            } else {
                const pt = points.find(p => String(p.id) === String(partnerId));
                return pt ? [...prev, pt] : prev;
            }
        });
    };

    /** Tạo chuyến và gán tất cả partners đã chọn */
    const handleBatchCreateTrip = async () => {
        if (batchSelected.length === 0) { alert('Chưa chọn khách hàng nào.'); return; }
        setBatchCreating(true);
        setErr('');
        try {
            // 1. Tạo chuyến mới (lấy ngày hôm nay, warehouse mặc định)
            const tripData = {
                trip_date: new Date().toISOString().split('T')[0],
                warehouse_id: 1,
            };
            const trip = await apiCall('POST', '/sales/trips', tripData, token);
            // 2. Gán từng partner: tìm đơn CONFIRMED và gán vào chuyến
            let assigned = 0, skipped = 0;
            for (const partner of batchSelected) {
                try {
                    const orders = await apiCall(
                        'GET', `/sales/orders?status=CONFIRMED&partner_id=${partner.id}&limit=1`, null, token,
                    );
                    const order = Array.isArray(orders) ? orders[0] : (orders?.data?.[0]);
                    if (order) {
                        await apiCall('POST', `/sales/trips/${trip.trip_id}/orders`, { so_id: order.so_id }, token);
                        assigned++;
                    } else {
                        skipped++;
                    }
                } catch {
                    skipped++;
                }
            }
            // 3. Refresh + thông báo
            await loadAll();
            alert(`✅ Đã tạo chuyến ${trip.trip_number} và gán ${assigned} đơn.${skipped > 0 ? `\n⚠️ ${skipped} khách hàng chưa có đơn CONFIRMED.` : ''}`);
            handleCancelBatchMode();
            setSelectedTripId(String(trip.trip_id));
        } catch (e) {
            setErr(e.message);
            alert('Lỗi khi tạo chuyến: ' + e.message);
        } finally {
            setBatchCreating(false);
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
                    🗺️ Bản đồ điều phối
                </h3>
                {/* Mode tabs */}
                <div style={{ display: 'flex', gap: 4 }}>
                    <button
                        onClick={() => setMapMode('dispatch')}
                        style={{
                            padding: '6px 16px',
                            border: 'none',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            background: mapMode === 'dispatch' ? '#3B82F6' : '#E5E7EB',
                            color: mapMode === 'dispatch' ? '#fff' : '#374151',
                            transition: 'all 0.2s',
                        }}
                    >
                        🗺️ Điều phối
                    </button>
                    <button
                        onClick={() => setMapMode('audit')}
                        style={{
                            padding: '6px 16px',
                            border: 'none',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            background: mapMode === 'audit' ? '#8B5CF6' : '#E5E7EB',
                            color: mapMode === 'audit' ? '#fff' : '#374151',
                            transition: 'all 0.2s',
                        }}
                    >
                        🔍 Audit
                    </button>
                </div>
            </div>

            {/* ── DISPATCH MODE ── */}
            {mapMode === 'dispatch' && (
            <div>
                {/* Geocode status + actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
                        <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                            {points.length} điểm / {trips.length} chuyến đang mở
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
                        {canEdit && (
                            <button
                                className="btn btn-sm"
                                onClick={batchMode ? handleCancelBatchMode : handleStartBatchMode}
                                style={{
                                    background: batchMode ? '#DC2626' : '#059669',
                                    color: '#fff', border: 'none',
                                }}
                            >
                                {batchMode ? '✕ Hủy' : '📦 Gom chuyến'}
                            </button>
                        )}
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
                        boundsKey={selectedTripId ? `${selectedTripId}-${tripOrders.length}` : undefined}
                        draggable={canEdit}
                        onPointClick={batchMode ? null : setSelectedPoint}
                        onLocationChange={handleLocationChange}
                        // Phase 3: Route Line
                        routeGeometry={routeGeometry}
                        routeColor={selectedTripColor}
                        routeWidth={3}
                        routeOpacity={0.8}
                        // Phase 4: Popup
                        selectedPoint={batchMode ? null : selectedPoint}
                        tripOptions={tripOptions}
                        selectedTripIdForAssign={popupTripId}
                        onSelectTripForAssign={setPopupTripId}
                        onConfirmAssign={handlePopupAssign}
                        assignLoading={assignLoading}
                        // Phase L: Batch selection
                        batchMode={batchMode}
                        batchRect={batchRect}
                        onBatchRectChange={setBatchRect}
                        onBatchDrawComplete={handleBatchDrawComplete}
                        onMapReady={(map) => {
                            batchMapRef.current = map;
                            if (map && filteredPoints.length > 0) {
                                setTimeout(() => {
                                    if (!map.isRemoved?.()) {
                                        setForceRenderKey(k => k + 1);
                                    }
                                }, 100);
                            }
                        }}
                        // Force-render fallback
                        forceRender={forceRenderKey}
                    />
                    {savingId && (
                        <div style={{ padding: 8, fontSize: '0.8rem', color: '#6B7280', background: '#F3F4F6' }}>
                            ⏳ Đang lưu toạ độ partner #{savingId}...
                        </div>
                    )}
                </div>

                {/* Side panel */}
                <div>
                    {/* Phase L: Batch Selection Panel */}
                    {batchMode && (
                        <div className="card" style={{ marginBottom: 12, border: '2px solid #059669', background: '#F0FDF4' }}>
                            <div className="card-header">
                                <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#065F46' }}>
                                    📦 Gom chuyến - Vùng đã chọn
                                </h4>
                            </div>
                            <div className="card-body">
                                {batchSelected.length === 0 && !batchDrawing && (
                                    <div style={{ textAlign: 'center', padding: '16px 0', color: '#6B7280', fontSize: '0.85rem' }}>
                                        <div style={{ fontSize: '2rem', marginBottom: 8 }}>⬜</div>
                                        {batchBounds
                                            ? 'Không có khách hàng trong vùng này. Thử vẽ lại.'
                                            : 'Kéo chuột trên bản đồ để chọn vùng chứa khách hàng cần gom.'
                                        }
                                    </div>
                                )}
                                {batchSelected.length > 0 && (
                                    <>
                                        <div style={{ marginBottom: 8, fontSize: '0.85rem', color: '#065F46' }}>
                                            <strong>{batchSelected.length}</strong> khách hàng trong vùng:
                                        </div>
                                        <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
                                            {batchSelected.map(p => {
                                                const pid = String(p.id);
                                                return (
                                                    <div key={pid} style={{
                                                        display: 'flex', alignItems: 'center', gap: 8,
                                                        padding: '4px 0', borderBottom: '1px solid #D1FAE5', fontSize: '0.8rem',
                                                    }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={true}
                                                            onChange={() => toggleBatchPartner(pid)}
                                                        />
                                                        <span style={{ flex: 1 }}>{p.label}</span>
                                                        <span style={{ color: '#6B7280', fontSize: '0.75rem' }}>
                                                            #{pid}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button
                                                className="btn btn-sm"
                                                onClick={handleBatchCreateTrip}
                                                disabled={batchCreating || batchSelected.length === 0}
                                                style={{ background: '#059669', color: '#fff', border: 'none', flex: 1 }}
                                            >
                                                {batchCreating ? '⏳ Đang tạo...' : `✅ Tạo chuyến (${batchSelected.length})`}
                                            </button>
                                            <button
                                                className="btn btn-outline btn-sm"
                                                onClick={handleCancelBatchMode}
                                            >
                                                Hủy
                                            </button>
                                        </div>
                                        <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#6B7280' }}>
                                            * Gán đơn CONFIRMED của từng khách vào chuyến mới
                                        </div>
                                    </>
                                )}
                                {batchDrawing && (
                                    <div style={{ textAlign: 'center', padding: 8, color: '#059669', fontSize: '0.85rem' }}>
                                        ⬛ Đang kéo... thả chuột để hoàn thành vùng chọn
                                    </div>
                                )}
                                {!batchDrawing && batchSelected.length === 0 && (
                                    <button
                                        className="btn btn-outline btn-sm"
                                        onClick={handleCancelBatchMode}
                                        style={{ width: '100%' }}
                                    >
                                        ← Quay lại
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

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
            )}

            {/* ── AUDIT MODE ── */}
            {mapMode === 'audit' && (
            <AuditMode
                token={token}
                auditTrips={auditTrips}
                setAuditTrips={setAuditTrips}
                auditTripId={auditTripId}
                setAuditTripId={setAuditTripId}
                auditData={auditData}
                setAuditData={setAuditData}
                auditLoading={auditLoading}
                setAuditLoading={setAuditLoading}
                auditMapReady={auditMapReady}
                setAuditMapReady={setAuditMapReady}
                auditMapRef={auditMapRef}
            />
            )}
        </div>
    );
}

// ── Audit Mode Component ──────────────────────────────────────
function AuditMode({ token, auditTrips, setAuditTrips, auditTripId, setAuditTripId, auditData, setAuditData, auditLoading, setAuditLoading, auditMapReady, setAuditMapReady, auditMapRef }) {

    // Load completed trips
    useEffect(() => {
        if (!token) return;
        setAuditLoading(true);
        apiCall('GET', '/sales/trips?status=COMPLETED,PARTIAL_DELIVERED', null, token)
            .then(data => {
                const list = Array.isArray(data) ? data : (data?.data || []);
                setAuditTrips(list);
            })
            .catch(() => setAuditTrips([]))
            .finally(() => setAuditLoading(false));
    }, [token]);

    // Load audit data
    const loadAudit = useCallback(async (tripId) => {
        if (!tripId) { setAuditData(null); return; }
        setAuditLoading(true);
        try {
            const [tripFullRes, routeRes] = await Promise.all([
                apiCall('GET', `/sales/trips/${tripId}/full`, null, token),
                apiCall('GET', `/vietmap/trips/${tripId}/route`, null, token),
            ]);
            const orders = tripFullRes?.orders || [];
            const planGeometry = routeRes?.geometry || null;

            const podPoints = orders
                .filter(o =>
                    o.delivery_latitude != null && o.delivery_longitude != null
                    && Number.isFinite(Number(o.delivery_latitude))
                    && Number.isFinite(Number(o.delivery_longitude))
                )
                .map(o => {
                    const planLat = Number(o.partner_latitude);
                    const planLng = Number(o.partner_longitude);
                    const actualLat = Number(o.delivery_latitude);
                    const actualLng = Number(o.delivery_longitude);
                    const deviation = haversineDistance(planLat, planLng, actualLat, actualLng);
                    return {
                        partner_id: o.partner_id,
                        partner_name: o.partner_name,
                        stop_order: o.stop_order,
                        plan_lat: isNaN(planLat) ? null : planLat,
                        plan_lng: isNaN(planLng) ? null : planLng,
                        actual_lat: actualLat,
                        actual_lng: actualLng,
                        delivery_status: o.pod_delivery_status || o.delivery_status || null,
                        pod_id: o.pod_id || null,
                        deviation_m: (o.partner_latitude && o.partner_longitude) ? deviation : 0,
                    };
                });

            const deviations = podPoints.map(p => p.deviation_m).filter(d => d > 0);
            const avgDeviation = deviations.length ? Math.round(deviations.reduce((a, b) => a + b, 0) / deviations.length) : 0;
            const maxDeviation = deviations.length ? Math.max(...deviations) : 0;
            const overdueCount = deviations.filter(d => d > 500).length;

            setAuditData({
                trip: tripFullRes,
                plan_geometry: planGeometry,
                plan_distance_m: routeRes?.distance_m || 0,
                pod_points: podPoints,
                stats: { total_stops: podPoints.length, avg_deviation_m: avgDeviation, max_deviation_m: maxDeviation, overdue_stops: overdueCount },
            });
        } catch (e) {
            setAuditData(null);
        } finally {
            setAuditLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (auditTripId) loadAudit(auditTripId);
        else setAuditData(null);
    }, [auditTripId, loadAudit]);

    // Build map points
    const planPoints = auditData
        ? auditData.pod_points.map(p => ({
            id: `plan-${p.partner_id}`,
            lat: p.plan_lat ?? p.actual_lat,
            lng: p.plan_lng ?? p.actual_lng,
            label: `${p.stop_order}. ${p.partner_name}`,
            color: PLAN_COLOR,
            metadata: { ...p },
        }))
        : [];

    const actualDotsGeoJSON = auditData
        ? {
            type: 'FeatureCollection',
            features: auditData.pod_points.map(p => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [p.actual_lng, p.actual_lat] },
                properties: { partner_id: p.partner_id, partner_name: p.partner_name, stop_order: p.stop_order, deviation_m: p.deviation_m, delivery_status: p.delivery_status },
            })),
          }
        : null;

    const stats = auditData?.stats;
    const planDistKm = auditData?.plan_distance_m ? (auditData.plan_distance_m / 1000).toFixed(1) : null;

    return (
        <div>
            {/* Trip selector */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                <select className="input" value={auditTripId} onChange={e => setAuditTripId(e.target.value)} style={{ maxWidth: 320 }} disabled={auditLoading}>
                    <option value="">— Chọn chuyến đã hoàn thành —</option>
                    {auditTrips.map(t => (
                        <option key={t.trip_id} value={t.trip_id}>{t.trip_number} — {t.driver_name || '—'} — {t.status}</option>
                    ))}
                </select>
                {auditLoading && <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>⏳ Đang tải...</span>}
            </div>

            {/* Stats */}
            {stats && (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, padding: '10px 14px', marginBottom: 12, fontSize: '0.85rem' }}>
                    <div><span style={{ color: '#6B7280' }}>Tổng điểm dừng: </span><strong>{stats.total_stops}</strong></div>
                    {planDistKm && <div><span style={{ color: '#6B7280' }}>Lộ trình kế hoạch: </span><strong>{planDistKm} km</strong></div>}
                    <div><span style={{ color: '#6B7280' }}>Độ lệch TB: </span><strong style={{ color: stats.avg_deviation_m > 200 ? '#DC2626' : '#059669' }}>{stats.avg_deviation_m} m</strong></div>
                    <div><span style={{ color: '#6B7280' }}>Độ lệch MAX: </span><strong style={{ color: stats.max_deviation_m > 500 ? '#DC2626' : '#92400E' }}>{stats.max_deviation_m} m</strong></div>
                    {stats.overdue_stops > 0 && <div><span style={{ color: '#DC2626' }}>⚠️ Lệch &gt;500m: </span><strong style={{ color: '#DC2626' }}>{stats.overdue_stops}</strong></div>}
                </div>
            )}

            {/* Legend */}
            {auditData && (
                <div style={{ display: 'flex', gap: 20, fontSize: '0.8rem', color: '#374151', marginBottom: 8, flexWrap: 'wrap' }}>
                    <span><span style={{ display: 'inline-block', width: 20, height: 3, background: PLAN_COLOR, borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }}></span>Lộ trình kế hoạch</span>
                    <span><span style={{ display: 'inline-block', width: 10, height: 10, background: ACTUAL_COLOR, borderRadius: '50%', border: '2px solid #fff', verticalAlign: 'middle', marginRight: 4 }}></span>Vị trí thực tế POD</span>
                </div>
            )}

            {/* Map + Table */}
            {auditData && planPoints.length > 0 && (
                <div>
                    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
                        <AuditMapEmbed
                            planPoints={planPoints}
                            actualDotsGeoJSON={actualDotsGeoJSON}
                            planGeometry={auditData.plan_geometry}
                            onMapReady={(map) => { auditMapRef.current = map; setAuditMapReady(true); }}
                        />
                    </div>

                    {/* POD Table */}
                    <div className="card">
                        <div className="card-header"><h4 style={{ margin: 0, fontSize: '0.95rem' }}>📋 Chi tiết từng điểm dừng</h4></div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                                        <th style={{ padding: '6px 10px', textAlign: 'left' }}>#</th>
                                        <th style={{ padding: '6px 10px', textAlign: 'left' }}>Khách hàng</th>
                                        <th style={{ padding: '6px 10px', textAlign: 'right' }}>Plan Lat</th>
                                        <th style={{ padding: '6px 10px', textAlign: 'right' }}>Plan Lng</th>
                                        <th style={{ padding: '6px 10px', textAlign: 'right' }}>Actual Lat</th>
                                        <th style={{ padding: '6px 10px', textAlign: 'right' }}>Actual Lng</th>
                                        <th style={{ padding: '6px 10px', textAlign: 'right' }}>Độ lệch</th>
                                        <th style={{ padding: '6px 10px', textAlign: 'left' }}>Trạng thái</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditData.pod_points.map(p => (
                                        <tr key={p.partner_id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                            <td style={{ padding: '5px 10px', fontWeight: 600 }}>{p.stop_order}</td>
                                            <td style={{ padding: '5px 10px' }}>{p.partner_name}</td>
                                            <td style={{ padding: '5px 10px', textAlign: 'right', color: '#6B7280' }}>{p.plan_lat ? p.plan_lat.toFixed(5) : '—'}</td>
                                            <td style={{ padding: '5px 10px', textAlign: 'right', color: '#6B7280' }}>{p.plan_lng ? p.plan_lng.toFixed(5) : '—'}</td>
                                            <td style={{ padding: '5px 10px', textAlign: 'right' }}>{p.actual_lat.toFixed(5)}</td>
                                            <td style={{ padding: '5px 10px', textAlign: 'right' }}>{p.actual_lng.toFixed(5)}</td>
                                            <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: p.deviation_m > 500 ? 700 : 400, color: p.deviation_m > 500 ? '#DC2626' : p.deviation_m > 200 ? '#D97706' : '#059669' }}>
                                                {p.deviation_m > 0 ? `${p.deviation_m} m` : '—'}
                                            </td>
                                            <td style={{ padding: '5px 10px' }}>
                                                <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: 10, background: p.delivery_status === 'DELIVERED' ? '#D1FAE5' : '#FEE2E2', color: p.delivery_status === 'DELIVERED' ? '#065F46' : '#991B1B' }}>
                                                    {p.delivery_status || 'N/A'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {!auditTripId && !auditLoading && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF', fontSize: '0.9rem' }}>
                    Chọn một chuyến xe đã hoàn thành để xem so sánh lộ trình kế hoạch và thực tế.
                </div>
            )}
        </div>
    );
}

// ── Audit Map Embed (inner map với actual dots) ──────────────
function AuditMapEmbed({ planPoints, actualDotsGeoJSON, planGeometry, onMapReady }) {
    const [mapReady, setMapReady] = useState(false);

    function handleMapReady(map) {
        setMapReady(true);
        onMapReady && onMapReady(map);
    }

    // Add actual dots layer
    useEffect(() => {
        if (!mapReady || !auditMapRef?.current || !actualDotsGeoJSON) return;
        const map = auditMapRef.current;
        const vietmap = window.vietmapgl;
        if (!vietmap) return;

        if (map.getLayer('audit-actual-dots-layer'))  map.removeLayer('audit-actual-dots-layer');
        if (map.getSource('audit-actual-dots'))       map.removeSource('audit-actual-dots');

        map.addSource('audit-actual-dots', { type: 'geojson', data: actualDotsGeoJSON });
        map.addLayer({
            id: 'audit-actual-dots-layer',
            type: 'circle',
            source: 'audit-actual-dots',
            paint: { 'circle-radius': 7, 'circle-color': ACTUAL_COLOR, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2, 'circle-opacity': 0.9 },
        });

        map.on('click', 'audit-actual-dots-layer', (e) => {
            const props = e.features?.[0]?.properties;
            if (!props) return;
            const coords = e.features[0].geometry.coordinates.slice();
            new vietmap.Popup({ offset: 20 })
                .setLngLat(coords)
                .setHTML(`<div style="font-family:sans-serif;font-size:13px;min-width:180px;"><strong>${props.stop_order}. ${props.partner_name}</strong><br/><span style="color:#EF4444;">● Vị trí thực tế POD</span><br/>Độ lệch: <strong>${props.deviation_m} m</strong><br/>Trạng thái: ${props.delivery_status || 'N/A'}</div>`)
                .addTo(map);
        });
        map.on('mouseenter', 'audit-actual-dots-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'audit-actual-dots-layer', () => { map.getCanvas().style.cursor = ''; });

        return () => {
            if (map.getLayer('audit-actual-dots-layer')) map.removeLayer('audit-actual-dots-layer');
            if (map.getSource('audit-actual-dots')) map.removeSource('audit-actual-dots');
        };
    }, [mapReady, actualDotsGeoJSON]);

    return (
        <VietmapMap
            points={planPoints}
            height="500px"
            fitBounds={true}
            draggable={false}
            routeGeometry={planGeometry}
            routeColor={PLAN_COLOR}
            routeWidth={3}
            routeOpacity={0.8}
            onMapReady={handleMapReady}
        />
    );
}
