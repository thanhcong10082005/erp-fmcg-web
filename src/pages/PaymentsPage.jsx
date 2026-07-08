import React, { useState, useEffect, useCallback } from 'react';
import { apiCall, fmt, StatusBadge } from '../api/client.jsx';

export default function PaymentsPage({ token }) {
    const [tab, setTab] = useState('dashboard');
    return (
        <div>
            <div className="card">
                <div className="card-header">
                    <h3>💰 Quản lý Thu chi &amp; Công nợ</h3>
                    <div className="flex">
                        <button className={tab === 'dashboard' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'} onClick={() => setTab('dashboard')}>📊 Tổng quan</button>
                        <button className={tab === 'receipts' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'} onClick={() => setTab('receipts')}>💵 Phiếu thu</button>
                        <button className={tab === 'ar' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'} onClick={() => setTab('ar')}>📋 Công nợ AR</button>
                    </div>
                </div>
                <div className="card-body">
                    {tab === 'dashboard' && <DashboardTab token={token} />}
                    {tab === 'receipts' && <ReceiptsTab token={token} />}
                    {tab === 'ar' && <ARSummaryTab token={token} />}
                </div>
            </div>
        </div>
    );
}

function DashboardTab({ token }) {
    const [ar, setAr] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');

    const load = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const [arData] = await Promise.all([
                apiCall('GET', '/payments/ar/summary', null, token).catch(() => null),
            ]);
            setAr(arData);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token]);

    useEffect(() => { if (token) load(); }, [token, load]);

    if (loading) return <div>Đang tải...</div>;
    if (err) return <div className="alert alert-error">{err}</div>;

    return (
        <>
            <div className="grid-2 mb-16">
                <div className="kpi-card" style={{ background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)' }}>
                    <div className="kpi-label">📥 Tổng công nợ phải thu (AR)</div>
                    <div className="kpi-value">{ar ? fmt.vnd(ar.total_outstanding) : '—'}</div>
                    <div className="kpi-sub">Quá hạn: {ar ? fmt.vnd(ar.total_overdue) : '—'}</div>
                </div>
                <div className="kpi-card" style={{ background: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)' }}>
                    <div className="kpi-label">📤 Tiền chưa phân bổ</div>
                    <div className="kpi-value">{ar ? fmt.vnd(ar.unallocated_cash) : '—'}</div>
                    <div className="kpi-sub">Cần allocate cho hóa đơn</div>
                </div>
            </div>
            <div className="alert alert-info">
                💡 <strong>Hướng dẫn:</strong> Tab "Phiếu thu" để tạo và quản lý các khoản thu từ khách hàng.
                Tab "Công nợ AR" để xem chi tiết công nợ theo từng đối tác.
            </div>
        </>
    );
}

function ARSummaryTab({ token }) {
    const [details, setDetails] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');

    const load = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const data = await apiCall('GET', '/reports/ar-aging', null, token);
            setDetails(Array.isArray(data.details) ? data.details : []);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token]);

    useEffect(() => { if (token) load(); }, [token, load]);

    const totalDebt = details.reduce((s, p) => s + parseFloat(p.total_outstanding || 0), 0);

    return (
        <>
            <div className="flex mb-16" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Tổng công nợ: <strong style={{ color: '#DC2626', fontSize: '1.2rem' }}>{fmt.vnd(totalDebt)}</strong></span>
                <button className="btn btn-outline btn-sm" onClick={load}>↻ Refresh</button>
            </div>
            {err && <div className="alert alert-error" style={{ marginBottom: 16 }}>{err}</div>}
            {loading ? <div>Đang tải...</div> : (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Mã</th><th>Tên</th><th>Loại</th><th>Điện thoại</th>
                                <th>Công nợ</th><th>Hạn mức</th><th>Nợ cũ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {details.map(p => (
                                <tr key={p.partner_id}>
                                    <td><code>{p.partner_code}</code></td>
                                    <td><strong>{p.partner_name}</strong></td>
                                    <td>
                                        <span style={{ background: '#3B82F620', color: '#3B82F6', padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600 }}>
                                            {p.partner_type}
                                        </span>
                                    </td>
                                    <td className="text-sm">{p.phone || '—'}</td>
                                    <td><strong style={{ color: parseFloat(p.total_outstanding) > 0 ? '#DC2626' : '#10B981' }}>{fmt.vnd(p.total_outstanding)}</strong></td>
                                    <td className="text-sm text-muted">{p.credit_limit ? fmt.vnd(p.credit_limit) : '—'}</td>
                                    <td className="text-sm text-muted">{p.old_debt ? fmt.vnd(p.old_debt) : '—'}</td>
                                </tr>
                            ))}
                            {details.length === 0 && (
                                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20, color: '#6B7280' }}>Không có công nợ</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}

function ReceiptsTab({ token }) {
    const [receipts, setReceipts] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        customer_id: '', amount: '', payment_method: 'CASH',
        bank_name: '', bank_account: '', bank_reference: '', notes: '',
    });
    const [selected, setSelected] = useState(null);

    const load = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const data = await apiCall('GET', '/payments/receipts', null, token);
            setReceipts(Array.isArray(data) ? data : []);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token]);

    const loadCustomers = useCallback(async () => {
        try {
            const data = await apiCall('GET', '/partners?limit=200', null, token);
            setCustomers(Array.isArray(data) ? data : []);
        } catch (e) { /* ignore */ }
    }, [token]);

    useEffect(() => { if (token) { load(); loadCustomers(); } }, [token, load, loadCustomers]);

    const submit = async () => {
        if (!form.customer_id || !form.amount) return alert('Chọn khách hàng và nhập số tiền');
        try {
            const data = await apiCall('POST', '/payments/receipts', {
                ...form,
                partner_id: parseInt(form.customer_id),
                amount: parseFloat(form.amount),
            }, token);
            alert(`✅ Tạo phiếu thu ${data.receipt_number}`);
            setShowForm(false);
            setForm({ customer_id: '', amount: '', payment_method: 'CASH', bank_name: '', bank_account: '', bank_reference: '', notes: '' });
            load();
        } catch (e) { setErr(e.message); }
    };

    const viewDetail = async (id) => {
        try {
            const data = await apiCall('GET', `/payments/receipts/${id}`, null, token);
            setSelected(data);
        } catch (e) { setErr(e.message); }
    };

    const cancel = async (id) => {
        if (!confirm('Hủy phiếu thu này?')) return;
        try {
            await apiCall('PUT', `/payments/receipts/${id}/cancel`, null, token);
            load();
        } catch (e) { setErr(e.message); }
    };

    const totalCollected = receipts.reduce((s, r) => s + parseFloat(r.amount || 0), 0);

    return (
        <>
            {err && <div className="alert alert-error" style={{ marginBottom: 16 }}>{err}</div>}
            <div className="flex mb-16" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <span>Tổng: <strong>{receipts.length}</strong> phiếu thu</span>
                    <span style={{ marginLeft: 16, color: '#10B981', fontWeight: 600 }}>
                        Đã thu: {fmt.vnd(totalCollected)}
                    </span>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
                    {showForm ? '✕ Đóng form' : '➕ Tạo phiếu thu'}
                </button>
            </div>

            {showForm && (
                <div className="card mb-16" style={{ background: '#F9FAFB' }}>
                    <div className="card-body">
                        <div className="grid-3">
                            <div className="form-group">
                                <label>Khách hàng *</label>
                                <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                                    <option value="">-- Chọn KH --</option>
                                    {customers.map(c => (
                                        <option key={c.partner_id} value={c.partner_id}>
                                            {c.partner_code} - {c.partner_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Số tiền (VND) *</label>
                                <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Hình thức</label>
                                <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}>
                                    <option value="CASH">Tiền mặt</option>
                                    <option value="BANK_TRANSFER">Chuyển khoản</option>
                                    <option value="CARD">Thẻ</option>
                                    <option value="EWALLET">Ví điện tử</option>
                                    <option value="COD">COD</option>
                                </select>
                            </div>
                            <div><label>Ngân hàng</label><input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} /></div>
                            <div><label>Số TK</label><input value={form.bank_account} onChange={e => setForm({ ...form, bank_account: e.target.value })} /></div>
                            <div><label>Mã tham chiếu</label><input value={form.bank_reference} onChange={e => setForm({ ...form, bank_reference: e.target.value })} /></div>
                        </div>
                        <div className="mt-16">
                            <label>Ghi chú</label>
                            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ width: '100%' }} />
                        </div>
                        <div className="mt-16">
                            <button className="btn btn-success" onClick={submit}>💾 Lưu phiếu thu</button>
                        </div>
                    </div>
                </div>
            )}

            {loading ? <div>Đang tải...</div> : (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Số PT</th><th>Ngày</th><th>Khách hàng</th>
                                <th>Hình thức</th><th>Số tiền</th><th>Đã phân bổ</th>
                                <th>Trạng thái</th><th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {receipts.map(r => (
                                <tr key={r.receipt_id}>
                                    <td><code>{r.receipt_number}</code></td>
                                    <td>{fmt.dateOnly(r.receipt_date)}</td>
                                    <td><strong>{r.partner_name}</strong></td>
                                    <td className="text-sm">{r.payment_method}</td>
                                    <td><strong>{fmt.vnd(r.amount)}</strong></td>
                                    <td>{fmt.vnd(r.allocated_amount)} / {fmt.vnd(r.amount)}</td>
                                    <td><StatusBadge s={r.status} /></td>
                                    <td>
                                        <button className="btn btn-sm btn-outline" onClick={() => viewDetail(r.receipt_id)}>👁️</button>
                                        {r.status !== 'CANCELLED' && (
                                            <button className="btn btn-sm btn-danger" onClick={() => cancel(r.receipt_id)}>✕</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {receipts.length === 0 && (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20, color: '#6B7280' }}>Chưa có phiếu thu nào</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {selected && (
                <div className="card mt-16">
                    <div className="card-header">
                        <h3>📄 Phiếu thu {selected.receipt_number}</h3>
                        <button className="btn btn-outline btn-sm" onClick={() => setSelected(null)}>✕</button>
                    </div>
                    <div className="card-body">
                        <div className="grid-3 mb-16">
                            <div><strong>KH:</strong> {selected.partner_name}</div>
                            <div><strong>Ngày:</strong> {fmt.dateOnly(selected.receipt_date)}</div>
                            <div><strong>Hình thức:</strong> {selected.payment_method}</div>
                            <div><strong>Số tiền:</strong> {fmt.vnd(selected.amount)}</div>
                            <div><strong>Đã phân bổ:</strong> {fmt.vnd(selected.allocated_amount)}</div>
                            <div><strong>Còn lại:</strong> <span style={{ color: parseFloat(selected.unallocated_amount) > 0 ? '#DC2626' : '#10B981' }}>{fmt.vnd(selected.unallocated_amount)}</span></div>
                        </div>
                        {selected.bank_reference && <div><strong>Tham chiếu:</strong> {selected.bank_reference}</div>}
                        {selected.notes && <div style={{ marginTop: 8 }}><strong>Ghi chú:</strong> {selected.notes}</div>}
                    </div>
                </div>
            )}
        </>
    );
}
