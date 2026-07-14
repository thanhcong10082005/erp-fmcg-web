import React, { useState, useEffect, useCallback } from 'react';
import { apiCall, fmt, StatusBadge } from '../api/client';

const ORDER_STATUSES = ['DRAFT', 'CONFIRMED', 'PENDING', 'DELIVERING', 'DELIVERED', 'INVOICED', 'CLOSED', 'CANCELLED'];

const EMPTY_ITEM = () => ({ product_id: '', product_name: '', quantity: 1, unit_id: 1, unit_name: '', unit_price: 0, discount_pct: 0, tax_id: 2, tax_rate: 10, line_subtotal: 0, line_total: 0 });

export default function SalesOrdersPage({ token }) {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [selected, setSelected] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);

    // Create-order form state
    const [partners, setPartners] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [products, setProducts] = useState([]);
    const [partnerSearch, setPartnerSearch] = useState('');
    const [productSearch, setProductSearch] = useState('');
    // Per-row product search state: productSearchIdx[idx] = search string for row idx
    const [productSearchIdx, setProductSearchIdx] = useState({});
    // Track which product dropdown is open (idx or null)
    const [openProductDropdown, setOpenProductDropdown] = useState(null);
    // Store selected partner display string (survives partners array clear)
    const [selectedPartnerDisplay, setSelectedPartnerDisplay] = useState('');

    // Close product dropdowns when clicking outside the form
    useEffect(() => {
        if (!showForm) return;
        const handleClick = (e) => {
            if (!e.target.closest('.order-form-body')) {
                setOpenProductDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showForm]);
    const [form, setForm] = useState({
        partner_id: '', warehouse_id: 1,
        expected_date: '', notes: '',
        items: [EMPTY_ITEM()],
    });
    const [formErr, setFormErr] = useState('');

    const load = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const qs = new URLSearchParams();
            if (statusFilter) qs.set('status', statusFilter);
            const data = await apiCall('GET', '/sales/orders?' + qs.toString(), null, token);
            setOrders(Array.isArray(data) ? data : []);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token, statusFilter]);

    useEffect(() => { if (token) load(); }, [token, load]);

    const loadPartners = useCallback(async () => {
        try {
            const qs = new URLSearchParams(); qs.set('limit', '500');
            if (partnerSearch) qs.set('search', partnerSearch);
            const data = await apiCall('GET', '/partners?' + qs.toString(), null, token);
            setPartners(Array.isArray(data) ? data : (data?.data ?? []));
        } catch (e) { /* ignore */ }
    }, [token, partnerSearch]);

    const loadWarehouses = useCallback(async () => {
        try {
            const data = await apiCall('GET', '/warehouse/warehouses', null, token);
            setWarehouses(Array.isArray(data) ? data : (data?.data ?? []));
        } catch (e) { /* ignore */ }
    }, [token]);

    const loadProducts = useCallback(async () => {
        try {
            // Load all products at once (client-side filter by productSearchIdx per row)
            const qs = new URLSearchParams(); qs.set('limit', '5000');
            const data = await apiCall('GET', '/products?' + qs.toString(), null, token);
            setProducts(Array.isArray(data) ? data : (data?.data ?? []));
        } catch (e) { /* ignore */ }
    }, [token]);

    const openCreate = async () => {
        setForm({ partner_id: '', warehouse_id: 1, expected_date: '', notes: '', items: [EMPTY_ITEM()] });
        setFormErr('');
        setPartnerSearch(''); setProductSearch('');
        setProductSearchIdx({});
        setOpenProductDropdown(null);
        setSelectedPartnerDisplay('');
        await Promise.all([loadWarehouses(), loadProducts()]);
        await loadPartners();
        setShowForm(true);
    };

    const viewDetail = async (id) => {
        try {
            const data = await apiCall('GET', `/sales/orders/${id}`, null, token);
            setSelected(data);
        } catch (e) { setErr(e.message); }
    };

    const handleAction = async (id, action) => {
        if (!confirm(`Thực hiện thao tác "${action}" cho đơn này?`)) return;
        try {
            await apiCall('PUT', `/sales/orders/${id}/${action}`, null, token);
            load();
            if (selected?.so_id === id) viewDetail(id);
        } catch (e) { alert(e.message); }
    };

    // ── Line item helpers ──
    const calcItem = (item) => {
        const sub = (item.quantity || 0) * (item.unit_price || 0);
        const disc = sub * ((item.discount_pct || 0) / 100);
        const net = sub - disc;
        const tax = net * ((item.tax_rate || 10) / 100);
        return { line_subtotal: sub, line_total: net + tax };
    };

    const updateItem = (idx, changes) => {
        setForm(f => {
            const items = f.items.map((it, i) => i === idx ? { ...it, ...changes } : it);
            return { ...f, items };
        });
    };

    const addItem = () => setForm(f => ({ ...f, items: [...f.items, EMPTY_ITEM()] }));
    const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

    const handleProductSelect = (idx, product_id) => {
        // product_id from <select> is always a string; API also returns
        // product_id as string. Compare strings to avoid 84 !== "84".
        const pidStr = String(product_id);
        const p = products.find(x => String(x.product_id) === pidStr);
        if (!p) return;
        const price = parseFloat(p.selling_price) || 0;
        updateItem(idx, {
            product_id: p.product_id,
            product_name: p.product_name,
            unit_id: 1,
            unit_name: p.base_unit_name || p.base_unit_code || 'Cái',
            unit_price: price,
            ...calcItem({ quantity: 1, unit_price: price, discount_pct: 0, tax_rate: 10 }),
        });
    };

    const orderTotals = () => {
        let subtotal = 0, discount = 0, tax = 0, total = 0;
        form.items.forEach(it => {
            const sub = (it.quantity || 0) * (it.unit_price || 0);
            const disc = sub * ((it.discount_pct || 0) / 100);
            const net = sub - disc;
            const tx = net * ((it.tax_rate || 10) / 100);
            subtotal += sub; discount += disc; tax += tx; total += net + tx;
        });
        return { subtotal, discount, tax, total };
    };

    const handleSubmitOrder = async (e) => {
        e.preventDefault();
        setFormErr('');
        if (!form.partner_id) return setFormErr('Chọn khách hàng');
        if (!form.items.some(it => it.product_id && it.quantity > 0))
            return setFormErr('Thêm ít nhất 1 sản phẩm');

        setSaving(true);
        try {
            const payload = {
                partner_id: parseInt(form.partner_id),
                warehouse_id: parseInt(form.warehouse_id) || 1,
                expected_date: form.expected_date || null,
                notes: form.notes || null,
                items: form.items
                    .filter(it => it.product_id && it.quantity > 0)
                    .map(it => {
                        const { line_subtotal, line_total } = calcItem(it);
                        return {
                            product_id: parseInt(it.product_id) || it.product_id,
                            quantity: parseFloat(it.quantity) || 0,
                            unit_id: parseInt(it.unit_id) || 1,
                            unit_price: parseFloat(it.unit_price) || 0,
                            discount_pct: parseFloat(it.discount_pct) || 0,
                            tax_id: parseInt(it.tax_id) || 2,
                            tax_rate: parseFloat(it.tax_rate) || 10,
                        };
                    }),
            };
            await apiCall('POST', '/sales/orders', payload, token);
            setShowForm(false);
            load();
        } catch (e) { setFormErr(e.message); }
        finally { setSaving(false); }
    };

    const t = orderTotals();

    return (
        <div>
            <div className="card">
                <div className="card-header">
                    <h3>🛒 Đơn bán hàng ({orders.length})</h3>
                    <div className="flex">
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '6px 10px' }}>
                            <option value="">Tất cả trạng thái</option>
                            {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button className="btn btn-primary btn-sm" onClick={load}>Lọc</button>
                        <button className="btn btn-success btn-sm" onClick={openCreate}>➕ Tạo đơn hàng</button>
                    </div>
                </div>
                <div className="card-body">
                    {err && <div className="alert alert-error">{err}</div>}
                    {loading ? <div>Đang tải...</div> : (
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Số SO</th><th>Ngày</th><th>Khách hàng</th>
                                        <th>Kho</th><th>Tổng tiền</th><th>Đã thu</th>
                                        <th>TT thanh toán</th><th>Trạng thái</th><th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orders.map(o => (
                                        <tr key={o.so_id}>
                                            <td><code>{o.so_number}</code></td>
                                            <td>{fmt.dateOnly(o.order_date)}</td>
                                            <td><strong>{o.partner_name}</strong><br/>
                                                <span className="text-sm text-muted">{o.partner_code}</span>
                                            </td>
                                            <td>{o.warehouse_name}</td>
                                            <td><strong>{fmt.vnd(o.total_amount)}</strong></td>
                                            <td>{fmt.vnd(o.paid_amount)}</td>
                                            <td><StatusBadge s={o.payment_status} /></td>
                                            <td><StatusBadge s={o.status} /></td>
                                            <td>
                                                <button className="btn btn-sm btn-outline" onClick={() => viewDetail(o.so_id)}>👁️</button>
                                                {o.status === 'DRAFT' && <button className="btn btn-sm btn-success" onClick={() => handleAction(o.so_id, 'confirm')}>✓ Duyệt</button>}
                                                {o.status === 'CONFIRMED' && <button className="btn btn-sm btn-primary" onClick={() => handleAction(o.so_id, 'deliver')}>🚚 Giao hàng</button>}
                                                {['DRAFT', 'CONFIRMED'].includes(o.status) && <button className="btn btn-sm btn-danger" onClick={() => handleAction(o.so_id, 'cancel')}>✗ Hủy</button>}
                                            </td>
                                        </tr>
                                    ))}
                                    {orders.length === 0 && (
                                        <tr><td colSpan={9} style={{ textAlign: 'center', padding: 20, color: '#6B7280' }}>Không có đơn hàng</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Order Detail ── */}
            {selected && (
                <div className="card mt-16">
                    <div className="card-header">
                        <h3>📄 Chi tiết đơn {selected.so_number}</h3>
                        <div className="flex">
                            {selected.status === 'DRAFT' && <button className="btn btn-success btn-sm" onClick={() => { handleAction(selected.so_id, 'confirm'); }}>✓ Duyệt đơn</button>}
                            {selected.status === 'CONFIRMED' && <button className="btn btn-primary btn-sm" onClick={() => { handleAction(selected.so_id, 'deliver'); }}>🚚 Giao hàng</button>}
                            {['DRAFT', 'CONFIRMED'].includes(selected.status) && <button className="btn btn-danger btn-sm" onClick={() => { handleAction(selected.so_id, 'cancel'); }}>✗ Hủy</button>}
                            <button className="btn btn-outline btn-sm" onClick={() => setSelected(null)}>✕</button>
                        </div>
                    </div>
                    <div className="card-body">
                        <div className="grid-3 mb-16">
                            <div><strong>Khách:</strong> {selected.partner_name} ({selected.partner_code})</div>
                            <div><strong>Phone:</strong> {selected.partner_phone || '—'}</div>
                            <div><strong>Kho:</strong> {selected.warehouse_name}</div>
                            <div><strong>Ngày đặt:</strong> {fmt.date(selected.order_date)}</div>
                            <div><strong>Ngày giao dự kiến:</strong> {fmt.dateOnly(selected.expected_date)}</div>
                            <div><strong>Trạng thái:</strong> <StatusBadge s={selected.status} /> / <StatusBadge s={selected.payment_status} /></div>
                        </div>
                        <h4>Sản phẩm</h4>
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr><th>#</th><th>SKU</th><th>Tên</th><th>SL</th><th>Đơn giá</th><th>CK%</th><th>Thuế</th><th>Thành tiền</th></tr>
                                </thead>
                                <tbody>
                                    {selected.items?.map(it => (
                                        <tr key={it.so_item_id}>
                                            <td>{it.line_number}</td>
                                            <td><code>{it.sku}</code></td>
                                            <td>{it.product_name}</td>
                                            <td>{it.quantity} {it.unit_name}</td>
                                            <td>{fmt.vnd(it.unit_price)}</td>
                                            <td>{it.discount_pct}%</td>
                                            <td>{it.tax_code || 'VAT'} {it.rate_percent ? `(${it.rate_percent}%)` : ''}</td>
                                            <td><strong>{fmt.vnd(it.line_total)}</strong></td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr><td colSpan={7} style={{ textAlign: 'right' }}>Subtotal:</td><td>{fmt.vnd(selected.subtotal)}</td></tr>
                                    <tr><td colSpan={7} style={{ textAlign: 'right' }}>Chiết khấu:</td><td style={{ color: '#10B981' }}>-{fmt.vnd(selected.discount_amount)}</td></tr>
                                    <tr><td colSpan={7} style={{ textAlign: 'right' }}>Thuế:</td><td>{fmt.vnd(selected.tax_amount)}</td></tr>
                                    <tr style={{ background: '#F0FDF4' }}><td colSpan={7} style={{ textAlign: 'right', fontWeight: 800 }}>TỔNG CỘNG:</td><td><strong style={{ color: '#10B981' }}>{fmt.vnd(selected.total_amount)}</strong></td></tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Create Order Modal ── */}
            {showForm && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.6)', display: 'flex',
                    alignItems: 'flex-start', justifyContent: 'center',
                    zIndex: 1000, padding: 16, overflow: 'auto',
                }}>
                    <div style={{
                        background: '#fff', borderRadius: 12,
                        width: '100%', maxWidth: 860,
                        margin: '16px auto',
                    }}>
                        <div style={{
                            padding: '16px 24px', borderBottom: '1px solid #E5E7EB',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            position: 'sticky', top: 0, background: '#fff', zIndex: 2, borderRadius: '12px 12px 0 0',
                        }}>
                            <h3 style={{ margin: 0 }}>🛒 Tạo đơn hàng mới</h3>
                            <button className="btn btn-outline btn-sm" onClick={() => setShowForm(false)}>✕ Đóng</button>
                        </div>

                        <form onSubmit={handleSubmitOrder} className="order-form-body" style={{ padding: 24 }}>
                            {formErr && <div className="alert alert-error" style={{ marginBottom: 16 }}>{formErr}</div>}

                            {/* Header row */}
                            <div className="grid-3" style={{ marginBottom: 20 }}>
                                {/* ── Khách hàng: search + custom dropdown + geo badge ── */}
                                <div className="form-group">
                                    <label>Khách hàng *</label>
                                    <div className="order-form-body" style={{ position: 'relative' }}>
                                        <input
                                            type="text"
                                            readOnly
                                            value={
                                                form.partner_id
                                                    ? selectedPartnerDisplay
                                                    : partnerSearch
                                            }
                                            placeholder="🔎 Tìm mã / tên ASO..."
                                            onChange={e => {
                                                setPartnerSearch(e.target.value);
                                                if (form.partner_id) {
                                                    setForm(f => ({ ...f, partner_id: '' }));
                                                    setSelectedPartnerDisplay('');
                                                }
                                                loadPartners();
                                            }}
                                            onFocus={() => {
                                                if (partners.length === 0) loadPartners();
                                            }}
                                            style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem', cursor: 'pointer', background: '#fff' }}
                                        />
                                        {/* Dropdown */}
                                        {partners.length > 0 && (
                                            <div style={{
                                                position: 'absolute', top: '100%', left: 0, right: 0,
                                                zIndex: 100, background: '#fff',
                                                border: '1px solid #D1D5DB', borderRadius: 4,
                                                maxHeight: 280, overflowY: 'auto',
                                                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                                            }}>
                                                {partners.map(p => (
                                                    <div
                                                        key={p.partner_id}
                                                        onClick={() => {
                                                            setForm(f => ({ ...f, partner_id: p.partner_id }));
                                                            setSelectedPartnerDisplay(`${p.partner_code} — ${p.partner_name} (${p.partner_type})`);
                                                            setPartnerSearch('');
                                                            setPartners([]);
                                                        }}
                                                        style={{
                                                            padding: '7px 12px', cursor: 'pointer',
                                                            borderBottom: '1px solid #F3F4F6',
                                                            fontSize: '0.82rem',
                                                            background: String(form.partner_id) === String(p.partner_id) ? '#EFF6FF' : 'transparent',
                                                        }}
                                                        onMouseEnter={e => { if (String(form.partner_id) !== String(p.partner_id)) e.currentTarget.style.background = '#F9FAFB'; }}
                                                        onMouseLeave={e => { if (String(form.partner_id) !== String(p.partner_id)) e.currentTarget.style.background = 'transparent'; }}
                                                    >
                                                        <div style={{ fontWeight: 600 }}>{p.partner_code} — {p.partner_name}</div>
                                                        <div style={{ color: '#6B7280', fontSize: '0.75rem', marginTop: 1 }}>
                                                            {p.partner_type}
                                                            {' '}
                                                            {p.geocoding_confidence === 'HIGH' || p.geocoding_confidence === 'MANUAL' ? '✅ Tọa độ tốt'
                                                                : p.geocoding_confidence === 'MEDIUM' ? '○ TB'
                                                                : p.geocoding_confidence === 'LOW' ? '⚠️ Yếu'
                                                                : '❌ Chưa có tọa độ'}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {form.partner_id && (() => {
                                        const sel = partners.find(p => String(p.partner_id) === String(form.partner_id));
                                        return sel ? (
                                            <div style={{
                                                marginTop: 4, padding: '4px 8px', borderRadius: 4, fontSize: '0.78rem',
                                                background: (sel.geocoding_confidence === 'HIGH' || sel.geocoding_confidence === 'MANUAL') ? '#DCFCE7'
                                                    : sel.geocoding_confidence === 'MEDIUM' ? '#FEF9C3'
                                                    : sel.geocoding_confidence === 'LOW' ? '#FEF3C7'
                                                    : '#FEE2E2',
                                                color: (sel.geocoding_confidence === 'HIGH' || sel.geocoding_confidence === 'MANUAL') ? '#166534'
                                                    : sel.geocoding_confidence === 'MEDIUM' ? '#854D0E'
                                                    : sel.geocoding_confidence === 'LOW' ? '#92400E'
                                                    : '#991B1B',
                                            }}>
                                                {(sel.geocoding_confidence === 'HIGH' || sel.geocoding_confidence === 'MANUAL') ? '✅ Tọa độ tốt' : sel.geocoding_confidence === 'MEDIUM' ? '○ Tọa độ trung bình' : sel.geocoding_confidence === 'LOW' ? '⚠️ Tọa độ yếu' : '❌ Chưa có tọa độ'}
                                            </div>
                                        ) : null;
                                    })()}
                                </div>
                                <div className="form-group">
                                    <label>Kho xuất *</label>
                                    <select value={form.warehouse_id}
                                        onChange={e => setForm(f => ({ ...f, warehouse_id: e.target.value }))}>
                                        {warehouses.map(w => (
                                            <option key={w.warehouse_id} value={w.warehouse_id}>{w.warehouse_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Ngày giao dự kiến</label>
                                    <input type="date" value={form.expected_date}
                                        onChange={e => setForm(f => ({ ...f, expected_date: e.target.value }))} />
                                </div>
                            </div>

                            {/* Line items */}
                            <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                                <div style={{
                                    background: '#F9FAFB', padding: '10px 16px',
                                    borderBottom: '1px solid #E5E7EB', display: 'flex',
                                    justifyContent: 'space-between', alignItems: 'center',
                                }}>
                                    <strong>📦 Sản phẩm ({form.items.length})</strong>
                                    <button type="button" className="btn btn-sm btn-primary" onClick={addItem}>➕ Thêm dòng</button>
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', tableLayout: 'fixed' }}>
                                    <thead>
                                        <tr style={{ background: '#F3F4F6' }}>
                                            <th style={{ padding: '6px 8px', textAlign: 'left', width: 32 }}>#</th>
                                            <th style={{ padding: '6px 8px', textAlign: 'left', minWidth: 360, width: 'auto' }}>Sản phẩm *</th>
                                            <th style={{ padding: '6px 8px', textAlign: 'right', width: 60 }}>SL</th>
                                            <th style={{ padding: '6px 8px', textAlign: 'left', width: 60 }}>Đơn vị</th>
                                            <th style={{ padding: '6px 8px', textAlign: 'right', width: 100 }}>Đơn giá</th>
                                            <th style={{ padding: '6px 8px', textAlign: 'right', width: 56 }}>CK%</th>
                                            <th style={{ padding: '6px 8px', textAlign: 'left', width: 70 }}>Thuế</th>
                                            <th style={{ padding: '6px 8px', textAlign: 'right', width: 110 }}>Thành tiền</th>
                                            <th style={{ padding: '6px 8px', width: 32 }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {form.items.map((it, idx) => {
                                            const { line_subtotal, line_total } = calcItem(it);
                                            const selectedProduct = it.product_id
                                                ? products.find(x => String(x.product_id) === String(it.product_id))
                                                : null;
                                            return (
                                                <tr key={idx} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                                    <td style={{ padding: '6px 8px', color: '#6B7280' }}>{idx + 1}</td>
                                                    <td style={{ padding: '4px 4px' }}>
                                                        <div style={{ position: 'relative' }}>
                                                            {/* Show selected product name or search input */}
                                                            <div
                                                                onClick={() => {
                                                                    const isOpen = openProductDropdown === idx;
                                                                    setOpenProductDropdown(isOpen ? null : idx);
                                                                    if (products.length === 0) loadProducts();
                                                                }}
                                                                style={{
                                                                    width: '100%', padding: '4px 8px', fontSize: '0.82rem',
                                                                    border: '1px solid #D1D5DB', borderRadius: 4,
                                                                    cursor: 'pointer', background: '#fff',
                                                                    minHeight: 30, display: 'flex', alignItems: 'center',
                                                                    color: selectedProduct ? '#111827' : '#9CA3AF',
                                                                    userSelect: 'none',
                                                                }}
                                                            >
                                                                {selectedProduct
                                                                    ? <span><span style={{ color: '#059669', marginRight: 4 }}>✓</span>{selectedProduct.sku} — {selectedProduct.product_name}</span>
                                                                    : <span>🔎 Tìm SKU / tên SP...</span>
                                                                }
                                                            </div>
                                                            {/* Dropdown */}
                                                            {openProductDropdown === idx && (
                                                                <div style={{
                                                                    position: 'absolute', top: '100%', left: 0, right: 0,
                                                                    zIndex: 200, background: '#fff',
                                                                    border: '1px solid #D1D5DB', borderRadius: 4,
                                                                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                                                                    maxHeight: 240, overflowY: 'auto',
                                                                }}>
                                                                    {/* Inline search inside dropdown */}
                                                                    <div style={{ padding: '4px 6px', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                                                                        <input
                                                                            autoFocus
                                                                            type="text"
                                                                            value={productSearchIdx[idx] || ''}
                                                                            placeholder="Tìm..."
                                                                            onChange={e => setProductSearchIdx(prev => ({ ...prev, [idx]: e.target.value }))}
                                                                            style={{ width: '100%', padding: '3px 6px', fontSize: '0.80rem', border: '1px solid #E5E7EB', borderRadius: 3 }}
                                                                        />
                                                                    </div>
                                                                    {products
                                                                        .filter(p => {
                                                                            const q = (productSearchIdx[idx] || '').toLowerCase();
                                                                            if (!q) return true;
                                                                            return (p.sku || '').toLowerCase().includes(q) ||
                                                                                (p.product_name || '').toLowerCase().includes(q);
                                                                        })
                                                                        .map(p => (
                                                                            <div
                                                                                key={p.product_id}
                                                                                onClick={() => {
                                                                                    handleProductSelect(idx, p.product_id);
                                                                                    setProductSearchIdx(prev => ({ ...prev, [idx]: '' }));
                                                                                    setOpenProductDropdown(null);
                                                                                }}
                                                                                style={{
                                                                                    padding: '6px 10px', cursor: 'pointer',
                                                                                    borderBottom: '1px solid #F3F4F6',
                                                                                    fontSize: '0.80rem',
                                                                                    background: String(it.product_id) === String(p.product_id) ? '#EFF6FF' : 'transparent',
                                                                                }}
                                                                                onMouseEnter={e => { if (String(it.product_id) !== String(p.product_id)) e.currentTarget.style.background = '#F9FAFB'; }}
                                                                                onMouseLeave={e => { if (String(it.product_id) !== String(p.product_id)) e.currentTarget.style.background = 'transparent'; }}
                                                                            >
                                                                                <div style={{ fontWeight: 600 }}>{p.sku}</div>
                                                                                <div style={{ color: '#374151' }}>{p.product_name}</div>
                                                                                <div style={{ color: '#059669', fontSize: '0.75rem' }}>{fmt.vnd(p.selling_price)}</div>
                                                                            </div>
                                                                        ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '4px 4px' }}>
                                                        <input type="number" value={it.quantity} min="0" step="1"
                                                            onChange={e => updateItem(idx, { quantity: parseFloat(e.target.value) || 0, ...calcItem({ ...it, quantity: parseFloat(e.target.value) || 0 }) })}
                                                            style={{ width: '100%', padding: '4px 6px', fontSize: '0.85rem', textAlign: 'right' }} />
                                                    </td>
                                                    <td style={{ padding: '4px 4px' }}>
                                                        <span style={{ fontSize: '0.8rem' }}>{it.unit_name || '—'}</span>
                                                    </td>
                                                    <td style={{ padding: '4px 4px' }}>
                                                        <input type="number" value={it.unit_price} min="0" step="100"
                                                            onChange={e => updateItem(idx, { unit_price: parseFloat(e.target.value) || 0, ...calcItem({ ...it, unit_price: parseFloat(e.target.value) || 0 }) })}
                                                            style={{ width: '100%', padding: '4px 6px', fontSize: '0.85rem', textAlign: 'right' }} />
                                                    </td>
                                                    <td style={{ padding: '4px 4px' }}>
                                                        <input type="number" value={it.discount_pct} min="0" max="100" step="1"
                                                            onChange={e => updateItem(idx, { discount_pct: parseFloat(e.target.value) || 0, ...calcItem({ ...it, discount_pct: parseFloat(e.target.value) || 0 }) })}
                                                            style={{ width: '100%', padding: '4px 6px', fontSize: '0.85rem', textAlign: 'right' }} />
                                                    </td>
                                                    <td style={{ padding: '4px 4px' }}>
                                                        <select value={it.tax_id || 2}
                                                            onChange={e => updateItem(idx, { tax_id: parseInt(e.target.value), tax_rate: e.target.value === '1' ? 8 : 10, ...calcItem({ ...it, tax_id: parseInt(e.target.value), tax_rate: e.target.value === '1' ? 8 : 10 }) })}>
                                                            <option value="2">VAT 10%</option>
                                                            <option value="1">VAT 8%</option>
                                                        </select>
                                                    </td>
                                                    <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600, color: '#10B981' }}>
                                                        {fmt.vnd(line_total)}
                                                    </td>
                                                    <td style={{ padding: '4px 4px' }}>
                                                        {form.items.length > 1 && (
                                                            <button type="button" className="btn btn-sm btn-danger"
                                                                onClick={() => removeItem(idx)}>✕</button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Ghi chú (bên dưới products table để không che dropdown) */}
                            <div className="form-group order-form-body" style={{ marginBottom: 20 }}>
                                <label>Ghi chú</label>
                                <input value={form.notes}
                                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                    placeholder="Ghi chú cho đơn hàng..." />
                            </div>

                            {/* Totals (bên dưới products table) */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                                <table style={{ minWidth: 300, border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
                                    <tbody>
                                        <tr style={{ background: '#F9FAFB' }}>
                                            <td style={{ padding: '8px 16px', textAlign: 'right', color: '#6B7280' }}>Subtotal:</td>
                                            <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 600 }}>{fmt.vnd(t.subtotal)}</td>
                                        </tr>
                                        <tr style={{ background: '#F9FAFB' }}>
                                            <td style={{ padding: '8px 16px', textAlign: 'right', color: '#10B981' }}>Chiết khấu:</td>
                                            <td style={{ padding: '8px 16px', textAlign: 'right', color: '#10B981', fontWeight: 600 }}>-{fmt.vnd(t.discount)}</td>
                                        </tr>
                                        <tr style={{ background: '#F9FAFB' }}>
                                            <td style={{ padding: '8px 16px', textAlign: 'right', color: '#6B7280' }}>Thuế:</td>
                                            <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 600 }}>{fmt.vnd(t.tax)}</td>
                                        </tr>
                                        <tr style={{ background: '#10B981', color: '#fff' }}>
                                            <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 800 }}>TỔNG CỘNG:</td>
                                            <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 800, fontSize: '1.1rem' }}>{fmt.vnd(t.total)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #E5E7EB', paddingTop: 16 }}>
                                <button type="submit" className="btn btn-success" disabled={saving}>
                                    {saving ? '⏳ Đang tạo đơn...' : '💾 Tạo đơn hàng'}
                                </button>
                                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Hủy</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
