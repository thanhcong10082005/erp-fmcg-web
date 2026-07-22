import React, { useState, useEffect, useCallback } from 'react';
import { apiCall, fmt } from '../api/client';

export default function ReportsPage({ token }) {
    const [tab, setTab] = useState('revenue');
    const [revenue, setRevenue] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [ar, setAR] = useState([]);
    const [topProducts, setTopProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const [groupBy, setGroupBy] = useState('day');

    // v13.3 - EOD Reconciliation state
    const [eodList, setEodList] = useState([]);
    const [pendingTrips, setPendingTrips] = useState([]);
    const [selectedEod, setSelectedEod] = useState(null);
    const [eodItems, setEodItems] = useState([]);
    const [creating, setCreating] = useState(false);
    const [approving, setApproving] = useState(false);

    const loadRevenue = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const qs = new URLSearchParams({ group_by: groupBy });
            const data = await apiCall('GET', '/reports/revenue?' + qs.toString(), null, token);
            setRevenue(Array.isArray(data) ? data : []);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token, groupBy]);

    const loadInventory = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const data = await apiCall('GET', '/reports/inventory', null, token);
            setInventory(Array.isArray(data) ? data : []);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token]);

    const loadAR = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const data = await apiCall('GET', '/reports/ar', null, token);
            setAR(Array.isArray(data) ? data : []);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token]);

    const loadTopProducts = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const data = await apiCall('GET', '/reports/top-products?limit=10', null, token);
            setTopProducts(Array.isArray(data) ? data : []);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token]);

    useEffect(() => {
        if (!token) return;
        if (tab === 'revenue') loadRevenue();
        if (tab === 'inventory') loadInventory();
        if (tab === 'ar') loadAR();
        if (tab === 'top') loadTopProducts();
        if (tab === 'eod') { loadEodList(); loadPendingTrips(); }
    }, [token, tab, loadRevenue, loadInventory, loadAR, loadTopProducts]);

    // v13.3 - EOD Reconciliation functions
    const loadEodList = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const data = await apiCall('GET', '/reports/eod', null, token);
            setEodList(Array.isArray(data) ? data : []);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token]);

    const loadPendingTrips = useCallback(async () => {
        try {
            const data = await apiCall('GET', '/reports/eod/trips/pending', null, token);
            setPendingTrips(Array.isArray(data) ? data : []);
        } catch (e) { /* ignore */ }
    }, [token]);

    const loadEodDetail = useCallback(async (eodId) => {
        try {
            const data = await apiCall('GET', `/reports/eod/${eodId}`, null, token);
            setSelectedEod(data);
            setEodItems(Array.isArray(data.items) ? data.items : []);
        } catch (e) { alert('Lỗi: ' + e.message); }
    }, [token]);

    const handleCreateEod = async (tripId) => {
        if (!confirm('Tạo đối soát EOD cho chuyến này?')) return;
        setCreating(true);
        try {
            const result = await apiCall('POST', `/reports/eod/from-trip/${tripId}`, {}, token);
            setSelectedEod(result);
            setEodItems(Array.isArray(result.items) ? result.items : []);
            loadEodList();
            loadPendingTrips();
            alert('Đã tạo đối soát EOD thành công');
        } catch (e) { alert('Lỗi: ' + e.message); }
        finally { setCreating(false); }
    };

    const handleApproveEod = async () => {
        if (!selectedEod) return;
        if (!confirm('Duyệt đối soát EOD này?\n\nHệ thống sẽ tạo phiếu chi/ledger adjustment nếu có chênh lệch.')) return;
        setApproving(true);
        try {
            const result = await apiCall('POST', `/reports/eod/${selectedEod.reconciliation_id}/approve`, {}, token);
            setSelectedEod(result);
            setEodItems(Array.isArray(result.items) ? result.items : []);
            loadEodList();
            alert('Đã duyệt đối soát EOD');
        } catch (e) { alert('Lỗi: ' + e.message); }
        finally { setApproving(false); }
    };

    return (
        <div>
            <div className="card">
                <div className="card-header">
                    <h3>📈 Báo cáo</h3>
                    <div className="flex">
                        {[
                            { id: 'revenue', label: '💰 Doanh thu' },
                            { id: 'inventory', label: '📦 Tồn kho' },
                            { id: 'ar', label: '💳 Công nợ' },
                            { id: 'top', label: '🏆 Top SP' },
                            { id: 'eod', label: '📊 Đối soát EOD' },
                        ].map(t => (
                            <button key={t.id}
                                className={tab === t.id ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                                onClick={() => setTab(t.id)}>{t.label}</button>
                        ))}
                    </div>
                </div>
                <div className="card-body">
                    {err && <div className="alert alert-error">{err}</div>}
                    {loading ? <div>Đang tải...</div> : (
                        <>
                            {tab === 'revenue' && (
                                <>
                                    <div className="flex mb-16">
                                        <label>Nhóm theo:</label>
                                        <select value={groupBy} onChange={e => setGroupBy(e.target.value)}>
                                            <option value="day">Ngày</option>
                                            <option value="week">Tuần</option>
                                            <option value="month">Tháng</option>
                                        </select>
                                    </div>
                                    <div className="table-wrap">
                                        <table>
                                            <thead>
                                                <tr><th>Kỳ</th><th>Số hóa đơn</th><th>Doanh thu</th><th>Thuế</th><th>CK</th><th>Tổng</th><th>Đã thu</th></tr>
                                            </thead>
                                            <tbody>
                                                {revenue.map((r, i) => (
                                                    <tr key={i}>
                                                        <td>{fmt.dateOnly(r.period)}</td>
                                                        <td>{r.order_count || 0}</td>
                                                        <td>{fmt.vnd(Number(r.revenue) || 0)}</td>
                                                        <td>{fmt.vnd(Number(r.tax) || 0)}</td>
                                                        <td>{fmt.vnd(Number(r.discount) || 0)}</td>
                                                        <td><strong>{fmt.vnd(Number(r.total) || 0)}</strong></td>
                                                        <td>{fmt.vnd(Number(r.collected) || 0)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}

                            {tab === 'inventory' && (
                                <div className="table-wrap">
                                    <table>
                                        <thead>
                                            <tr><th>SKU</th><th>Sản phẩm</th><th>DM</th><th>SL tồn</th><th>Giá trị</th><th>Trạng thái</th></tr>
                                        </thead>
                                        <tbody>
                                            {inventory.map((i, idx) => (
                                                <tr key={idx}>
                                                    <td><code>{i.sku}</code></td>
                                                    <td>{i.product_name}</td>
                                                    <td>{i.category_name}</td>
                                                    <td>{i.total_qty}</td>
                                                    <td><strong>{fmt.vnd(i.total_value)}</strong></td>
                                                    <td>{i.stock_status === 'OK' ? '✅' : i.stock_status === 'LOW_STOCK' ? '⚠️' : '❌'} {i.stock_status}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {tab === 'ar' && (
                                <div className="table-wrap">
                                    <table>
                                        <thead>
                                            <tr><th>Mã KH</th><th>Tên KH</th><th>Số hóa đơn</th><th>Tổng bill</th><th>Đã thu</th><th>Còn nợ</th><th>Quá hạn</th></tr>
                                        </thead>
                                        <tbody>
                                            {ar.map(a => (
                                                <tr key={a.partner_id}>
                                                    <td><code>{a.partner_code}</code></td>
                                                    <td><strong>{a.partner_name}</strong></td>
                                                    <td>{a.invoice_count || 0}</td>
                                                    <td>{fmt.vnd(Number(a.total_billed) || 0)}</td>
                                                    <td>{fmt.vnd(Number(a.total_paid) || 0)}</td>
                                                    <td><strong style={{ color: '#DC2626' }}>{fmt.vnd(Number(a.outstanding) || 0)}</strong></td>
                                                    <td><strong style={{ color: Number(a.overdue) > 0 ? '#DC2626' : 'inherit' }}>{fmt.vnd(Number(a.overdue) || 0)}</strong></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {tab === 'top' && (
                                <div className="table-wrap">
                                    <table>
                                        <thead>
                                            <tr><th>#</th><th>SKU</th><th>Sản phẩm</th><th>DM</th><th>SL bán</th><th>Doanh thu</th><th>Số HĐ</th></tr>
                                        </thead>
                                        <tbody>
                                            {topProducts.map((p, idx) => (
                                                <tr key={p.product_id}>
                                                    <td>{idx + 1} {idx < 3 && '🏆'}</td>
                                                    <td><code>{p.sku}</code></td>
                                                    <td><strong>{p.product_name}</strong></td>
                                                    <td>{p.category_name}</td>
                                                    <td>{fmt.num(p.total_qty_sold)}</td>
                                                    <td><strong>{fmt.vnd(p.total_revenue)}</strong></td>
                                                    <td>{p.invoice_count}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* v13.3 - EOD Reconciliation Wizard */}
                            {tab === 'eod' && (
                                <div>
                                    <div className="grid-2" style={{ gap: 16 }}>
                                        {/* Left: EOD List */}
                                        <div className="card">
                                            <div className="card-header">
                                                <h4>📋 Đối soát EOD</h4>
                                                <button className="btn btn-outline btn-sm" onClick={loadEodList}>🔄</button>
                                            </div>
                                            <div className="card-body">
                                                {loading ? <div>Đang tải...</div> : (
                                                    <div className="table-wrap">
                                                        <table>
                                                            <thead>
                                                                <tr>
                                                                    <th>Ngày</th><th>Tài xế</th><th>Tiền</th><th>Chênh lệch</th><th>TT</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {eodList.map(e => (
                                                                    <tr key={e.reconciliation_id}
                                                                        style={{ cursor: 'pointer', background: selectedEod?.reconciliation_id === e.reconciliation_id ? '#EFF6FF' : undefined }}
                                                                        onClick={() => loadEodDetail(e.reconciliation_id)}>
                                                                        <td>{e.reconciliation_date}</td>
                                                                        <td>{e.driver_name || '—'}</td>
                                                                        <td>{fmt.vnd(e.actual_cash || 0)}</td>
                                                                        <td style={{ color: Number(e.cash_difference) < 0 ? '#DC2626' : '#10B981', fontWeight: 600 }}>
                                                                            {Number(e.cash_difference) > 0 ? '+' : ''}{fmt.vnd(e.cash_difference || 0)}
                                                                        </td>
                                                                        <td>
                                                                            {e.status === 'PENDING' && <span style={{ background: '#FEF3C7', color: '#92400E', padding: '2px 6px', borderRadius: 8, fontSize: 11 }}>Chờ duyệt</span>}
                                                                            {e.status === 'APPROVED' && <span style={{ background: '#D1FAE5', color: '#065F46', padding: '2px 6px', borderRadius: 8, fontSize: 11 }}>Đã duyệt</span>}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                                {eodList.length === 0 && (
                                                                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20 }}>Chưa có đối soát EOD</td></tr>
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Right: EOD Detail or Pending Trips */}
                                        <div>
                                            {/* Pending Trips */}
                                            <div className="card mb-16">
                                                <div className="card-header">
                                                    <h4>🚚 Chuyến chưa đối soát</h4>
                                                </div>
                                                <div className="card-body">
                                                    {pendingTrips.length === 0 ? (
                                                        <div style={{ color: '#6B7280', textAlign: 'center', padding: 12 }}>Không có chuyến nào cần đối soát</div>
                                                    ) : (
                                                        <div className="table-wrap">
                                                            <table>
                                                                <thead>
                                                                    <tr><th>Mã chuyến</th><th>Ngày</th><th>Tài xế</th><th>Đơn</th><th></th></tr>
                                                                </thead>
                                                                <tbody>
                                                                    {pendingTrips.map(t => (
                                                                        <tr key={t.trip_id}>
                                                                            <td><code>{t.trip_number}</code></td>
                                                                            <td>{t.trip_date}</td>
                                                                            <td>{t.driver_name || '—'}</td>
                                                                            <td>{t.order_count}</td>
                                                                            <td>
                                                                                <button className="btn btn-sm btn-primary" onClick={() => handleCreateEod(t.trip_id)} disabled={creating}>
                                                                                    {creating ? '...' : '+ Tạo EOD'}
                                                                                </button>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* EOD Detail */}
                                            {selectedEod && (
                                                <div className="card">
                                                    <div className="card-header">
                                                        <h4>📊 Chi tiết: {selectedEod.reconciliation_id}</h4>
                                                    </div>
                                                    <div className="card-body">
                                                        {/* Summary */}
                                                        <div className="grid-2 mb-16" style={{ gap: 8 }}>
                                                            <div style={{ background: '#F9FAFB', padding: 12, borderRadius: 8 }}>
                                                                <div className="text-sm text-muted">Tiền dự kiến</div>
                                                                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{fmt.vnd(selectedEod.expected_cash || 0)}</div>
                                                            </div>
                                                            <div style={{ background: '#F9FAFB', padding: 12, borderRadius: 8 }}>
                                                                <div className="text-sm text-muted">Tiền thực tế</div>
                                                                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{fmt.vnd(selectedEod.actual_cash || 0)}</div>
                                                            </div>
                                                            <div style={{ background: Number(selectedEod.cash_difference) >= 0 ? '#D1FAE5' : '#FEE2E2', padding: 12, borderRadius: 8 }}>
                                                                <div className="text-sm text-muted">Chênh lệch tiền</div>
                                                                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: Number(selectedEod.cash_difference) >= 0 ? '#065F46' : '#991B1B' }}>
                                                                    {Number(selectedEod.cash_difference) > 0 ? '+' : ''}{fmt.vnd(selectedEod.cash_difference || 0)}
                                                                </div>
                                                            </div>
                                                            <div style={{ background: '#FEF3C7', padding: 12, borderRadius: 8 }}>
                                                                <div className="text-sm text-muted">Chênh lệch hàng</div>
                                                                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{selectedEod.items_difference || 0} món</div>
                                                            </div>
                                                        </div>

                                                        {/* Hàng đối soát */}
                                                        <h5 style={{ marginBottom: 8 }}>📦 Chi tiết đơn</h5>
                                                        <div className="table-wrap">
                                                            <table style={{ fontSize: 12 }}>
                                                                <thead>
                                                                    <tr>
                                                                        <th>Đơn</th><th>KH</th><th>Dự kiến</th><th>Thực tế</th><th>Chênh</th><th>TT</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {eodItems.map(item => (
                                                                        <tr key={item.item_id}>
                                                                            <td><code>{item.so_number}</code></td>
                                                                            <td>{item.partner_name || '—'}</td>
                                                                            <td style={{ textAlign: 'right' }}>{fmt.vnd(item.expected_cash || 0)}</td>
                                                                            <td style={{ textAlign: 'right' }}>{fmt.vnd(item.collected_cash || 0)}</td>
                                                                            <td style={{ textAlign: 'right', color: Number(item.cash_difference) < 0 ? '#DC2626' : '#10B981' }}>
                                                                                {Number(item.cash_difference) > 0 ? '+' : ''}{fmt.vnd(item.cash_difference || 0)}
                                                                            </td>
                                                                            <td>
                                                                                {item.reconciliation_status === 'MATCHED' && <span style={{ fontSize: 11, color: '#10B981' }}>✅ Khớp</span>}
                                                                                {item.reconciliation_status === 'CASH_SHORT' && <span style={{ fontSize: 11, color: '#DC2626' }}>⚠️ Thiếu tiền</span>}
                                                                                {item.reconciliation_status === 'CASH_OVER' && <span style={{ fontSize: 11, color: '#F59E0B' }}>⚠️ Thừa tiền</span>}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>

                                                        {/* Actions */}
                                                        {selectedEod.status === 'PENDING' && (
                                                            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                                                                <button className="btn btn-success" onClick={handleApproveEod} disabled={approving}>
                                                                    {approving ? '...' : '✅ Duyệt EOD'}
                                                                </button>
                                                                <button className="btn btn-outline" onClick={() => setSelectedEod(null)}>Đóng</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

