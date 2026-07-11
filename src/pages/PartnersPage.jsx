import React, { useState, useEffect, useCallback } from 'react';
import { apiCall, fmt, StatusBadge } from '../api/client';
import CustomerMapView from './CustomerMapView';

const PARTNER_TYPES = ['STORE', 'ASO', 'SUPERMARKET', 'CHAIN', 'AGENT', 'INDIVIDUAL', 'CORPORATE'];
const ROUTE_TYPES = ['SPVB', 'PRESELL', 'AFHH', 'DTS'];
const URBAN_RURAL = ['URBAN', 'RURAL'];
const SEGMENT_CODES = ['A', 'B', 'C', 'D', 'E'];

const PAGE_SIZE = 50;

export default function PartnersPage({ token }) {
    const [partners, setPartners] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const [search, setSearch] = useState('');
    const [type, setType] = useState('');
    const [routeCode, setRouteCode] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [activeTab, setActiveTab] = useState('list');

    const [form, setForm] = useState({
        partner_code: '', partner_name: '', partner_type: 'STORE',
        phone: '', email: '', tax_code: '', credit_limit: 0,
        address_line: '', ward: '', district: '', province: '',
        route_code: '', route_name: '', route_type: '',
        dcr_code: '', dcr_name: '', area_code: '', area_name: '',
        urban_rural: 'URBAN', segment_code: '', sub_route: '',
        sog_type: '', ASO_status: '',
        description: '', notes: '',
    });

    const load = useCallback(async (pageOverride) => {
        setLoading(true); setErr('');
        try {
            const targetPage = pageOverride ?? page;
            const offset = (targetPage - 1) * PAGE_SIZE;
            const qs = new URLSearchParams();
            if (search) qs.set('search', search);
            if (type) qs.set('type', type);
            if (routeCode) qs.set('routeCode', routeCode);
            qs.set('limit', String(PAGE_SIZE));
            qs.set('offset', String(offset));
            const data = await apiCall('GET', '/partners?' + qs.toString(), null, token);
            if (Array.isArray(data)) {
                setPartners(data);
                setTotal(data.length);
            } else if (data && Array.isArray(data.data)) {
                setPartners(data.data);
                setTotal(typeof data.total === 'number' ? data.total : data.data.length);
            } else {
                setPartners([]);
                setTotal(0);
            }
            if (pageOverride) setPage(pageOverride);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token, search, type, routeCode, page]);

    useEffect(() => { if (token) load(1); }, [token, search, type, routeCode]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const startIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const endIdx = Math.min(total, page * PAGE_SIZE);

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
            phone: '', email: '', tax_code: '', credit_limit: 0,
            address_line: '', ward: '', district: '', province: '',
            route_code: '', route_name: '', route_type: '',
            dcr_code: '', dcr_name: '', area_code: '', area_name: '',
            urban_rural: 'URBAN', segment_code: '', sub_route: '',
            sog_type: '', ASO_status: '',
            description: '', notes: '',
        });
    };

    const handleEdit = (p) => {
        setEditing(p.partner_id);
        setForm({
            partner_code: p.partner_code || '',
            partner_name: p.partner_name || '',
            partner_type: p.partner_type || 'STORE',
            phone: p.phone || '',
            email: p.email || '',
            tax_code: p.tax_code || '',
            credit_limit: p.credit_limit || 0,
            address_line: p.address_line || '',
            ward: p.ward || '',
            district: p.district || '',
            province: p.province || '',
            route_code: p.route_code || '',
            route_name: p.route_name || '',
            route_type: p.route_type || '',
            dcr_code: p.dcr_code || '',
            dcr_name: p.dcr_name || '',
            area_code: p.area_code || '',
            area_name: p.area_name || '',
            urban_rural: p.urban_rural || 'URBAN',
            segment_code: p.segment_code || '',
            sub_route: p.sub_route || '',
            sog_type: p.sog_type || '',
            ASO_status: p.ASO_status || '',
            description: p.description || '',
            notes: p.notes || '',
        });
        setShowForm(true);
        setActiveTab('form');
    };

    const handleDelete = async (id) => {
        if (!confirm('Xóa đối tác này?')) return;
        try {
            await apiCall('DELETE', `/partners/${id}`, null, token);
            // Nếu đây là item cuối cùng của trang hiện tại, quay về trang trước
            if (partners.length === 1 && page > 1) {
                load(page - 1);
            } else {
                load(page);
            }
        }
        catch (e) { setErr(e.message); }
    };

    const getTypeBadgeColor = (type) => {
        const colors = {
            'STORE': '#3B82F6',
            'ASO': '#8B5CF6',
            'SUPERMARKET': '#10B981',
            'CHAIN': '#F59E0B',
            'AGENT': '#EC4899',
            'INDIVIDUAL': '#6B7280',
            'CORPORATE': '#DC2626',
        };
        return colors[type] || '#6B7280';
    };

    return (
        <div>
            {/* Tab Navigation */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid #E5E7EB', paddingBottom: 8 }}>
                <button
                    className={`btn ${activeTab === 'list' ? 'btn-primary' : 'btn-outline'} btn-sm`}
                    onClick={() => setActiveTab('list')}
                >
                    📋 Danh sách Partners
                </button>
                <button
                    className={`btn ${activeTab === 'map' ? 'btn-primary' : 'btn-outline'} btn-sm`}
                    onClick={() => setActiveTab('map')}
                >
                    🗺️ Bản đồ
                </button>
                <button
                    className={`btn ${activeTab === 'form' ? 'btn-primary' : 'btn-outline'} btn-sm`}
                    onClick={() => { resetForm(); setEditing(null); setShowForm(true); setActiveTab('form'); }}
                >
                    ➕ Thêm Partner
                </button>
            </div>

            {/* Filters */}
            <div className="card">
                <div className="card-body" style={{ padding: 12 }}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                            type="text" placeholder="🔍 Tìm theo tên, mã, DCR..." value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && load()}
                            style={{ padding: '6px 10px', minWidth: 220 }}
                        />
                        <select value={type} onChange={e => setType(e.target.value)} style={{ padding: '6px 10px' }}>
                            <option value="">Tất cả loại</option>
                            {PARTNER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <input
                            type="text" placeholder="Mã tuyến..." value={routeCode}
                            onChange={e => setRouteCode(e.target.value)}
                            style={{ padding: '6px 10px', minWidth: 120 }}
                        />
                        <button className="btn btn-primary btn-sm" onClick={() => load(1)}>🔍 Tìm</button>
                        <button className="btn btn-outline btn-sm" onClick={() => { setSearch(''); setType(''); setRouteCode(''); setTimeout(() => load(1), 0); }}>
                            🧹 Reset
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats Summary */}
            <div style={{ display: 'flex', gap: 12, margin: '16px 0', flexWrap: 'wrap' }}>
                {PARTNER_TYPES.map(t => {
                    const count = partners.filter(p => p.partner_type === t).length;
                    return (
                        <div key={t} style={{
                            background: getTypeBadgeColor(t) + '15',
                            border: `1px solid ${getTypeBadgeColor(t)}40`,
                            borderRadius: 8, padding: '8px 16px', textAlign: 'center',
                        }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: getTypeBadgeColor(t) }}>{count}</div>
                            <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>{t}</div>
                        </div>
                    );
                })}
            </div>

            {/* List View */}
            {activeTab === 'list' && (
                <div className="card">
                    <div className="card-header">
                        <h3>👥 Partners — Tổng cộng {total} mục</h3>
                        <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                            {partners.length > 0 && `Tổng công nợ trang này: ${fmt.vnd(partners.reduce((sum, p) => sum + (p.current_debt || 0), 0))}`}
                        </div>
                    </div>
                    <div className="card-body">
                        {err && <div className="alert alert-error">{err}</div>}
                        {loading ? <div>Đang tải...</div> : (
                            <div className="table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Mã</th>
                                            <th>Tên</th>
                                            <th>Loại</th>
                                            <th>Điện thoại</th>
                                            <th>Tuyến</th>
                                            <th>DCR</th>
                                            <th>Công nợ</th>
                                            <th>Trạng thái</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {partners.map(p => (
                                            <tr key={p.partner_id}>
                                                <td><code>{p.partner_code}</code></td>
                                                <td>
                                                    <strong>{p.partner_name}</strong>
                                                    {p.address_line && <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>{p.address_line}</div>}
                                                </td>
                                                <td>
                                                    <span style={{
                                                        background: getTypeBadgeColor(p.partner_type) + '20',
                                                        color: getTypeBadgeColor(p.partner_type),
                                                        padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600
                                                    }}>
                                                        {p.partner_type}
                                                    </span>
                                                </td>
                                                <td>{p.phone || '—'}</td>
                                                <td>
                                                    {p.route_code && <code style={{ fontSize: '0.75rem' }}>{p.route_code}</code>}
                                                    {p.route_type && <span style={{ fontSize: '0.7rem', color: '#6B7280' }}> ({p.route_type})</span>}
                                                </td>
                                                <td>
                                                    {p.dcr_code && <code style={{ fontSize: '0.75rem' }}>{p.dcr_code}</code>}
                                                </td>
                                                <td style={{ color: (p.current_debt || 0) > 0 ? '#DC2626' : '#10B981' }}>
                                                    {fmt.vnd(p.current_debt || 0)}
                                                </td>
                                                <td>{p.is_active ? '✅' : '❌'}</td>
                                                <td>
                                                    <button className="btn btn-sm btn-outline" onClick={() => handleEdit(p)}>✏️</button>
                                                    {' '}
                                                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.partner_id)}>🗑️</button>
                                                </td>
                                            </tr>
                                        ))}
                                        {partners.length === 0 && (
                                            <tr>
                                                <td colSpan={9} style={{ textAlign: 'center', padding: 20, color: '#6B7280' }}>
                                                    {total === 0 ? 'Không có partners' : `Trang ${page} trống — quay về trang 1`}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                    {/* Pagination */}
                    {total > 0 && (
                        <div className="card-body" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderTop: '1px solid #E5E7EB' }}>
                            <div style={{ fontSize: '0.85rem', color: '#6B7280' }}>
                                Hiển thị <strong>{startIdx}–{endIdx}</strong> / <strong>{total}</strong> mục — Trang <strong>{page}/{totalPages}</strong>
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => load(1)}>««</button>
                                <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => load(page - 1)}>‹ Trước</button>
                                <input
                                    type="number"
                                    min={1}
                                    max={totalPages}
                                    value={page}
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
            )}

            {/* Map View */}
            {activeTab === 'map' && (
                <CustomerMapView token={token} onClose={() => setActiveTab('list')} />
            )}

            {/* Form View */}
            {activeTab === 'form' && showForm && (
                <div className="card">
                    <div className="card-header">
                        <h3>{editing ? '✏️ Sửa' : '➕ Thêm'} Partner</h3>
                        <button className="btn btn-outline btn-sm" onClick={() => { setShowForm(false); setActiveTab('list'); }}>
                            ← Quay lại
                        </button>
                    </div>
                    <div className="card-body">
                        <form onSubmit={handleSubmit}>
                            {/* Thông tin cơ bản */}
                            <div style={{ borderBottom: '1px solid #E5E7EB', paddingBottom: 16, marginBottom: 16 }}>
                                <h4 style={{ marginBottom: 12, color: '#374151' }}>📋 Thông tin cơ bản</h4>
                                <div className="grid-3">
                                    <div className="form-group">
                                        <label>Mã Partner *</label>
                                        <input value={form.partner_code} required
                                            onChange={e => setForm({ ...form, partner_code: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Tên Partner *</label>
                                        <input value={form.partner_name} required
                                            onChange={e => setForm({ ...form, partner_name: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Loại Partner</label>
                                        <select value={form.partner_type}
                                            onChange={e => setForm({ ...form, partner_type: e.target.value })}>
                                            {PARTNER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
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
                                </div>
                            </div>

                            {/* Địa chỉ */}
                            <div style={{ borderBottom: '1px solid #E5E7EB', paddingBottom: 16, marginBottom: 16 }}>
                                <h4 style={{ marginBottom: 12, color: '#374151' }}>📍 Địa chỉ</h4>
                                <div className="grid-2">
                                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                        <label>Địa chỉ</label>
                                        <input value={form.address_line}
                                            onChange={e => setForm({ ...form, address_line: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Phường/Xã</label>
                                        <input value={form.ward}
                                            onChange={e => setForm({ ...form, ward: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Quận/Huyện</label>
                                        <input value={form.district}
                                            onChange={e => setForm({ ...form, district: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Tỉnh/TP</label>
                                        <input value={form.province}
                                            onChange={e => setForm({ ...form, province: e.target.value })} />
                                    </div>
                                </div>
                            </div>

                            {/* Thông tin tuyến */}
                            <div style={{ borderBottom: '1px solid #E5E7EB', paddingBottom: 16, marginBottom: 16 }}>
                                <h4 style={{ marginBottom: 12, color: '#374151' }}>🛣️ Thông tin tuyến</h4>
                                <div className="grid-3">
                                    <div className="form-group">
                                        <label>Mã tuyến</label>
                                        <input value={form.route_code}
                                            onChange={e => setForm({ ...form, route_code: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Tên tuyến</label>
                                        <input value={form.route_name}
                                            onChange={e => setForm({ ...form, route_name: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Loại tuyến</label>
                                        <select value={form.route_type}
                                            onChange={e => setForm({ ...form, route_type: e.target.value })}>
                                            <option value="">-- Chọn --</option>
                                            {ROUTE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* ASO Fields (hiện khi loại là ASO) */}
                            {form.partner_type === 'ASO' && (
                                <div style={{ borderBottom: '1px solid #E5E7EB', paddingBottom: 16, marginBottom: 16 }}>
                                    <h4 style={{ marginBottom: 12, color: '#8B5CF6' }}>🏪 Thông tin ASO</h4>
                                    <div className="grid-3">
                                        <div className="form-group">
                                            <label>Mã DCR</label>
                                            <input value={form.dcr_code}
                                                onChange={e => setForm({ ...form, dcr_code: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label>Tên DCR</label>
                                            <input value={form.dcr_name}
                                                onChange={e => setForm({ ...form, dcr_name: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label>Mã khu vực</label>
                                            <input value={form.area_code}
                                                onChange={e => setForm({ ...form, area_code: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label>Tên khu vực</label>
                                            <input value={form.area_name}
                                                onChange={e => setForm({ ...form, area_name: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label>Thành thị/Nông thôn</label>
                                            <select value={form.urban_rural}
                                                onChange={e => setForm({ ...form, urban_rural: e.target.value })}>
                                                {URBAN_RURAL.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label>Segment</label>
                                            <select value={form.segment_code}
                                                onChange={e => setForm({ ...form, segment_code: e.target.value })}>
                                                <option value="">-- Chọn --</option>
                                                {SEGMENT_CODES.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label>Sub Route</label>
                                            <input value={form.sub_route}
                                                onChange={e => setForm({ ...form, sub_route: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label>SOG Type</label>
                                            <input value={form.sog_type}
                                                onChange={e => setForm({ ...form, sog_type: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label>ASO Status</label>
                                            <input value={form.ASO_status}
                                                onChange={e => setForm({ ...form, ASO_status: e.target.value })} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Ghi chú */}
                            <div>
                                <h4 style={{ marginBottom: 12, color: '#374151' }}>📝 Ghi chú</h4>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label>Mô tả</label>
                                        <textarea value={form.description} rows={2}
                                            onChange={e => setForm({ ...form, description: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Ghi chú</label>
                                        <textarea value={form.notes} rows={2}
                                            onChange={e => setForm({ ...form, notes: e.target.value })} />
                                    </div>
                                </div>
                            </div>

                            <div className="flex mt-16">
                                <button type="submit" className="btn btn-success">
                                    {editing ? '💾 Cập nhật' : '➕ Tạo mới'}
                                </button>
                                <button type="button" className="btn btn-outline" 
                                    onClick={() => { setShowForm(false); setActiveTab('list'); }}>
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
