import React, { useState, useEffect, useCallback } from 'react';
import { apiCall, fmt, StatusBadge } from '../api/client';

export default function WarehousePage({ token }) {
    const [warehouses, setWarehouses] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [selectedWh, setSelectedWh] = useState('');
    const [lowOnly, setLowOnly] = useState(false);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');

    // CRUD state
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [productForm, setProductForm] = useState({
        product_id: '', warehouse_id: '', quantity: 0, notes: ''
    });
    const [saving, setSaving] = useState(false);

    const loadWarehouses = useCallback(async () => {
        try {
            const data = await apiCall('GET', '/warehouse/warehouses', null, token);
            setWarehouses(Array.isArray(data) ? data : []);
        } catch (e) { setErr(e.message); }
    }, [token]);

    const loadInventory = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const qs = new URLSearchParams();
            if (selectedWh) qs.set('warehouse_id', selectedWh);
            if (lowOnly) qs.set('low_stock', 'true');
            const data = await apiCall('GET', '/warehouse/inventory?' + qs.toString(), null, token);
            setInventory(Array.isArray(data) ? data : []);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token, selectedWh, lowOnly]);

    useEffect(() => { if (token) loadWarehouses(); }, [token, loadWarehouses]);
    useEffect(() => { if (token) loadInventory(); }, [token, loadInventory]);

    // Fix undefined values
    const safeNum = (val, decimals = 0) => {
        const n = Number(val);
        return isNaN(n) ? (decimals > 0 ? '0.' + '0'.repeat(decimals) : '0') : n.toLocaleString('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    };

    const totalValue = inventory.reduce((sum, i) => sum + (Number(i.total_value) || 0), 0);
    const lowCount = inventory.filter(i => Number(i.quantity) <= Number(i.reorder_point || 0)).length;

    // CRUD handlers
    const handleOpenAdd = (item = null) => {
        if (item) {
            setEditingItem(item);
            setProductForm({
                product_id: item.product_id || '',
                warehouse_id: item.warehouse_id || '',
                quantity: Number(item.quantity) || 0,
                notes: ''
            });
        } else {
            setEditingItem(null);
            setProductForm({ product_id: '', warehouse_id: selectedWh || '', quantity: 0, notes: '' });
        }
        setShowModal(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editingItem) {
                // Update existing
                await apiCall('PUT', `/warehouse/inventory/${editingItem.inventory_id || editingItem.product_id}`, {
                    quantity: Number(productForm.quantity),
                    notes: productForm.notes
                }, token);
            } else {
                // Create new - would need backend endpoint
                alert('Tính năng thêm mới đang được phát triển. Vui lòng liên hệ admin.');
            }
            setShowModal(false);
            loadInventory();
        } catch (e) {
            setErr(e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (item) => {
        if (!confirm(`Xóa tồn kho của ${item.product_name}?`)) return;
        try {
            await apiCall('DELETE', `/warehouse/inventory/${item.inventory_id || item.product_id}`, null, token);
            loadInventory();
        } catch (e) {
            setErr(e.message);
        }
    };

    return (
        <div>
            <div className="card">
                <div className="card-header"><h3>🏭 Kho hàng</h3></div>
                <div className="card-body">
                    <div className="grid-3">
                        {warehouses.map(w => (
                            <div key={w.warehouse_id} style={{
                                border: '2px solid ' + (w.warehouse_type === 'CENTRAL' ? '#3B82F6' : '#10B981'),
                                borderRadius: 8, padding: 16,
                            }}>
                                <h4 style={{ margin: 0 }}>{w.warehouse_name}</h4>
                                <div className="text-sm text-muted">Mã: {w.warehouse_code}</div>
                                <div className="text-sm">Loại: <strong>{w.warehouse_type}</strong></div>
                                <div className="text-sm">📍 {w.address_line}, {w.province}</div>
                                <div className="text-sm">📐 {w.total_area_m2} m² | {w.capacity_m3} m³</div>
                                {w.is_default && <span className="badge" style={{ background: '#F59E0B', marginTop: 4 }}>MẶC ĐỊNH</span>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="card mt-16">
                <div className="card-header">
                    <h3>📦 Tồn kho ({inventory.length})</h3>
                    <div className="flex">
                        <select value={selectedWh} onChange={e => setSelectedWh(e.target.value)} style={{ padding: '6px 10px' }}>
                            <option value="">Tất cả kho</option>
                            {warehouses.map(w => <option key={w.warehouse_id} value={w.warehouse_id}>{w.warehouse_name}</option>)}
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px' }}>
                            <input type="checkbox" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} />
                            Chỉ sắp hết
                        </label>
                        <button className="btn btn-primary btn-sm" onClick={loadInventory}>Lọc</button>
                        <button className="btn btn-outline btn-sm" onClick={() => handleOpenAdd()} style={{ marginLeft: 8 }}>+ Thêm/Sửa</button>
                    </div>
                </div>
                <div className="card-body">
                    {err && <div className="alert alert-error">{err}</div>}
                    <div className="grid-3 mb-16">
                        <div style={{ background: '#EFF6FF', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                            <div className="text-sm text-muted">Tổng giá trị tồn kho</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#3B82F6' }}>{fmt.vnd(totalValue)}</div>
                        </div>
                        <div style={{ background: '#FEF3C7', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                            <div className="text-sm text-muted">Sản phẩm sắp hết</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#F59E0B' }}>{lowCount}</div>
                        </div>
                        <div style={{ background: '#F0FDF4', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                            <div className="text-sm text-muted">Tổng sản phẩm</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10B981' }}>{inventory.length}</div>
                        </div>
                    </div>
                    {loading ? <div>Đang tải...</div> : (
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>SKU</th><th>Tên SP</th><th>Kho</th>
                                        <th>SL</th><th>Đặt trước</th><th>Khả dụng</th>
                                        <th>Giá vốn TB</th><th>Giá trị</th><th>Trạng thái</th><th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {inventory.map((i, idx) => {
                                        const qty = Number(i.quantity) || 0;
                                        const reorderPt = Number(i.reorder_point) || 0;
                                        const avgCost = Number(i.avg_cost) || 0;
                                        const totalVal = Number(i.total_value) || 0;
                                        return (
                                        <tr key={idx}>
                                            <td><code>{i.sku || '—'}</code></td>
                                            <td><strong>{i.product_name || '—'}</strong></td>
                                            <td>{i.warehouse_name || '—'}</td>
                                            <td>{safeNum(qty, 0)}</td>
                                            <td>{safeNum(Number(i.reserved_qty) || 0, 0)}</td>
                                            <td>{safeNum(Number(i.available_qty) || 0, 0)}</td>
                                            <td>{avgCost > 0 ? fmt.vnd(avgCost) : '—'}</td>
                                            <td><strong>{totalVal > 0 ? fmt.vnd(totalVal) : '—'}</strong></td>
                                            <td>
                                                {qty <= 0 ? <StatusBadge s="OUT_OF_STOCK" /> :
                                                 qty <= reorderPt ? <StatusBadge s="LOW_STOCK" /> :
                                                 <StatusBadge s="OK" />}
                                            </td>
                                            <td>
                                                <button className="btn btn-sm btn-outline" onClick={() => handleOpenAdd(i)}>✏️</button>
                                                {' '}
                                                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(i)}>🗑️</button>
                                            </td>
                                        </tr>
                                    );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* CRUD Modal */}
            {showModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 400, maxWidth: '90vw' }}>
                        <h3 style={{ margin: '0 0 16px' }}>{editingItem ? '✏️ Sửa tồn kho' : '➕ Thêm tồn kho'}</h3>
                        <form onSubmit={handleSave}>
                            <div className="form-group">
                                <label>Tên sản phẩm</label>
                                <input type="text" value={editingItem?.product_name || '—'} disabled style={{ background: '#F3F4F6' }} />
                            </div>
                            <div className="form-group">
                                <label>Kho</label>
                                <input type="text" value={editingItem?.warehouse_name || '—'} disabled style={{ background: '#F3F4F6' }} />
                            </div>
                            <div className="form-group">
                                <label>Số lượng</label>
                                <input type="number" className="input" min="0" value={productForm.quantity} onChange={e => setProductForm(f => ({ ...f, quantity: Number(e.target.value) }))} required />
                            </div>
                            <div className="form-group">
                                <label>Ghi chú</label>
                                <textarea className="input" rows={2} value={productForm.notes} onChange={e => setProductForm(f => ({ ...f, notes: e.target.value }))} />
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Hủy</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

