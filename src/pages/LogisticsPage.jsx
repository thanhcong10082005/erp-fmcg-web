import React, { useState, useEffect, useCallback } from 'react';
import { apiCall, fmt, StatusBadge } from '../api/client.jsx';

// Màu sắc cho trạng thái
const STATUS_COLORS = {
    'PREPARING': '#F59E0B',
    'LOADING': '#3B82F6',
    'DELIVERING': '#8B5CF6',
    'COMPLETED': '#10B981',
    'CANCELLED': '#DC2626',
    'PENDING': '#6B7280',
    'DELIVERED': '#10B981',
    'PARTIAL': '#F59E0B',
    'FAILED': '#DC2626',
};

export default function LogisticsPage({ token }) {
    const [trips, setTrips] = useState([]);
    const [orders, setOrders] = useState([]);  // Đơn đã giao (DELIVERED)
    const [confirmedOrders, setConfirmedOrders] = useState([]); // Đơn CONFIRMED chờ xếp
    const [availableOrders, setAvailableOrders] = useState([]); // Đơn cho modal "Thêm vào chuyến"
    const [selectedTrip, setSelectedTrip] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const [activeTab, setActiveTab] = useState('trips');
    const [showCreateTrip, setShowCreateTrip] = useState(false);
    const [showAddOrderModal, setShowAddOrderModal] = useState(false);
    const [addOrderSearch, setAddOrderSearch] = useState('');
    const [tripForm, setTripForm] = useState({
        trip_date: new Date().toISOString().split('T')[0],
        warehouse_id: 1,
        driver_id: '',
        vehicle_plate: '',
    });

    const loadTrips = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const data = await apiCall('GET', '/sales/trips', null, token);
            setTrips(Array.isArray(data) ? data : []);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token]);

    const loadDeliveredOrders = useCallback(async () => {
        try {
            const data = await apiCall('GET', '/sales/orders?status=DELIVERED&limit=200', null, token);
            setOrders(Array.isArray(data) ? data : []);
        } catch (e) { setErr(e.message); }
    }, [token]);

    const loadConfirmedOrders = useCallback(async () => {
        try {
            const data = await apiCall('GET', '/sales/orders?status=CONFIRMED&limit=200', null, token);
            setConfirmedOrders(Array.isArray(data) ? data : []);
        } catch (e) { setErr(e.message); }
    }, [token]);

    const loadAvailableOrders = useCallback(async () => {
        try {
            const [confirmed, delivered] = await Promise.all([
                apiCall('GET', '/sales/orders?status=CONFIRMED&limit=200', null, token),
                apiCall('GET', '/sales/orders?status=DELIVERED&limit=200', null, token),
            ]);
            const tripSoIds = new Set();
            for (const t of trips) {
                if (['PREPARING', 'LOADING', 'DELIVERING'].includes(t.status)) {
                    try {
                        const detail = await apiCall('GET', `/sales/trips/${t.trip_id}`, null, token);
                        (detail.orders || []).forEach(o => tripSoIds.add(o.so_id));
                    } catch {}
                }
            }
            const all = [
                ...(Array.isArray(confirmed) ? confirmed : []),
                ...(Array.isArray(delivered) ? delivered : []),
            ];
            let filtered = all.filter(o => !tripSoIds.has(o.so_id));
            if (selectedTrip?.orders) {
                const cur = new Set(selectedTrip.orders.map(o => o.so_id));
                filtered = filtered.filter(o => !cur.has(o.so_id));
            }
            setAvailableOrders(filtered);
        } catch (e) { setErr(e.message); }
    }, [token, trips, selectedTrip]);

    const loadTripDetails = useCallback(async (tripId) => {
        try {
            const data = await apiCall('GET', `/sales/trips/${tripId}`, null, token);
            setSelectedTrip(data);
        } catch (e) { setErr(e.message); }
    }, [token]);

    useEffect(() => {
        if (token) {
            loadTrips();
            loadConfirmedOrders();
            loadDeliveredOrders();
        }
    }, [token, loadTrips, loadConfirmedOrders, loadDeliveredOrders]);

    const handleCreateTrip = async (e) => {
        e.preventDefault();
        try {
            const data = await apiCall('POST', '/sales/trips', tripForm, token);
            alert(`✅ Đã tạo chuyến ${data.trip_number}`);
            setShowCreateTrip(false);
            setTripForm({ trip_date: new Date().toISOString().split('T')[0], warehouse_id: 1, driver_id: '', vehicle_plate: '' });
            loadTrips();
            loadTripDetails(data.trip_id);
            setActiveTab('trip-detail');
        } catch (e) { setErr(e.message); }
    };

    const handleAddOrderToTrip = async (tripId, soId) => {
        try {
            await apiCall('POST', `/sales/trips/${tripId}/orders`, { so_id: soId }, token);
            await loadTripDetails(tripId);
            await loadConfirmedOrders();
            await loadDeliveredOrders();
            await loadAvailableOrders();
            await loadTrips();
        } catch (e) { alert(e.message); throw e; }
    };

    const handleRemoveOrderFromTrip = async (tripOrderId, tripId) => {
        if (!confirm('Xóa đơn khỏi chuyến?')) return;
        try {
            await apiCall('DELETE', `/sales/trips/orders/${tripOrderId}`, null, token);
            await loadTripDetails(tripId);
            await loadTrips();
            await loadAvailableOrders();
        } catch (e) { alert(e.message); }
    };

    const handleStartTrip = async (tripId) => {
        try {
            await apiCall('PUT', `/sales/trips/${tripId}/start`, null, token);
            alert('🚚 Chuyến đã bắt đầu!');
            loadTrips();
            loadTripDetails(tripId);
        } catch (e) { setErr(e.message); }
    };

    const handleCompleteTrip = async (tripId) => {
        try {
            await apiCall('PUT', `/sales/trips/${tripId}/complete`, null, token);
            alert('✅ Chuyến hoàn thành!');
            loadTrips();
            loadTripDetails(tripId);
        } catch (e) { setErr(e.message); }
    };

    return (
        <div>
            {/* Tab Navigation */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid #E5E7EB', paddingBottom: 8 }}>
                <button 
                    className={`btn ${activeTab === 'trips' ? 'btn-primary' : 'btn-outline'} btn-sm`}
                    onClick={() => setActiveTab('trips')}
                >
                    🚚 Danh sách Chuyến
                </button>
                <button 
                    className={`btn ${activeTab === 'trip-detail' ? 'btn-primary' : 'btn-outline'} btn-sm`}
                    onClick={() => setActiveTab('trip-detail')}
                    disabled={!selectedTrip}
                >
                    📋 Chi tiết Chuyến
                </button>
                <button
                    className={`btn ${activeTab === 'confirmed' ? 'btn-primary' : 'btn-outline'} btn-sm`}
                    onClick={() => setActiveTab('confirmed')}
                >
                    📦 Đơn đã duyệt ({confirmedOrders.length})
                </button>
                <button
                    className={`btn ${activeTab === 'delivered' ? 'btn-primary' : 'btn-outline'} btn-sm`}
                    onClick={() => setActiveTab('delivered')}
                >
                    ✅ Đơn đã giao ({orders.length})
                </button>
                <button 
                    className="btn btn-success btn-sm"
                    onClick={() => setShowCreateTrip(true)}
                >
                    ➕ Tạo Chuyến Mới
                </button>
            </div>

            {err && <div className="alert alert-error">{err}</div>}

            {/* Trips List */}
            {activeTab === 'trips' && (
                <div className="card">
                    <div className="card-header">
                        <h3>🚚 Danh sách Chuyến giao ({trips.length})</h3>
                        <button className="btn btn-outline btn-sm" onClick={loadTrips}>↻ Refresh</button>
                    </div>
                    <div className="card-body">
                        {loading ? <div>Đang tải...</div> : (
                            <div className="table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Mã chuyến</th>
                                            <th>Ngày</th>
                                            <th>Tài xế</th>
                                            <th>Xe</th>
                                            <th>Tổng đơn</th>
                                            <th>Đã giao</th>
                                            <th>Thất bại</th>
                                            <th>Tiền thu</th>
                                            <th>Trạng thái</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {trips.map(t => (
                                            <tr key={t.trip_id} style={{ 
                                                background: t.status === 'COMPLETED' ? '#F0FDF4' : 
                                                           t.status === 'DELIVERING' ? '#FEF3C7' : 'transparent'
                                            }}>
                                                <td><code>{t.trip_number}</code></td>
                                                <td>{fmt.date(t.trip_date)}</td>
                                                <td>{t.driver_name || '—'}</td>
                                                <td>{t.vehicle_plate || '—'}</td>
                                                <td>{t.total_orders || 0}</td>
                                                <td style={{ color: '#10B981' }}>{t.delivered_count || 0}</td>
                                                <td style={{ color: '#DC2626' }}>{t.failed_count || 0}</td>
                                                <td>
                                                    <div>Tiền mặt: {fmt.vnd(t.total_cash || 0)}</div>
                                                    <div>Chuyển khoản: {fmt.vnd(t.total_transfer || 0)}</div>
                                                </td>
                                                <td>
                                                    <span style={{
                                                        background: (STATUS_COLORS[t.status] || '#6B7280') + '20',
                                                        color: STATUS_COLORS[t.status] || '#6B7280',
                                                        padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600
                                                    }}>
                                                        {t.status}
                                                    </span>
                                                </td>
                                                <td>
                                                    <button className="btn btn-sm btn-outline" onClick={() => { loadTripDetails(t.trip_id); setActiveTab('trip-detail'); }}>
                                                        📋 Xem
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {trips.length === 0 && (
                                            <tr><td colSpan={10} style={{ textAlign: 'center', padding: 20, color: '#6B7280' }}>
                                                Chưa có chuyến giao nào
                                            </td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Trip Detail */}
            {activeTab === 'trip-detail' && selectedTrip && (
                <div>
                    <div className="card">
                        <div className="card-header">
                            <h3>📋 Chuyến: {selectedTrip.trip_number}</h3>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {['PREPARING', 'LOADING'].includes(selectedTrip.status) && (
                                    <button
                                        className="btn btn-success btn-sm"
                                        onClick={async () => {
                                            await loadAvailableOrders();
                                            setShowAddOrderModal(true);
                                        }}
                                    >
                                        ➕ Thêm đơn vào chuyến
                                    </button>
                                )}
                                {selectedTrip.status === 'PREPARING' && (
                                    <button className="btn btn-primary btn-sm" onClick={() => handleStartTrip(selectedTrip.trip_id)}>
                                        🚚 Bắt đầu giao
                                    </button>
                                )}
                                {selectedTrip.status === 'DELIVERING' && (
                                    <button className="btn btn-success btn-sm" onClick={() => handleCompleteTrip(selectedTrip.trip_id)}>
                                        ✅ Hoàn thành chuyến
                                    </button>
                                )}
                                <button className="btn btn-outline btn-sm" onClick={() => loadTripDetails(selectedTrip.trip_id)}>
                                    ↻ Refresh
                                </button>
                            </div>
                        </div>
                        <div className="card-body">
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
                                <div style={{ background: '#F3F4F6', padding: 12, borderRadius: 8 }}>
                                    <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>Ngày</div>
                                    <div style={{ fontWeight: 600 }}>{fmt.date(selectedTrip.trip_date)}</div>
                                </div>
                                <div style={{ background: '#F3F4F6', padding: 12, borderRadius: 8 }}>
                                    <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>Tài xế</div>
                                    <div style={{ fontWeight: 600 }}>{selectedTrip.driver_name || '—'}</div>
                                </div>
                                <div style={{ background: '#F3F4F6', padding: 12, borderRadius: 8 }}>
                                    <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>Xe</div>
                                    <div style={{ fontWeight: 600 }}>{selectedTrip.vehicle_plate || '—'}</div>
                                </div>
                                <div style={{ background: '#F3F4F6', padding: 12, borderRadius: 8 }}>
                                    <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>Trạng thái</div>
                                    <div style={{ fontWeight: 600, color: STATUS_COLORS[selectedTrip.status] || '#6B7280' }}>
                                        {selectedTrip.status}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                                <div style={{ background: '#FEF3C7', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#D97706' }}>{selectedTrip.total_orders || 0}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#92400E' }}>Tổng đơn</div>
                                </div>
                                <div style={{ background: '#DCFCE7', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#16A34A' }}>{selectedTrip.delivered_count || 0}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#166534' }}>Đã giao</div>
                                </div>
                                <div style={{ background: '#FEE2E2', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#DC2626' }}>{selectedTrip.failed_count || 0}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#991B1B' }}>Thất bại</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="card mt-16">
                        <div className="card-header">
                            <h3>📦 Đơn hàng trong chuyến ({selectedTrip.orders?.length || 0})</h3>
                            {['PREPARING', 'LOADING'].includes(selectedTrip.status) && (
                                <button
                                    className="btn btn-success btn-sm"
                                    onClick={async () => {
                                        await loadAvailableOrders();
                                        setShowAddOrderModal(true);
                                    }}
                                >
                                    ➕ Thêm đơn
                                </button>
                            )}
                        </div>
                        <div className="card-body">
                            {selectedTrip.orders?.length > 0 ? (
                                <div className="table-wrap">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>STT</th>
                                                <th>Mã đơn</th>
                                                <th>Partner</th>
                                                <th>Địa chỉ</th>
                                                <th>Tổng tiền</th>
                                                <th>Trạng thái</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedTrip.orders.map((o, idx) => (
                                                <tr key={o.trip_order_id}>
                                                    <td>{o.stop_order || idx + 1}</td>
                                                    <td><code>{o.so_number}</code></td>
                                                    <td>
                                                        <strong>{o.partner_name}</strong>
                                                        <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>{o.partner_phone}</div>
                                                    </td>
                                                    <td>{o.partner_address || '—'}</td>
                                                    <td style={{ fontWeight: 600 }}>{fmt.vnd(o.total_amount)}</td>
                                                    <td>
                                                        <span style={{
                                                            background: (STATUS_COLORS[o.status] || '#6B7280') + '20',
                                                            color: STATUS_COLORS[o.status] || '#6B7280',
                                                            padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600
                                                        }}>
                                                            {o.status}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {selectedTrip.status === 'PREPARING' && (
                                                            <button
                                                                className="btn btn-sm btn-danger"
                                                                onClick={() => handleRemoveOrderFromTrip(o.trip_order_id, selectedTrip.trip_id)}
                                                            >
                                                                🗑️
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: 20, color: '#6B7280' }}>
                                    <div>Chưa có đơn nào trong chuyến</div>
                                    {['PREPARING', 'LOADING'].includes(selectedTrip.status) && (
                                        <button
                                            className="btn btn-primary btn-sm"
                                            style={{ marginTop: 12 }}
                                            onClick={async () => {
                                                await loadAvailableOrders();
                                                setShowAddOrderModal(true);
                                            }}
                                        >
                                            ➕ Thêm đơn đầu tiên
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmed Orders - chờ xếp vào chuyến */}
            {activeTab === 'confirmed' && (
                <div className="card">
                    <div className="card-header">
                        <h3>📦 Đơn đã duyệt, chờ xếp vào chuyến ({confirmedOrders.length})</h3>
                        <button className="btn btn-outline btn-sm" onClick={loadConfirmedOrders}>↻ Refresh</button>
                    </div>
                    <div className="card-body">
                        {confirmedOrders.length > 0 ? (
                            <div className="table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Mã đơn</th>
                                            <th>Partner</th>
                                            <th>Phone</th>
                                            <th>Ngày đặt</th>
                                            <th>Tổng tiền</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {confirmedOrders.map(o => (
                                            <tr key={o.so_id}>
                                                <td><code>{o.so_number}</code></td>
                                                <td>
                                                    <strong>{o.partner_name}</strong>
                                                    {o.address_line && <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>{o.address_line}</div>}
                                                </td>
                                                <td>{o.partner_phone || '—'}</td>
                                                <td>{fmt.date(o.order_date)}</td>
                                                <td style={{ fontWeight: 600 }}>{fmt.vnd(o.total_amount)}</td>
                                                <td>
                                                    <select
                                                        disabled={trips.filter(t => t.status === 'PREPARING').length === 0}
                                                        onChange={async (e) => {
                                                            if (!e.target.value) return;
                                                            const tripId = parseInt(e.target.value);
                                                            try {
                                                                await handleAddOrderToTrip(tripId, o.so_id);
                                                                alert(`✅ Đã xếp ${o.so_number} vào chuyến`);
                                                            } catch (err) {
                                                                alert('Lỗi: ' + err.message);
                                                            }
                                                            e.target.value = '';
                                                        }}
                                                        style={{ padding: '4px 8px' }}
                                                    >
                                                        <option value="">{trips.filter(t => t.status === 'PREPARING').length === 0 ? '— Tạo chuyến trước —' : '→ Xếp vào...'}</option>
                                                        {trips.filter(t => t.status === 'PREPARING').map(t => (
                                                            <option key={t.trip_id} value={t.trip_id}>
                                                                {t.trip_number} ({t.total_orders || 0} đơn)
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: 20, color: '#6B7280' }}>
                                Không có đơn chờ xếp — hãy duyệt đơn ở menu Đơn bán hàng trước
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Delivered Orders - đơn đã giao */}
            {activeTab === 'delivered' && (
                <div className="card">
                    <div className="card-header">
                        <h3>✅ Đơn đã giao ({orders.length})</h3>
                        <button className="btn btn-outline btn-sm" onClick={loadDeliveredOrders}>↻ Refresh</button>
                    </div>
                    <div className="card-body">
                        {orders.length > 0 ? (
                            <div className="table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Mã đơn</th>
                                            <th>Partner</th>
                                            <th>Phone</th>
                                            <th>Ngày giao</th>
                                            <th>Tổng tiền</th>
                                            <th>Trạng thái</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {orders.map(o => (
                                            <tr key={o.so_id}>
                                                <td><code>{o.so_number}</code></td>
                                                <td><strong>{o.partner_name}</strong></td>
                                                <td>{o.partner_phone || '—'}</td>
                                                <td>{fmt.date(o.delivered_date || o.order_date)}</td>
                                                <td style={{ fontWeight: 600 }}>{fmt.vnd(o.total_amount)}</td>
                                                <td>
                                                    <span style={{
                                                        background: '#10B98120', color: '#10B981',
                                                        padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600
                                                    }}>DELIVERED</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: 20, color: '#6B7280' }}>
                                Chưa có đơn nào được giao
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Add Orders To Trip Modal */}
            {showAddOrderModal && selectedTrip && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.6)', display: 'flex',
                    alignItems: 'flex-start', justifyContent: 'center',
                    zIndex: 1100, padding: 16, overflow: 'auto',
                }}>
                    <div style={{
                        background: '#fff', borderRadius: 12,
                        width: '100%', maxWidth: 800,
                        margin: '24px auto',
                    }}>
                        <div style={{
                            padding: '16px 24px', borderBottom: '1px solid #E5E7EB',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            position: 'sticky', top: 0, background: '#fff', zIndex: 2,
                            borderRadius: '12px 12px 0 0',
                        }}>
                            <h3 style={{ margin: 0 }}>➕ Thêm đơn vào chuyến {selectedTrip.trip_number}</h3>
                            <button className="btn btn-outline btn-sm" onClick={() => { setShowAddOrderModal(false); setAddOrderSearch(''); }}>✕ Đóng</button>
                        </div>
                        <div style={{ padding: 24 }}>
                            <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                    type="text"
                                    placeholder="🔍 Tìm theo mã đơn / tên khách / SĐT..."
                                    value={addOrderSearch}
                                    onChange={e => setAddOrderSearch(e.target.value)}
                                    style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #D1D5DB' }}
                                />
                                <button className="btn btn-outline btn-sm" onClick={loadAvailableOrders}>↻ Refresh</button>
                            </div>
                            {(() => {
                                const q = addOrderSearch.toLowerCase().trim();
                                const filtered = availableOrders.filter(o =>
                                    !q ||
                                    (o.so_number || '').toLowerCase().includes(q) ||
                                    (o.partner_name || '').toLowerCase().includes(q) ||
                                    (o.partner_phone || '').toLowerCase().includes(q),
                                );
                                if (availableOrders.length === 0) {
                                    return <div style={{ textAlign: 'center', padding: 30, color: '#6B7280' }}>
                                        <div style={{ fontSize: '2rem' }}>📭</div>
                                        <div>Không có đơn khả dụng để thêm</div>
                                        <div style={{ fontSize: '0.85rem', marginTop: 6 }}>Đơn CONFIRMED hoặc DELIVERED chưa thuộc chuyến nào sẽ hiện ở đây</div>
                                    </div>;
                                }
                                return (
                                    <div className="table-wrap" style={{ maxHeight: 480, overflowY: 'auto' }}>
                                        <table>
                                            <thead>
                                                <tr style={{ position: 'sticky', top: 0, background: '#F3F4F6', zIndex: 1 }}>
                                                    <th>Mã đơn</th>
                                                    <th>Khách hàng</th>
                                                    <th>Phone</th>
                                                    <th>Ngày</th>
                                                    <th>Trạng thái</th>
                                                    <th>Tổng tiền</th>
                                                    <th></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filtered.map(o => (
                                                    <tr key={o.so_id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                                        <td><code>{o.so_number}</code></td>
                                                        <td>
                                                            <strong>{o.partner_name}</strong>
                                                            {o.address_line && <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>{o.address_line}</div>}
                                                        </td>
                                                        <td>{o.partner_phone || '—'}</td>
                                                        <td>{fmt.date(o.order_date)}</td>
                                                        <td>
                                                            <span style={{
                                                                background: (STATUS_COLORS[o.status] || '#6B7280') + '20',
                                                                color: STATUS_COLORS[o.status] || '#6B7280',
                                                                padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600
                                                            }}>{o.status}</span>
                                                        </td>
                                                        <td style={{ fontWeight: 600 }}>{fmt.vnd(o.total_amount)}</td>
                                                        <td>
                                                            <button
                                                                className="btn btn-sm btn-success"
                                                                onClick={async () => {
                                                                    try {
                                                                        await handleAddOrderToTrip(selectedTrip.trip_id, o.so_id);
                                                                    } catch (err) {
                                                                        alert('Lỗi: ' + err.message);
                                                                    }
                                                                }}
                                                            >➕ Thêm</button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {filtered.length === 0 && (
                                            <div style={{ textAlign: 'center', padding: 20, color: '#6B7280' }}>
                                                Không tìm thấy đơn phù hợp "{addOrderSearch}"
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* Create Trip Modal */}
            {showCreateTrip && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 400 }}>
                        <h3 style={{ marginTop: 0 }}>🚚 Tạo Chuyến Giao Mới</h3>
                        <form onSubmit={handleCreateTrip}>
                            <div className="form-group">
                                <label>Ngày giao</label>
                                <input type="date" value={tripForm.trip_date} required
                                    onChange={e => setTripForm({ ...tripForm, trip_date: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Kho xuất</label>
                                <input type="number" value={tripForm.warehouse_id}
                                    onChange={e => setTripForm({ ...tripForm, warehouse_id: parseInt(e.target.value) })} />
                            </div>
                            <div className="form-group">
                                <label>ID Tài xế</label>
                                <input type="number" value={tripForm.driver_id}
                                    onChange={e => setTripForm({ ...tripForm, driver_id: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Biển số xe</label>
                                <input value={tripForm.vehicle_plate}
                                    onChange={e => setTripForm({ ...tripForm, vehicle_plate: e.target.value })} />
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                                <button type="submit" className="btn btn-success">Tạo chuyến</button>
                                <button type="button" className="btn btn-outline" onClick={() => setShowCreateTrip(false)}>Hủy</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
