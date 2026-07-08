import React, { useState, useEffect, useCallback } from 'react';
import { apiCall, fmt } from '../api/client.jsx';

const CATEGORIES = [
    { id: 1, name: 'Nước uống' },
    { id: 2, name: 'Nước có ga' },
    { id: 3, name: 'Trà' },
    { id: 4, name: 'Nước trái cây' },
    { id: 5, name: 'Năng lượng' },
    { id: 6, name: 'Cà phê' },
    { id: 7, name: 'Thể thao/Nước uống đóng chai' },
];
const UNITS = [
    { id: 1, code: 'CAI', name: 'Cái' },
    { id: 2, code: 'LON', name: 'Lon' },
    { id: 3, code: 'CHAI', name: 'Chai' },
    { id: 4, code: 'KG', name: 'Kilogram' },
    { id: 5, code: 'LIT', name: 'Lít' },
    { id: 6, code: 'THUNG', name: 'Thùng' },
];
const TAX_RATES = [
    { id: 1, code: 'VAT8', rate: 8 },
    { id: 2, code: 'VAT10', rate: 10 },
];

const EMPTY_FORM = {
    sku: '', barcode: '', product_name: '', short_name: '',
    category_id: 1, base_unit_id: 1, sales_unit_id: 1, purchase_unit_id: 1,
    units_per_base: 1,
    cost_price: '', selling_price: '',
    brand: '', pack_type: '', pack_size_ml: '',
    flavour: '', min_stock: '0', reorder_point: '0',
    is_sellable: true,
};

const PAGE_SIZE = 50;

export default function ProductsPage({ token }) {
    const [products, setProducts] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const [search, setSearch] = useState('');
    const [selectedCat, setSelectedCat] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async (pageOverride) => {
        setLoading(true); setErr('');
        try {
            const targetPage = pageOverride ?? page;
            const offset = (targetPage - 1) * PAGE_SIZE;
            const qs = new URLSearchParams();
            if (search) qs.set('search', search);
            if (selectedCat) qs.set('category_id', selectedCat);
            qs.set('limit', String(PAGE_SIZE));
            qs.set('offset', String(offset));
            const data = await apiCall('GET', '/products?' + qs.toString(), null, token);
            if (Array.isArray(data)) {
                setProducts(data);
                setTotal(data.length);
            } else if (data && Array.isArray(data.data)) {
                setProducts(data.data);
                setTotal(typeof data.total === 'number' ? data.total : data.data.length);
            } else {
                setProducts([]);
                setTotal(0);
            }
            if (pageOverride) setPage(pageOverride);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token, search, selectedCat, page]);

    useEffect(() => { if (token) load(1); }, [token, search, selectedCat]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const startIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const endIdx = Math.min(total, page * PAGE_SIZE);

    const openCreate = () => {
        setForm(EMPTY_FORM);
        setEditingId(null);
        setShowForm(true);
    };

    const openEdit = (p) => {
        setForm({
            sku: p.sku || '',
            barcode: p.barcode || '',
            product_name: p.product_name || '',
            short_name: p.short_name || '',
            category_id: p.category_id || 1,
            base_unit_id: p.base_unit_id || 1,
            sales_unit_id: p.sales_unit_id || 1,
            purchase_unit_id: p.purchase_unit_id || 1,
            units_per_base: p.units_per_base || 1,
            cost_price: p.cost_price || '',
            selling_price: p.selling_price || '',
            brand: p.brand || '',
            pack_type: p.pack_type || '',
            pack_size_ml: p.pack_size_ml || '',
            flavour: p.flavour || '',
            min_stock: p.min_stock || '0',
            reorder_point: p.reorder_point || '0',
            is_sellable: p.is_sellable !== false,
        });
        setEditingId(p.product_id);
        setShowForm(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.sku.trim() || !form.product_name.trim()) {
            alert('SKU và Tên sản phẩm là bắt buộc');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                sku: form.sku.trim(),
                barcode: form.barcode.trim() || null,
                product_name: form.product_name.trim(),
                short_name: form.short_name.trim() || null,
                category_id: parseInt(form.category_id),
                base_unit_id: parseInt(form.base_unit_id),
                sales_unit_id: parseInt(form.sales_unit_id),
                purchase_unit_id: parseInt(form.purchase_unit_id),
                units_per_base: parseInt(form.units_per_base) || 1,
                cost_price: parseFloat(form.cost_price) || 0,
                selling_price: parseFloat(form.selling_price) || 0,
                brand: form.brand.trim() || null,
                pack_type: form.pack_type.trim() || null,
                pack_size_ml: form.pack_size_ml ? parseInt(form.pack_size_ml) : null,
                flavour: form.flavour.trim() || null,
                min_stock: parseFloat(form.min_stock) || 0,
                reorder_point: parseFloat(form.reorder_point) || 0,
                is_sellable: form.is_sellable,
            };
            if (editingId) {
                await apiCall('PUT', `/products/${editingId}`, payload, token);
            } else {
                await apiCall('POST', '/products', payload, token);
            }
            setShowForm(false);
            load(1);
        } catch (e) { setErr(e.message); }
        finally { setSaving(false); }
    };

    const handleDelete = async (id, name) => {
        if (!confirm(`Xóa sản phẩm "${name}"?\nHành động này không thể hoàn tác.`)) return;
        try {
            await apiCall('DELETE', `/products/${id}`, null, token);
            if (products.length === 1 && page > 1) {
                load(page - 1);
            } else {
                load(page);
            }
        } catch (e) { alert(e.message); }
    };

    return (
        <div>
            <div className="card">
                <div className="card-header">
                    <h3>📦 Sản phẩm — Tổng cộng {total} mục</h3>
                    <div className="flex">
                        <input
                            type="text" placeholder="🔍 Tìm theo tên, SKU, barcode..."
                            value={search} onChange={e => setSearch(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && load(1)}
                            style={{ padding: '6px 10px', minWidth: 280 }}
                        />
                        <button className="btn btn-primary btn-sm" onClick={() => load(1)}>Tìm</button>
                        <button className="btn btn-success btn-sm" onClick={openCreate}>➕ Thêm sản phẩm</button>
                    </div>
                </div>
                <div className="card-body">
                    {err && <div className="alert alert-error">{err}</div>}
                    {loading ? <div>Đang tải...</div> : (
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>SKU</th><th>Barcode</th><th>Tên sản phẩm</th>
                                        <th>Danh mục</th><th>Thương hiệu</th>
                                        <th>Giá vốn</th><th>Giá bán</th>
                                        <th>Tồn tối thiểu</th><th>Đang bán</th><th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {products.map(p => (
                                        <tr key={p.product_id}>
                                            <td><code>{p.sku}</code></td>
                                            <td className="text-sm text-muted">{p.barcode || '—'}</td>
                                            <td><strong>{p.product_name}</strong></td>
                                            <td>{p.category_name || '—'}</td>
                                            <td className="text-sm">{p.brand || '—'}</td>
                                            <td>{fmt.vnd(p.cost_price)}</td>
                                            <td><strong>{fmt.vnd(p.selling_price)}</strong></td>
                                            <td className="text-sm text-muted">Min: {p.min_stock || 0} / RO: {p.reorder_point || 0}</td>
                                            <td>
                                                <span style={{
                                                    color: p.is_sellable ? '#10B981' : '#DC2626',
                                                    fontWeight: 700,
                                                }}>
                                                    {p.is_sellable ? '✅ Có' : '❌ Không'}
                                                </span>
                                            </td>
                                            <td>
                                                <button className="btn btn-sm btn-outline" onClick={() => openEdit(p)}>✏️</button>
                                                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.product_id, p.product_name)}>🗑️</button>
                                            </td>
                                        </tr>
                                    ))}
                                    {products.length === 0 && (
                                        <tr><td colSpan={10} style={{ textAlign: 'center', padding: 20, color: '#6B7280' }}>{total === 0 ? 'Không có sản phẩm nào' : `Trang ${page} trống — quay về trang 1`}</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                {total > 0 && (
                    <div className="card-body" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderTop: '1px solid #E5E7EB' }}>
                        <div style={{ fontSize: '0.85rem', color: '#6B7280' }}>
                            Hiển thị <strong>{startIdx}–{endIdx}</strong> / <strong>{total}</strong> mục — Trang <strong>{page}/{totalPages}</strong>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => load(1)}>««</button>
                            <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => load(page - 1)}>‹ Trước</button>
                            <input
                                type="number" min={1} max={totalPages} value={page}
                                onChange={(e) => {
                                    const v = parseInt(e.target.value || '1', 10);
                                    if (v >= 1 && v <= totalPages) setPage(v);
                                }}
                                onBlur={() => load(Math.min(Math.max(1, page), totalPages))}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); load(Math.min(Math.max(1, page), totalPages)); } }}
                                style={{ width: 60, textAlign: 'center', padding: '4px 6px' }}
                            />
                            <button className="btn btn-outline btn-sm" disabled={page >= totalPages} onClick={() => load(page + 1)}>Sau ›</button>
                            <button className="btn btn-outline btn-sm" disabled={page >= totalPages} onClick={() => load(totalPages)}>»»</button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Product Form Modal ── */}
            {showForm && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, padding: 16,
                }}>
                    <div style={{
                        background: '#fff', borderRadius: 12, padding: 0,
                        width: '100%', maxWidth: 680, maxHeight: '90vh',
                        overflow: 'auto',
                    }}>
                        <div style={{
                            padding: '20px 24px', borderBottom: '1px solid #E5E7EB',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            position: 'sticky', top: 0, background: '#fff', zIndex: 1,
                        }}>
                            <h3 style={{ margin: 0 }}>
                                {editingId ? '✏️ Sửa sản phẩm' : '➕ Thêm sản phẩm mới'}
                            </h3>
                            <button className="btn btn-outline btn-sm" onClick={() => setShowForm(false)}>✕ Đóng</button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
                            {/* Thông tin cơ bản */}
                            <div style={{ borderBottom: '1px solid #E5E7EB', paddingBottom: 16, marginBottom: 16 }}>
                                <h4 style={{ marginBottom: 12, color: '#374151' }}>📋 Thông tin cơ bản</h4>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label>SKU *</label>
                                        <input value={form.sku} required placeholder="VD: 10000001"
                                            onChange={e => setForm({ ...form, sku: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Barcode</label>
                                        <input value={form.barcode} placeholder="Mã vạch sản phẩm"
                                            onChange={e => setForm({ ...form, barcode: e.target.value })} />
                                    </div>
                                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                        <label>Tên sản phẩm *</label>
                                        <input value={form.product_name} required placeholder="VD: Pepsi chai nhựa 1500ml"
                                            onChange={e => setForm({ ...form, product_name: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Tên viết tắt</label>
                                        <input value={form.short_name} placeholder="VD: Pepsi 1.5L"
                                            onChange={e => setForm({ ...form, short_name: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Danh mục</label>
                                        <select value={form.category_id}
                                            onChange={e => setForm({ ...form, category_id: parseInt(e.target.value) })}>
                                            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Thương hiệu</label>
                                        <input value={form.brand} placeholder="VD: Pepsi"
                                            onChange={e => setForm({ ...form, brand: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Loại đóng gói</label>
                                        <select value={form.pack_type}
                                            onChange={e => setForm({ ...form, pack_type: e.target.value })}>
                                            <option value="">—</option>
                                            <option value="REGULAR">Regular</option>
                                            <option value="GIFT_BOX">Hộp quà</option>
                                            <option value="BUNDLE">Combo</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Dung tích (ml)</label>
                                        <input type="number" value={form.pack_size_ml} placeholder="VD: 1500"
                                            onChange={e => setForm({ ...form, pack_size_ml: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Hương vị</label>
                                        <input value={form.flavour} placeholder="VD: Cola, Cam..."
                                            onChange={e => setForm({ ...form, flavour: e.target.value })} />
                                    </div>
                                </div>
                            </div>

                            {/* Đơn vị */}
                            <div style={{ borderBottom: '1px solid #E5E7EB', paddingBottom: 16, marginBottom: 16 }}>
                                <h4 style={{ marginBottom: 12, color: '#374151' }}>📐 Đơn vị tính</h4>
                                <div className="grid-4">
                                    <div className="form-group">
                                        <label>Đơn vị cơ bản</label>
                                        <select value={form.base_unit_id}
                                            onChange={e => setForm({ ...form, base_unit_id: parseInt(e.target.value) })}>
                                            {UNITS.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Đơn vị bán</label>
                                        <select value={form.sales_unit_id}
                                            onChange={e => setForm({ ...form, sales_unit_id: parseInt(e.target.value) })}>
                                            {UNITS.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Đơn vị mua</label>
                                        <select value={form.purchase_unit_id}
                                            onChange={e => setForm({ ...form, purchase_unit_id: parseInt(e.target.value) })}>
                                            {UNITS.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>SL / Đơn vị cơ bản</label>
                                        <input type="number" value={form.units_per_base} min="1"
                                            onChange={e => setForm({ ...form, units_per_base: e.target.value })} />
                                    </div>
                                </div>
                            </div>

                            {/* Giá */}
                            <div style={{ borderBottom: '1px solid #E5E7EB', paddingBottom: 16, marginBottom: 16 }}>
                                <h4 style={{ marginBottom: 12, color: '#374151' }}>💰 Giá</h4>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label>Giá vốn (VND)</label>
                                        <input type="number" value={form.cost_price} placeholder="0"
                                            min="0" step="100"
                                            onChange={e => setForm({ ...form, cost_price: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Giá bán (VND)</label>
                                        <input type="number" value={form.selling_price} placeholder="0"
                                            min="0" step="100"
                                            onChange={e => setForm({ ...form, selling_price: e.target.value })} />
                                    </div>
                                </div>
                            </div>

                            {/* Tồn kho */}
                            <div style={{ borderBottom: '1px solid #E5E7EB', paddingBottom: 16, marginBottom: 16 }}>
                                <h4 style={{ marginBottom: 12, color: '#374151' }}>📦 Ngưỡng tồn kho</h4>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label>Tồn tối thiểu (Min Stock)</label>
                                        <input type="number" value={form.min_stock} min="0"
                                            onChange={e => setForm({ ...form, min_stock: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Điểm đặt hàng lại (Reorder Point)</label>
                                        <input type="number" value={form.reorder_point} min="0"
                                            onChange={e => setForm({ ...form, reorder_point: e.target.value })} />
                                    </div>
                                </div>
                            </div>

                            {/* Trạng thái */}
                            <div style={{ marginBottom: 20 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={form.is_sellable}
                                        onChange={e => setForm({ ...form, is_sellable: e.target.checked })} />
                                    <span style={{ fontWeight: 600 }}>Sản phẩm đang được bán</span>
                                </label>
                            </div>

                            <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #E5E7EB', paddingTop: 20, marginTop: 4 }}>
                                <button type="submit" className="btn btn-success" disabled={saving}>
                                    {saving ? '⏳ Đang lưu...' : '💾 Lưu sản phẩm'}
                                </button>
                                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>
                                    Hủy
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
