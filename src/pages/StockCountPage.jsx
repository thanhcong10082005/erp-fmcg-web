import React, { useState, useEffect, useCallback } from 'react';
import { apiCall, fmt } from '../api/client';

/**
 * v13.1.1 - Trang Kiểm kê kho
 * Luồng: Tạo phiếu → Nhập số đếm → Duyệt → Tự sinh ledger adjustment
 */
export default function StockCountPage({ token }) {
    const [counts, setCounts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const [filter, setFilter] = useState({ status: '', warehouse_id: '' });
    const [warehouses, setWarehouses] = useState([]);

    // Detail view state
    const [selectedCount, setSelectedCount] = useState(null);
    const [countItems, setCountItems] = useState([]);
    const [savingItem, setSavingItem] = useState(null);

    // Create modal
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState({ warehouse_id: '', count_date: new Date().toISOString().split('T')[0], notes: '' });
    const [creating, setCreating] = useState(false);

    // Approve state
    const [approving, setApproving] = useState(false);

    // Load warehouses for filter & create
    const loadWarehouses = useCallback(async () => {
        try {
            const data = await apiCall('GET', '/warehouse/warehouses', null, token);
            setWarehouses(Array.isArray(data) ? data : []);
        } catch (e) { /* ignore */ }
    }, [token]);

    // Load stock counts list
    const loadCounts = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const qs = new URLSearchParams();
            if (filter.status) qs.set('status', filter.status);
            if (filter.warehouse_id) qs.set('warehouse_id', filter.warehouse_id);
            const data = await apiCall('GET', '/warehouse/stock-counts?' + qs.toString(), null, token);
            setCounts(Array.isArray(data) ? data : []);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token, filter]);

    useEffect(() => { if (token) { loadWarehouses(); loadCounts(); } }, [token, loadWarehouses, loadCounts]);

    // Open detail
    const handleOpenDetail = async (count) => {
        try {
            const data = await apiCall('GET', `/warehouse/stock-counts/${count.count_id}`, null, token);
            setSelectedCount(data);
            setCountItems(Array.isArray(data.items) ? data.items : []);
        } catch (e) { setErr(e.message); }
    };

    // Update counted_qty for 1 item
    const handleUpdateItem = async (item) => {
        setSavingItem(item.count_item_id);
        try {
            const val = Number(prompt(`Nhập số lượng đếm thực tế cho "${item.product_name}":`, item.counted_qty || item.system_qty));
            if (isNaN(val)) { setSavingItem(null); return; }
            const reason = prompt('Lý do chênh lệch (nếu có):', item.variance_reason || '');
            await apiCall('PUT', `/warehouse/stock-counts/${selectedCount.count_id}/items/${item.count_item_id}`, {
                counted_qty: val,
                variance_reason: reason
            }, token);
            // Refresh
            const updated = await apiCall('GET', `/warehouse/stock-counts/${selectedCount.count_id}`, null, token);
            setSelectedCount(updated);
            setCountItems(Array.isArray(updated.items) ? updated.items : []);
        } catch (e) { alert('Lỗi: ' + e.message); }
        finally { setSavingItem(null); }
    };

    // Batch update items
    const handleBatchUpdate = async () => {
        if (!selectedCount || selectedCount.status !== 'DRAFT') return;
        const allItems = countItems.map(i => {
            const newQty = prompt(`[${i.product_name}] Số lượng đếm (hệ thống: ${i.system_qty}):`, i.counted_qty || i.system_qty || 0);
            if (newQty === null) return null;
            return { ...i, new_counted_qty: Number(newQty) };
        }).filter(Boolean);

        if (allItems.length === 0) return;

        setSavingItem('batch');
        try {
            for (const item of allItems) {
                await apiCall('PUT', `/warehouse/stock-counts/${selectedCount.count_id}/items/${item.count_item_id}`, {
                    counted_qty: item.new_counted_qty
                }, token);
            }
            const updated = await apiCall('GET', `/warehouse/stock-counts/${selectedCount.count_id}`, null, token);
            setSelectedCount(updated);
            setCountItems(Array.isArray(updated.items) ? updated.items : []);
            alert('Đã cập nhật ' + allItems.length + ' mục');
        } catch (e) { alert('Lỗi: ' + e.message); }
        finally { setSavingItem(null); }
    };

    // Create new stock count
    const handleCreate = async (e) => {
        e.preventDefault();
        if (!createForm.warehouse_id) { alert('Vui lòng chọn kho'); return; }
        setCreating(true);
        try {
            const result = await apiCall('POST', '/warehouse/stock-counts', createForm, token);
            setShowCreate(false);
            setCreateForm({ warehouse_id: '', count_date: new Date().toISOString().split('T')[0], notes: '' });
            loadCounts();
            handleOpenDetail(result);
        } catch (e) { alert('Lỗi: ' + e.message); }
        finally { setCreating(false); }
    };

    // Approve stock count
    const handleApprove = async () => {
        if (!selectedCount) return;
        const varianceItems = countItems.filter(i => Number(i.variance_qty) !== 0);
        if (varianceItems.length === 0) {
            alert('Không có chênh lệch. Không cần duyệt.');
            return;
        }
        if (!confirm(`Xác nhận duyệt phiếu kiểm kê?\n\nSẽ sinh ${varianceItems.length} dòng điều chỉnh vào sổ kho.\n\nVí dụ:\n${varianceItems.slice(0, 3).map(i =>
    `• ${i.product_name}: ${i.system_qty} → ${i.counted_qty} (${i.variance_qty > 0 ? '+' : ''}${i.variance_qty})`
).join('\n')}${varianceItems.length > 3 ? '\n• ...' : ''}`)) return;

        setApproving(true);
        try {
            await apiCall('POST', `/warehouse/stock-counts/${selectedCount.count_id}/approve`, {}, token);
            const updated = await apiCall('GET', `/warehouse/stock-counts/${selectedCount.count_id}`, null, token);
            setSelectedCount(updated);
            setCountItems(Array.isArray(updated.items) ? updated.items : []);
            loadCounts();
            alert('Đã duyệt phiếu kiểm kê. Sổ kho đã được cập nhật.');
        } catch (e) { alert('Lỗi: ' + e.message); }
        finally { setApproving(false); }
    };

    // Cancel stock count
    const handleCancel = async () => {
        if (!selectedCount || selectedCount.status !== 'DRAFT') return;
        if (!confirm('Hủy phiếu kiểm kê này?')) return;
        try {
            await apiCall('POST', `/warehouse/stock-counts/${selectedCount.count_id}/cancel`, {}, token);
            setSelectedCount(null);
            loadCounts();
        } catch (e) { alert('Lỗi: ' + e.message); }
    };

    const statusBadge = (s) => {
        if (s === 'APPROVED') return <span style={{ background: '#D1FAE5', color: '#065F46', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>Đã duyệt</span>;
        if (s === 'CANCELLED') return <span style={{ background: '#FEE2E2', color: '#991B1B', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>Đã hủy</span>;
        return <span style={{ background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>Nháp</span>;
    };

    const varianceClass = (v) => {
        const n = Number(v);
        if (n > 0) return { color: '#059669', fontWeight: 700 }; // thừa
        if (n < 0) return { color: '#DC2626', fontWeight: 700 }; // thiếu
        return { color: '#6B7280' };
    };

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ margin: 0 }}>📋 Kiểm kê kho</h2>
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Tạo phiếu kiểm kê</button>
            </div>

            {/* Filters */}
            <div className="card mb-16">
                <div className="card-body" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label>
                        Kho:
                        <select className="input" style={{ marginLeft: 8 }} value={filter.warehouse_id} onChange={e => setFilter(f => ({ ...f, warehouse_id: e.target.value }))}>
                            <option value="">Tất cả kho</option>
                            {warehouses.map(w => <option key={w.warehouse_id} value={w.warehouse_id}>{w.warehouse_name}</option>)}
                        </select>
                    </label>
                    <label>
                        Trạng thái:
                        <select className="input" style={{ marginLeft: 8 }} value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
                            <option value="">Tất cả</option>
                            <option value="DRAFT">Nháp</option>
                            <option value="APPROVED">Đã duyệt</option>
                            <option value="CANCELLED">Đã hủy</option>
                        </select>
                    </label>
                    <button className="btn btn-outline btn-sm" onClick={loadCounts}>🔍 Lọc</button>
                </div>
            </div>

            {err && <div className="alert alert-error mb-16">{err}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: selectedCount ? '1fr 400px' : '1fr', gap: 16 }}>
                {/* Left: List */}
                <div className="card">
                    <div className="card-header"><h3>Danh sách phiếu kiểm kê</h3></div>
                    <div className="card-body">
                        {loading ? <div>Đang tải...</div> : counts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 24, color: '#9CA3AF' }}>
                                <div style={{ fontSize: 48 }}>📋</div>
                                <p>Chưa có phiếu kiểm kể nào</p>
                            </div>
                        ) : (
                            <table>
                                <thead>
                                    <tr>
                                        <th>Mã phiếu</th>
                                        <th>Ngày</th>
                                        <th>Kho</th>
                                        <th>SL SP</th>
                                        <th>Chênh lệch</th>
                                        <th>Trạng thái</th>
                                        <th>Người tạo</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {counts.map(c => (
                                        <tr key={c.count_id} style={{
                                            background: selectedCount?.count_id === c.count_id ? '#EFF6FF' : undefined,
                                            cursor: 'pointer'
                                        }} onClick={() => handleOpenDetail(c)}>
                                            <td><strong>{c.count_number}</strong></td>
                                            <td>{c.count_date}</td>
                                            <td>{c.warehouse_name}</td>
                                            <td>{c.item_count}</td>
                                            <td style={varianceClass(c.variance_count)}>
                                                {Number(c.variance_count) > 0 ? `⚠️ ${c.variance_count}` : '✓'}
                                            </td>
                                            <td>{statusBadge(c.status)}</td>
                                            <td>{c.created_by_name || c.created_by}</td>
                                            <td>
                                                <button className="btn btn-sm btn-outline" onClick={(e) => { e.stopPropagation(); handleOpenDetail(c); }}>👁️</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Right: Detail panel */}
                {selectedCount && (
                    <div className="card" style={{ position: 'sticky', top: 16, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
                        <div className="card-header">
                            <h3 style={{ margin: 0 }}>📝 Chi tiết: {selectedCount.count_number}</h3>
                        </div>
                        <div className="card-body">
                            {/* Summary */}
                            <div style={{ background: '#F9FAFB', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                                    <div><strong>Kho:</strong> {selectedCount.warehouse_name}</div>
                                    <div><strong>Ngày:</strong> {selectedCount.count_date}</div>
                                    <div><strong>Trạng thái:</strong> {statusBadge(selectedCount.status)}</div>
                                    <div><strong>Người tạo:</strong> {selectedCount.created_by_name || selectedCount.created_by}</div>
                                    {selectedCount.approved_by && (
                                        <>
                                            <div><strong>Duyệt bởi:</strong> {selectedCount.approved_by}</div>
                                            <div><strong>Ngày duyệt:</strong> {selectedCount.approved_at ? new Date(selectedCount.approved_at).toLocaleString('vi-VN') : ''}</div>
                                        </>
                                    )}
                                </div>
                                {selectedCount.notes && <div style={{ marginTop: 8, fontStyle: 'italic', color: '#6B7280' }}>📝 {selectedCount.notes}</div>}
                            </div>

                            {/* Variance stats */}
                            {(() => {
                                const variances = countItems.filter(i => Number(i.variance_qty) !== 0);
                                const totalVariance = variances.reduce((s, i) => s + Number(i.variance_qty), 0);
                                return (
                                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                        <div style={{ flex: 1, background: totalVariance > 0 ? '#D1FAE5' : totalVariance < 0 ? '#FEE2E2' : '#F3F4F6', padding: 8, borderRadius: 6, textAlign: 'center', fontSize: 12 }}>
                                            <div>Chênh lệch</div>
                                            <strong style={{ fontSize: 16 }}>{totalVariance > 0 ? '+' : ''}{totalVariance}</strong>
                                        </div>
                                        <div style={{ flex: 1, background: '#FEF3C7', padding: 8, borderRadius: 6, textAlign: 'center', fontSize: 12 }}>
                                            <div>SP lệch</div>
                                            <strong style={{ fontSize: 16 }}>{variances.length}</strong>
                                        </div>
                                        <div style={{ flex: 1, background: '#EFF6FF', padding: 8, borderRadius: 6, textAlign: 'center', fontSize: 12 }}>
                                            <div>Tổng SP</div>
                                            <strong style={{ fontSize: 16 }}>{countItems.length}</strong>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Actions */}
                            {selectedCount.status === 'DRAFT' && (
                                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                    <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={handleBatchUpdate} disabled={savingItem !== null}>
                                        {savingItem === 'batch' ? '⏳...' : '📝 Nhập số đếm'}
                                    </button>
                                    <button className="btn btn-success btn-sm" style={{ flex: 1 }} onClick={handleApprove} disabled={approving}>
                                        {approving ? '⏳...' : '✅ Duyệt & Điều chỉnh'}
                                    </button>
                                    <button className="btn btn-danger btn-sm" onClick={handleCancel}>✕</button>
                                </div>
                            )}

                            {/* Items table */}
                            <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 8 }}>
                                <table style={{ fontSize: 12 }}>
                                    <thead style={{ background: '#F3F4F6', position: 'sticky', top: 0 }}>
                                        <tr>
                                            <th>SP</th>
                                            <th>Đơn vị</th>
                                            <th style={{ textAlign: 'right' }}>Hệ thống</th>
                                            <th style={{ textAlign: 'right' }}>Đếm</th>
                                            <th style={{ textAlign: 'right' }}>Chênh</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {countItems.map(item => {
                                            const v = Number(item.variance_qty);
                                            return (
                                                <tr key={item.count_item_id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                                    <td>
                                                        <div style={{ fontWeight: 500 }}>{item.product_name}</div>
                                                        <div style={{ color: '#9CA3AF', fontSize: 11 }}>{item.sku}</div>
                                                    </td>
                                                    <td>{item.unit_name}</td>
                                                    <td style={{ textAlign: 'right' }}>{Number(item.system_qty).toLocaleString('vi-VN')}</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{Number(item.counted_qty).toLocaleString('vi-VN')}</td>
                                                    <td style={{ textAlign: 'right', ...varianceClass(v) }}>
                                                        {v !== 0 ? (v > 0 ? '+' : '') + v : '—'}
                                                    </td>
                                                    <td>
                                                        {selectedCount.status === 'DRAFT' && (
                                                            <button
                                                                className="btn btn-xs btn-outline"
                                                                onClick={() => handleUpdateItem(item)}
                                                                disabled={savingItem === item.count_item_id}
                                                                title="Cập nhật số đếm"
                                                            >
                                                                {savingItem === item.count_item_id ? '...' : '✏️'}
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Create Modal */}
            {showCreate && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 450, maxWidth: '90vw' }}>
                        <h3 style={{ margin: '0 0 16px' }}>📋 Tạo phiếu kiểm kê</h3>
                        <form onSubmit={handleCreate}>
                            <div className="form-group">
                                <label>Kho <span style={{ color: 'red' }}>*</span></label>
                                <select className="input" value={createForm.warehouse_id}
                                    onChange={e => setCreateForm(f => ({ ...f, warehouse_id: e.target.value }))} required>
                                    <option value="">— Chọn kho —</option>
                                    {warehouses.map(w => <option key={w.warehouse_id} value={w.warehouse_id}>{w.warehouse_name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Ngày kiểm kê</label>
                                <input type="date" className="input" value={createForm.count_date}
                                    onChange={e => setCreateForm(f => ({ ...f, count_date: e.target.value }))} />
                            </div>
                            <div className="form-group">
                                <label>Ghi chú</label>
                                <textarea className="input" rows={2} value={createForm.notes}
                                    onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))}
                                    placeholder="Ví dụ: Kiểm kê định kỳ tháng 7..." />
                            </div>
                            <div style={{ background: '#FEF3C7', padding: 10, borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
                                💡 Hệ thống sẽ tự động lấy số tồn kho hiện tại từ sổ kho làm "Số lượng hệ thống".
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button type="button" className="btn btn-outline" onClick={() => setShowCreate(false)}>Hủy</button>
                                <button type="submit" className="btn btn-primary" disabled={creating}>
                                    {creating ? '⏳ Đang tạo...' : '✅ Tạo phiếu'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
