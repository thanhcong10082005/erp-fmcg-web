/**
 * AuditMapPage — Phase 6: Đối chiếu Lộ trình Kế hoạch vs Thực tế
 *
 * Hiển thị:
 *   - Đường nét đứt màu xanh: Lộ trình kế hoạch (planned route)
 *   - Chấm đỏ: Vị trí thực tế tài xế bấm xác nhận giao hàng (POD GPS)
 *
 * API:
 *   GET /api/sales/trips?status=COMPLETED,PARTIAL_DELIVERED — list completed trips
 *   GET /api/sales/trips/:id/full — trip với POD data đầy đủ (v11 Phase 6)
 *   GET /api/vietmap/trips/:id/route — route geometry
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiCall } from '../api/client';
import VietmapMap from '../components/VietmapMap';

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

export default function AuditMapPage({ token }) {
    const [trips, setTrips]           = useState([]);
    const [selectedTripId, setSelectedTripId] = useState('');
    const [auditData, setAuditData]   = useState(null);
    const [loading, setLoading]       = useState(false);
    const [auditLoading, setAuditLoading] = useState(false);
    const [err, setErr]             = useState('');

    // Load completed trips
    useEffect(() => {
        if (!token) return;
        setLoading(true);
        apiCall('GET', '/sales/trips?status=COMPLETED,PARTIAL_DELIVERED', null, token)
            .then(data => {
                const list = Array.isArray(data) ? data : (data?.data || []);
                setTrips(list);
            })
            .catch(e => setErr(e.message))
            .finally(() => setLoading(false));
    }, [token]);

    // Load audit data khi chọn trip
    const loadAudit = useCallback(async (tripId) => {
        if (!tripId) { setAuditData(null); return; }
        setAuditLoading(true);
        setErr('');
        try {
            const [tripFullRes, routeRes] = await Promise.all([
                apiCall('GET', `/sales/trips/${tripId}/full`, null, token),
                apiCall('GET', `/vietmap/trips/${tripId}/route`, null, token),
            ]);

            const orders = tripFullRes?.orders || [];
            const planGeometry = routeRes?.geometry || null;

            // Build pod_points từ orders
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
                        partner_id:      o.partner_id,
                        partner_name:    o.partner_name,
                        stop_order:      o.stop_order,
                        plan_lat:        isNaN(planLat) ? null : planLat,
                        plan_lng:        isNaN(planLng) ? null : planLng,
                        actual_lat:      actualLat,
                        actual_lng:      actualLng,
                        delivery_status:  o.pod_delivery_status || o.delivery_status || null,
                        pod_id:          o.pod_id || null,
                        deviation_m:     (o.partner_latitude && o.partner_longitude) ? deviation : 0,
                    };
                });

            const deviations = podPoints.map(p => p.deviation_m).filter(d => d > 0);
            const avgDeviation = deviations.length
                ? Math.round(deviations.reduce((a, b) => a + b, 0) / deviations.length) : 0;
            const maxDeviation = deviations.length ? Math.max(...deviations) : 0;
            const overdueCount = deviations.filter(d => d > 500).length;

            setAuditData({
                trip:           tripFullRes,
                plan_geometry:  planGeometry,
                plan_distance_m: routeRes?.distance_m || 0,
                pod_points:     podPoints,
                stats: {
                    total_stops:     podPoints.length,
                    avg_deviation_m: avgDeviation,
                    max_deviation_m: maxDeviation,
                    overdue_stops:   overdueCount,
                },
            });
        } catch (e) {
            setErr('Lỗi khi tải audit data: ' + e.message);
        } finally {
            setAuditLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (selectedTripId) loadAudit(selectedTripId);
        else setAuditData(null);
    }, [selectedTripId, loadAudit]);

    // Build map points
    const planPoints = auditData
        ? auditData.pod_points.map(p => ({
            id:    `plan-${p.partner_id}`,
            lat:   p.plan_lat ?? p.actual_lat,
            lng:   p.plan_lng ?? p.actual_lng,
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
                properties: {
                    partner_id:     p.partner_id,
                    partner_name:   p.partner_name,
                    stop_order:     p.stop_order,
                    deviation_m:    p.deviation_m,
                    delivery_status: p.delivery_status,
                },
            })),
          }
        : null;

    const stats     = auditData?.stats;
    const planDistKm = auditData?.plan_distance_m
        ? (auditData.plan_distance_m / 1000).toFixed(1)
        : null;

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ margin: 0 }}>🔍 Audit Map — Đối chiếu Kế hoạch vs Thực tế</h3>
                {trips.length > 0 && (
                    <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                        {trips.length} chuyến đã hoàn thành
                    </span>
                )}
            </div>

            {err && (
                <div style={{ background: '#FEE2E2', color: '#B91C1C', padding: 8, borderRadius: 4, marginBottom: 12 }}>
                    ⚠️ {err}
                </div>
            )}

            {/* Trip selector */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                <select
                    className="input"
                    value={selectedTripId}
                    onChange={e => setSelectedTripId(e.target.value)}
                    style={{ maxWidth: 320 }}
                    disabled={loading}
                >
                    <option value="">— Chọn chuyến đã hoàn thành —</option>
                    {trips.map(t => (
                        <option key={t.trip_id} value={t.trip_id}>
                            {t.trip_number} — {t.driver_name || '—'} — {t.status}
                        </option>
                    ))}
                </select>
                {loading && <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>⏳ Đang tải danh sách...</span>}
                {auditLoading && <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>⏳ Đang tải audit...</span>}
            </div>

            {/* Stats */}
            {stats && (
                <div style={{
                    display: 'flex', gap: 16, flexWrap: 'wrap',
                    background: '#F9FAFB', border: '1px solid #E5E7EB',
                    borderRadius: 6, padding: '10px 14px', marginBottom: 12, fontSize: '0.85rem',
                }}>
                    <div><span style={{ color: '#6B7280' }}>Tổng điểm dừng: </span><strong>{stats.total_stops}</strong></div>
                    {planDistKm && <div><span style={{ color: '#6B7280' }}>Lộ trình kế hoạch: </span><strong>{planDistKm} km</strong></div>}
                    <div>
                        <span style={{ color: '#6B7280' }}>Độ lệch TB: </span>
                        <strong style={{ color: stats.avg_deviation_m > 200 ? '#DC2626' : '#059669' }}>
                            {stats.avg_deviation_m} m
                        </strong>
                    </div>
                    <div>
                        <span style={{ color: '#6B7280' }}>Độ lệch MAX: </span>
                        <strong style={{ color: stats.max_deviation_m > 500 ? '#DC2626' : '#92400E' }}>
                            {stats.max_deviation_m} m
                        </strong>
                    </div>
                    {stats.overdue_stops > 0 && (
                        <div><span style={{ color: '#DC2626' }}>⚠️ Lệch &gt;500m: </span><strong style={{ color: '#DC2626' }}>{stats.overdue_stops}</strong></div>
                    )}
                </div>
            )}

            {/* Legend */}
            {auditData && (
                <div style={{ display: 'flex', gap: 20, fontSize: '0.8rem', color: '#374151', marginBottom: 8, flexWrap: 'wrap' }}>
                    <span>
                        <span style={{ display: 'inline-block', width: 20, height: 3, background: PLAN_COLOR, borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }}></span>
                        Lộ trình kế hoạch
                    </span>
                    <span>
                        <span style={{ display: 'inline-block', width: 10, height: 10, background: ACTUAL_COLOR, borderRadius: '50%', border: '2px solid #fff', verticalAlign: 'middle', marginRight: 4, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}></span>
                        Vị trí thực tế POD
                    </span>
                    <span>
                        <span style={{ display: 'inline-block', width: 10, height: 10, background: PLAN_COLOR, borderRadius: '50%', border: '2px solid #fff', verticalAlign: 'middle', marginRight: 4 }}></span>
                        Điểm giao (plan)
                    </span>
                </div>
            )}

            {/* Map */}
            {selectedTripId && !auditLoading && auditData && planPoints.length > 0 && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <AuditMap
                        planPoints={planPoints}
                        actualDotsGeoJSON={actualDotsGeoJSON}
                        planGeometry={auditData.plan_geometry}
                    />
                </div>
            )}

            {!selectedTripId && !auditLoading && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF', fontSize: '0.9rem' }}>
                    Chọn một chuyến xe đã hoàn thành ở trên để xem so sánh lộ trình kế hoạch và thực tế.
                </div>
            )}

            {auditLoading && (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6B7280', fontSize: '0.9rem' }}>
                    ⏳ Đang tải dữ liệu audit...
                </div>
            )}

            {/* POD Table */}
            {auditData && auditData.pod_points.length > 0 && (
                <div className="card" style={{ marginTop: 12 }}>
                    <div className="card-header">
                        <h4 style={{ margin: 0, fontSize: '0.95rem' }}>📋 Chi tiết từng điểm dừng</h4>
                    </div>
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
                                        <td style={{ padding: '5px 10px', textAlign: 'right', color: '#6B7280' }}>
                                            {p.plan_lat ? p.plan_lat.toFixed(5) : '—'}
                                        </td>
                                        <td style={{ padding: '5px 10px', textAlign: 'right', color: '#6B7280' }}>
                                            {p.plan_lng ? p.plan_lng.toFixed(5) : '—'}
                                        </td>
                                        <td style={{ padding: '5px 10px', textAlign: 'right' }}>{p.actual_lat.toFixed(5)}</td>
                                        <td style={{ padding: '5px 10px', textAlign: 'right' }}>{p.actual_lng.toFixed(5)}</td>
                                        <td style={{
                                            padding: '5px 10px', textAlign: 'right',
                                            fontWeight: p.deviation_m > 500 ? 700 : 400,
                                            color: p.deviation_m > 500 ? '#DC2626' : p.deviation_m > 200 ? '#D97706' : '#059669',
                                        }}>
                                            {p.deviation_m > 0 ? `${p.deviation_m} m` : '—'}
                                        </td>
                                        <td style={{ padding: '5px 10px' }}>
                                            <span style={{
                                                fontSize: '0.7rem', padding: '1px 6px', borderRadius: 10,
                                                background: p.delivery_status === 'DELIVERED' ? '#D1FAE5' : '#FEE2E2',
                                                color: p.delivery_status === 'DELIVERED' ? '#065F46' : '#991B1B',
                                            }}>
                                                {p.delivery_status || 'N/A'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Inner audit map component ───────────────────────────────────────────
function AuditMap({ planPoints, actualDotsGeoJSON, planGeometry }) {
    const [mapReady, setMapReady] = useState(false);

    function handleMapReady(map) {
        setMapReady(true);
        // After map loads, add actual dots layer
        if (!actualDotsGeoJSON) return;
        const vietmap = window.vietmapgl;
        if (!vietmap) return;

        const SOURCE = 'audit-actual-dots';
        const LAYER  = 'audit-actual-dots-layer';

        map.addSource(SOURCE, { type: 'geojson', data: actualDotsGeoJSON });
        map.addLayer({
            id: LAYER,
            type: 'circle',
            source: SOURCE,
            paint: {
                'circle-radius': 7,
                'circle-color': ACTUAL_COLOR,
                'circle-stroke-color': '#fff',
                'circle-stroke-width': 2,
                'circle-opacity': 0.9,
            },
        });

        map.on('click', LAYER, (e) => {
            const props = e.features?.[0]?.properties;
            if (!props) return;
            const coords = e.features[0].geometry.coordinates.slice();
            new vietmap.Popup({ offset: 20 })
                .setLngLat(coords)
                .setHTML(`
                    <div style="font-family:sans-serif;font-size:13px;min-width:180px;">
                        <strong>${props.stop_order}. ${props.partner_name}</strong><br/>
                        <span style="color:#EF4444;">● Vị trí thực tế POD</span><br/>
                        Độ lệch: <strong>${props.deviation_m} m</strong><br/>
                        Trạng thái: ${props.delivery_status || 'N/A'}
                    </div>
                `)
                .addTo(map);
        });

        map.on('mouseenter', LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', LAYER, () => { map.getCanvas().style.cursor = ''; });
    }

    return (
        <VietmapMap
            points={planPoints}
            height="500px"
            fitBounds={true}
            draggable={false}
            routeGeometry={planGeometry}
            routeColor={PLAN_COLOR}
            routeWidth={3}
            onMapReady={handleMapReady}
        />
    );
}
