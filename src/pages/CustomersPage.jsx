import React, { useState, useEffect, useCallback } from 'react';
import { apiCall, fmt } from '../api/client';

const PARTNER_TYPES_STORE_ONLY = ['STORE', 'CHAIN', 'SUPERMARKET', 'AGENT', 'INDIVIDUAL', 'CORPORATE'];

// Backward-compatible wrapper for CustomersPage.
// In v6, "customers" + "ASO" were merged into tenant.partners.
// This page now only shows STORE-like partners (excludes ASO rows).
export default function CustomersPage({ token }) {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const [search, setSearch] = useState('');
    const [type, setType] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({
        partner_code: '', partner_name: '', partner_type: 'STORE',
        phone: '', email: '', tax_code: '', credit_limit: 0, address_line: '',
    });

    const load = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            // In v6, customers live in tenant.partners
            const params = new URLSearchParams();
            params.set('limit', '200');
            if (search) params.set('search', search);
            if (type) params.set('type', type);
            const data = await apiCall('GET', '/partners?' + params.toString(), null, token);
            // Filter out ASO since those are separately listed in Partners page
            const filtered = (Array.isArray(data) ? data : []).filter(p => p.partner_type !== 'ASO');
            setCustomers(filtered);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token, search, type]);

    useEffect(() => { if (token) load(); }, [token, load]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editing) {
                await apiCall('PUT', `/partners/${editing}`, form, token);
            } else {
                await apiCall('POST', '/partners', form, token);
            }
            setShowForm(false);
            setEditing(null);
            resetForm();
            load();
        } catch (e) { setErr(e.message); }
    };

    const resetForm = () => {
        setForm({
            partner_code: '', partner_name: '', partner_type: 'STORE',
            phone: '', email: '', tax_code: '', credit_limit: 0, address_line: '',
        });
    };

    const handleEdit = (c) => {
        setEditing(c.partner_id);
        setForm({
            partner_code: c.partner_code, partner_name: c.partner_name,
            partner_type: c.partner_type || 'STORE',
            phone: c.phone || '', email: c.email || '',
            tax_code: c.tax_code || '', credit_limit: c.credit_limit || 0,
            address_line: c.address_line || '',
        });
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (!confirm('Xóa khách hàng này?')) return;
        try { await apiCall('DELETE', `/partners/${id}`, null, token); load(); }
        catch (e) { setErr(e.message); }
    };

    return (
        <div>
            <div className="card">
                <div className="card-header">
                    <h3>👥 Khách hàng (STORE/CHAIN/...) ({customers.length})</h3>
                    <p className="text-sm text-muted">
                        ⚠️ Trong v6, customers + ASO đã gộp thành <strong>Partners</strong>.
                        Trang này chỉ hiển thị non-ASO partners.
                        Xem đầy đủ tại menu <strong>Partners</strong>.
                    </p>
                    <div className="flex" style={{ marginTop: 8 }}>
                        <input
                            type="text" placeholder="🔍 Tìm theo tên, mã..." value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && load()}
                            style={{ padding: '6px 10px', minWidth: 220 }}
                        />
                        <select value={type} onChange={e => setType(e.target.value)} style={{ padding: '6px 10px' }}>
                            <option value="">Tất cả loại</option>
                            {PARTNER_TYPES_STORE_ONLY.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <button className="btn btn-primary btn-sm" onClick={load}>Tìm</button>
                        <button className="btn btn-success btn-sm" onClick={() => {
                            setEditing(null);
                            resetForm();
                            setShowForm(true);
                        }}>+ Thêm</button>
                    </div>
                </div>
                <div className="card-body">
                    {err && <div className="alert alert-error">{err}</div>}
                    {loading ? <div>Đang tải...</div> : (
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Mã</th><th>Tên</th><th>Loại</th><th>Phone</th>
                                        <th>Địa chỉ</th><th>Công nợ</th><th>Trạng thái</th><th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {customers.map(c => (
                                        <tr key={c.partner_id}>
                                            <td><code>{c.partner_code}</code></td>
                                            <td><strong>{c.partner_name}</strong></td>
                                            <td><span className="badge">{c.partner_type}</span></td>
                                            <td>{c.phone || '—'}</td>
                                            <td>{c.address_line || '—'}</td>
                                            <td style={{ color: (c.current_debt || 0) > 0 ? '#DC2626' : '#10B981' }}>{fmt.vnd(c.current_debt)}</td>
                                            <td>{c.is_active ? '✅' : '❌'}</td>
                                            <td>
                                                <button className="btn btn-sm btn-outline" onClick={() => handleEdit(c)}>✏️</button>
                                                {' '}
                                                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(c.partner_id)}>🗑️</button>
                                            </td>
                                        </tr>
                                    ))}
                                    {customers.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20, color: '#6B7280' }}>Không có khách hàng</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {showForm && (
                <div className="card mt-16">
                    <div className="card-header"><h3>{editing ? '✏️ Sửa' : '➕ Thêm'} khách hàng</h3></div>
                    <div className="card-body">
                        <form onSubmit={handleSubmit}>
                            <div className="grid-2">
                                <div className="form-group">
                                    <label>Mã khách hàng *</label>
                                    <input value={form.partner_code} required
                                        onChange={e => setForm({ ...form, partner_code: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Tên khách hàng *</label>
                                    <input value={form.partner_name} required
                                        onChange={e => setForm({ ...form, partner_name: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Loại</label>
                                    <select value={form.partner_type}
                                        onChange={e => setForm({ ...form, partner_type: e.target.value })}>
                                        {PARTNER_TYPES_STORE_ONLY.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Điện thoại</label>
                                    <input value={form.phone}
                                        onChange={e => setForm({ ...form, phone: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Email</label>
                                    <input type="email" value={form.email}
                                        onChange={e => setForm({ ...form, email: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Mã số thuế</label>
                                    <input value={form.tax_code}
                                        onChange={e => setForm({ ...form, tax_code: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Hạn mức tín dụng (VND)</label>
                                    <input type="number" value={form.credit_limit}
                                        onChange={e => setForm({ ...form, credit_limit: +e.target.value })} />
                                </div>
                                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                    <label>Địa chỉ</label>
                                    <input value={form.address_line}
                                        onChange={e => setForm({ ...form, address_line: e.target.value })} />
                                </div>
                            </div>
                            <div className="flex mt-16">
                                <button type="submit" className="btn btn-success">{editing ? '💾 Cập nhật' : '➕ Tạo'}</button>
                                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Hủy</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
