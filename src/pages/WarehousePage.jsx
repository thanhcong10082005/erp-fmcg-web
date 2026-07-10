import React, { useState, useEffect, useCallback } from 'react';
import { apiCall, fmt, StatusBadge } from '../api/client';

export default function WarehousePage({ token }) {
    const [warehouses, setWarehouses] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [selectedWh, setSelectedWh] = useState('');
    const [lowOnly, setLowOnly] = useState(false);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');

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

    const totalValue = inventory.reduce((sum, i) => sum + parseFloat(i.total_value || 0), 0);
    const lowCount = inventory.filter(i => parseFloat(i.quantity) <= parseFloat(i.reorder_point || 0)).length;

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
                                        <th>Giá vốn TB</th><th>Giá trị</th><th>Trạng thái</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {inventory.map((i, idx) => (
                                        <tr key={idx}>
                                            <td><code>{i.sku}</code></td>
                                            <td><strong>{i.product_name}</strong></td>
                                            <td>{i.warehouse_name}</td>
                                            <td>{i.quantity}</td>
                                            <td>{i.reserved_qty}</td>
                                            <td>{i.available_qty}</td>
                                            <td>{fmt.vnd(i.avg_cost)}</td>
                                            <td><strong>{fmt.vnd(i.total_value)}</strong></td>
                                            <td>
                                                {parseFloat(i.quantity) <= 0 ? <StatusBadge s="OUT_OF_STOCK" /> :
                                                 parseFloat(i.quantity) <= parseFloat(i.reorder_point || 0) ? <StatusBadge s="LOW_STOCK" /> :
                                                 <StatusBadge s="OK" />}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

