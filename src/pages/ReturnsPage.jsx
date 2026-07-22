import React, { useState, useEffect, useCallback } from 'react';
import { apiCall } from '../api/client';

/**
 * v13.1.2 - Trang Nhập lại Hàng Rớt/Trả
 * Luồng: Xem phiếu trả → Thủ kho nhận hàng → Duyệt → Tự sinh SALES_RETURN vào ledger
 */
export default function ReturnsPage({ token }) {
    const [returns, setReturns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const [filter, setFilter] = useState({ status: '', return_type: '' });

    // Detail state
    const [selectedReturn, setSelectedReturn] = useState(null);
    const [returnItems, setReturnItems] = useState([]);
    const [savingItem, setSavingItem] = useState(null);

    // Create modal
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);

    // Approve state
    const [approving, setApproving] = useState(false);

    // Load returns
    const loadReturns = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const qs = new URLSearchParams();
            if (filter.status) qs.set('status', filter.status);
            if (filter.return_type) qs.set('return_type', filter.return_type);
            const data = await apiCall('GET', '/logistics/returns?' + qs.toString(), null, token);
            setReturns(Array.isArray(data) ? data : []);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token, filter]);

    useEffect(() => { if (token) loadReturns(); }, [token, loadReturns]);

    // Open detail
    const handleOpenDetail = async (ret) => {
        try {
            const data = await apiCall('GET', `/logistics/returns/${ret.return_id || ret.customer_return_id}`, null, token);
            setSelectedReturn(data);
            setReturnItems(Array.isArray(data.items) ? data.items : []);
        } catch (e) { setErr(e.message); }
    };

    // Update received_qty
    const handleUpdateItem = async (item) => {
        const returnId = selectedReturn.return_id || selectedReturn.customer_return_id;
        const qty = prompt(`[${item.product_name}] Nhập số lượng thực nhận tại kho:`, item.received_qty || item.returned_qty || 0);
        if (qty === null) return;
        const qtyNum = Number(qty);
        if (isNaN(qtyNum)) { alert('Số lượng không hợp lệ'); return; }

        setSavingItem(item.return_item_id || item.cr_item_id);
        try {
            await apiCall('PUT', `/logistics/returns/${returnId}/items/${item.return_item_id || item.cr_item_id}`, {
                received_qty: qtyNum,
                notes: item.notes
            }, token);
            const updated = await apiCall('GET', `/logistics/returns/${returnId}`, null, token);
            setSelectedReturn(updated);
            setReturnItems(Array.isArray(updated.items) ? updated.items : []);
        } catch (e) { alert('Lỗi: ' + e.message); }
        finally { setSavingItem(null); }
    };

    // Approve return
    const handleApprove = async () => {
        if (!selectedReturn) return;
        const returnId = selectedReturn.return_id || selectedReturn.customer_return_id;
        const received = returnItems.filter(i => Number(i.received_qty) > 0);
        if (received.length === 0) {
            alert('Chưa nhận hàng nào. Vui lòng cập nhật số lượng thực nhận trước khi duyệt.');
            return;
        }
        if (!confirm(`Xác nhận duyệt phiếu trả hàng?\n\nSẽ sinh ${received.length} dòng SALES_RETURN vào sổ kho để tăng tồn kho.\n\nVí dụ:\n${received.slice(0, 3).map(i =>
    `• ${i.product_name}: +${i.received_qty} ${i.unit_name}`
).join('\n')}${received.length > 3 ? '\n• ...' : ''}`)) return;

        setApproving(true);
        try {
            await apiCall('POST', `/logistics/returns/${returnId}/approve`, {}, token);
            const updated = await apiCall('GET', `/logistics/returns/${returnId}`, null, token);
            setSelectedReturn(updated);
            setReturnItems(Array.isArray(updated.items) ? updated.items : []);
            loadReturns();
            alert('Đã duyệt phiếu trả hàng. Sổ kho đã được cập nhật.');
        } catch (e) { alert('Lỗi: ' + e.message); }
        finally { setApproving(false); }
    };

    // Cancel return
    const handleCancel = async () => {
        if (!selectedReturn || selectedReturn.status !== 'DRAFT') return;
        const returnId = selectedReturn.return_id || selectedReturn.customer_return_id;
        if (!confirm('Hủy phiếu trả hàng này?')) return;
        try {
            await apiCall('POST', `/logistics/returns/${returnId}/cancel`, {}, token);
            setSelectedReturn(null);
            loadReturns();
        } catch (e) { alert('Lỗi: ' + e.message); }
    };

    const statusBadge = (s) => {
        if (s === 'APPROVED' || s === 'POSTED') return <span style={{ background: '#D1FAE5', color: '#065F46', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>Đã duyệt</span>;
        if (s === 'CANCELLED') return <span style={{ background: '#FEE2E2', color: '#991B1B', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>Đã hủy</span>;
        return <span style={{ background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>Nháp</span>;
    };

    const typeLabel = (t) => {
        if (t === 'FAILED_DELIVERY') return '🚫 Giao thất bại';
        if (t === 'CUSTOMER_RETURN') return '↩️ Khách trả lại';
        if (t === 'DAMAGED') return '💔 Hàng hỏng';
        return t;
    };

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ margin: 0 }}>↩️ Nhập lại hàng rớt / trả</h2>
            </div>

            {/* Filters */}
            <div className="card mb-16">
                <div className="card-body" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label>
                        Trạng thái:
                        <select className="input" style={{ marginLeft: 8 }} value={filter.status}
                            onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
                            <option value="">Tất cả</option>
                            <option value="DRAFT">Nháp</option>
                            <option value="POSTED">Đã duyệt</option>
                            <option value="CANCELLED">Đã hủy</option>
                        </select>
                    </label>
                    <label>
                        Loại:
                        <select className="input" style={{ marginLeft: 8 }} value={filter.return_type}
                            onChange={e => setFilter(f => ({ ...f, return_type: e.target.value }))}>
                            <option value="">Tất cả</option>
                            <option value="FAILED_DELIVERY">Giao thất bại</option>
                            <option value="CUSTOMER_RETURN">Khách trả lại</option>
                            <option value="DAMAGED">Hàng hỏng</option>
                        </select>
                    </label>
                    <button className="btn btn-outline btn-sm" onClick={loadReturns}>🔍 Lọc</button>
                </div>
            </div>

            {err && <div className="alert alert-error mb-16">{err}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: selectedReturn ? '1fr 450px' : '1fr', gap: 16 }}>
                {/* List */}
                <div className="card">
                    <div className="card-header"><h3>Danh sách phiếu trả hàng</h3></div>
                    <div className="card-body">
                        {loading ? <div>Đang tải...</div> : returns.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 24, color: '#9CA3AF' }}>
                                <div style={{ fontSize: 48 }}>📦</div>
                                <p>Chưa có phiếu trả hàng nào</p>
                                <p style={{ fontSize: 12 }}>Phiếu sẽ tự động được tạo khi chuyến xe hoàn thành có đơn giao thất bại</p>
                            </div>
                        ) : (
                            <table>
                                <thead>
                                    <tr>
                                        <th>Mã phiếu</th>
                                        <th>Loại</th>
                                        <th>Khách hàng</th>
                                        <th>Chuyến</th>
                                        <th>SL món</th>
                                        <th>Trạng thái</th>
                                        <th>Ngày tạo</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {returns.map(r => (
                                        <tr key={r.return_id} style={{
                                            background: selectedReturn?.return_id === r.return_id ? '#EFF6FF' : undefined,
                                            cursor: 'pointer'
                                        }} onClick={() => handleOpenDetail(r)}>
                                            <td><strong>{r.return_number || r.cr_number}</strong></td>
                                            <td>{typeLabel(r.return_type)}</td>
                                            <td>{r.partner_name || '—'}</td>
                                            <td>{r.trip_number || '—'}</td>
                                            <td>{r.total_items || returnItems?.length || '-'}</td>
                                            <td>{statusBadge(r.status)}</td>
                                            <td>{new Date(r.created_at).toLocaleDateString('vi-VN')}</td>
                                            <td>
                                                <button className="btn btn-sm btn-outline" onClick={(e) => { e.stopPropagation(); handleOpenDetail(r); }}>👁️</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Detail Panel */}
                {selectedReturn && (
                    <div className="card" style={{ position: 'sticky', top: 16, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
                        <div className="card-header">
                            <h3 style={{ margin: 0 }}>📋 {selectedReturn.return_number || selectedReturn.cr_number}</h3>
                        </div>
                        <div className="card-body">
                            {/* Summary */}
                            <div style={{ background: '#F9FAFB', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                                    <div><strong>Loại:</strong> {typeLabel(selectedReturn.return_type)}</div>
                                    <div><strong>Trạng thái:</strong> {statusBadge(selectedReturn.status)}</div>
                                    <div><strong>Khách hàng:</strong> {selectedReturn.partner_name || '—'}</div>
                                    <div><strong>Chuyến:</strong> {selectedReturn.trip_number || '—'}</div>
                                    <div><strong>Người tạo:</strong> {selectedReturn.created_by}</div>
                                    <div><strong>Ngày:</strong> {new Date(selectedReturn.created_at).toLocaleString('vi-VN')}</div>
                                </div>
                                {selectedReturn.notes && <div style={{ marginTop: 8, fontStyle: 'italic', color: '#6B7280' }}>📝 {selectedReturn.notes}</div>}
                                {selectedReturn.approved_by && (
                                    <div style={{ marginTop: 8, fontSize: 12, color: '#059669' }}>
                                        ✅ Đã duyệt bởi {selectedReturn.approved_by} lúc {new Date(selectedReturn.approved_at).toLocaleString('vi-VN')}
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            {selectedReturn.status === 'DRAFT' && (
                                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                    <button className="btn btn-success btn-sm" style={{ flex: 1 }} onClick={handleApprove} disabled={approving}>
                                        {approving ? '⏳...' : '✅ Duyệt & Nhập kho'}
                                    </button>
                                    <button className="btn btn-danger btn-sm" onClick={handleCancel}>✕ Hủy</button>
                                </div>
                            )}

                            {/* Items */}
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#6B7280' }}>
                                CHI TIẾT HÀNG TRẢ ({returnItems.length})
                            </div>
                            <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 8 }}>
                                <table style={{ fontSize: 12 }}>
                                    <thead style={{ background: '#F3F4F6', position: 'sticky', top: 0 }}>
                                        <tr>
                                            <th>Sản phẩm</th>
                                            <th style={{ textAlign: 'right' }}>Dự kiến</th>
                                            <th style={{ textAlign: 'right' }}>Trả về</th>
                                            <th style={{ textAlign: 'right' }}>Nhận</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {returnItems.map(item => (
                                            <tr key={item.return_item_id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                                <td>
                                                    <div style={{ fontWeight: 500 }}>{item.product_name}</div>
                                                    <div style={{ color: '#9CA3AF', fontSize: 11 }}>{item.sku}</div>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>{Number(item.expected_qty || 0).toLocaleString('vi-VN')}</td>
                                                <td style={{ textAlign: 'right', color: '#F59E0B', fontWeight: 600 }}>
                                                    {Number(item.returned_qty || 0).toLocaleString('vi-VN')}
                                                </td>
                                                <td style={{ textAlign: 'right', color: '#059669', fontWeight: 600 }}>
                                                    {Number(item.received_qty || 0).toLocaleString('vi-VN')}
                                                </td>
                                                <td>
                                                    {selectedReturn.status === 'DRAFT' && (
                                                        <button
                                                            className="btn btn-xs btn-outline"
                                                            onClick={() => handleUpdateItem(item)}
                                                            disabled={savingItem === item.return_item_id}
                                                        >
                                                            {savingItem === item.return_item_id ? '...' : '✏️'}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
