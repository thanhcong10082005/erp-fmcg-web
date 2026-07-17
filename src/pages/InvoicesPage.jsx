import React, { useState, useEffect, useCallback } from 'react';
import { apiCall, fmt, StatusBadge } from '../api/client';

export default function InvoicesPage({ token }) {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [selected, setSelected] = useState(null);

    const load = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const qs = new URLSearchParams();
            if (statusFilter) qs.set('status', statusFilter);
            const data = await apiCall('GET', '/invoices?' + qs.toString(), null, token);
            setInvoices(Array.isArray(data) ? data : []);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token, statusFilter]);

    useEffect(() => { if (token) load(); }, [token, load]);

    const viewDetail = async (id) => {
        try {
            const data = await apiCall('GET', `/invoices/${id}`, null, token);
            setSelected(data);
        } catch (e) { setErr(e.message); }
    };

    const issueInvoice = async (id) => {
        try {
            await apiCall('PUT', `/invoices/${id}/issue`, null, token);
            load();
        } catch (e) { setErr(e.message); }
    };

    const recordPayment = async (inv) => {
        const amt = prompt(`Ghi nhận thanh toán cho hóa đơn ${inv.invoice_number}\nCòn lại: ${fmt.vnd(inv.total_amount - inv.paid_amount)}\nNhập số tiền (VND):`);
        if (!amt) return;
        const amount = parseFloat(amt);
        if (isNaN(amount) || amount <= 0) return alert('Số tiền không hợp lệ');
        try {
            await apiCall('POST', '/payments/receipts', {
                partner_id: inv.partner_id,
                amount,
                payment_method: 'BANK_TRANSFER',
                notes: `Thu nhanh cho HĐ ${inv.invoice_number}`,
                receipt_date: new Date().toISOString().slice(0, 10),
            }, token);
            alert(`✅ Đã ghi nhận phiếu thu ${fmt.vnd(amount)} và tự động phân bổ cho hóa đơn`);
            load();
        } catch (e) { setErr(e.message); }
    };

    return (
        <div>
            <div className="card">
                <div className="card-header">
                    <h3>🧾 Hóa đơn</h3>
                    <div className="flex">
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '6px 10px' }}>
                            <option value="">Tất cả</option>
                            <option value="DRAFT">DRAFT</option>
                            <option value="ISSUED">ISSUED</option>
                            <option value="CANCELLED">CANCELLED</option>
                        </select>
                        <button className="btn btn-primary btn-sm" onClick={load}>Lọc</button>
                    </div>
                </div>
                <div className="card-body">
                    {err && <div className="alert alert-error">{err}</div>}
                    {loading ? <div>Đang tải...</div> : (
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Số HĐ</th><th>Ngày</th><th>Khách hàng</th>
                                        <th>Subtotal</th><th>Thuế</th>
                                        <th>Tổng</th><th>Đã thu</th>
                                        <th>Thanh toán</th><th>Trạng thái</th><th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoices.map(i => {
                                        const paid = Number(i.paid_amount) || 0;
                                        const total = Number(i.total_amount) || 0;
                                        const paymentStatus = paid >= total ? 'PAID' : (paid > 0 ? 'PARTIAL' : 'UNPAID');
                                        return (
                                        <tr key={i.invoice_id}>
                                            <td><code>{i.invoice_number}</code></td>
                                            <td>{fmt.dateOnly(i.invoice_date)}</td>
                                            <td><strong>{i.partner_name}</strong></td>
                                            <td>{fmt.vnd(Number(i.subtotal) || 0)}</td>
                                            <td>{fmt.vnd(Number(i.tax_amount) || 0)}</td>
                                            <td><strong>{fmt.vnd(total)}</strong></td>
                                            <td style={{ color: paid > 0 ? '#059669' : '#6B7280', fontWeight: paid > 0 ? 600 : 400 }}>
                                                {fmt.vnd(paid)}
                                            </td>
                                            <td><StatusBadge s={paymentStatus} /></td>
                                            <td><StatusBadge s={i.status} /></td>
                                            <td>
                                                <button className="btn btn-sm btn-outline" onClick={() => viewDetail(i.invoice_id)}>👁️</button>
                                                {i.status === 'ISSUED' && (
                                                    <>
                                                        {' '}
                                                        <button className="btn btn-sm btn-outline" onClick={() => recordPayment(i)}>💰 Thu</button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                    })}
                                    {invoices.length === 0 && (
                                        <tr><td colSpan={10} style={{ textAlign: 'center', padding: 20, color: '#6B7280' }}>Không có hóa đơn</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {selected && (
                <div className="card mt-16">
                    <div className="card-header">
                        <h3>📄 Hóa đơn {selected.invoice_number}</h3>
                        <button className="btn btn-outline btn-sm" onClick={() => setSelected(null)}>✕</button>
                    </div>
                    <div className="card-body">
                        <div className="grid-3 mb-16">
                            <div><strong>Khách:</strong> {selected.partner_name}</div>
                            <div><strong>MST:</strong> {selected.tax_code || '—'}</div>
                            <div><strong>Email:</strong> {selected.partner_email || '—'}</div>
                            <div><strong>Ngày:</strong> {fmt.dateOnly(selected.invoice_date)}</div>
                            <div><strong>Hạn:</strong> {fmt.dateOnly(selected.due_date)}</div>
                            <div><strong>Mã CQT:</strong> {selected.cqt_code || <em>Chưa cấp</em>}</div>
                        </div>
                        <h4>Sản phẩm</h4>
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr><th>#</th><th>SKU</th><th>Tên</th><th>SL</th><th>Đơn giá</th><th>CK</th><th>Thành tiền</th></tr>
                                </thead>
                                <tbody>
                                    {selected.items?.map(it => (
                                        <tr key={it.si_item_id}>
                                            <td>{it.line_number}</td>
                                            <td><code>{it.sku}</code></td>
                                            <td>{it.product_name}</td>
                                            <td>{it.quantity} {it.unit_name}</td>
                                            <td>{fmt.vnd(it.unit_price)}</td>
                                            <td>{it.discount_pct}%</td>
                                            <td><strong>{fmt.vnd(it.line_total)}</strong></td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr><td colSpan={6} style={{ textAlign: 'right' }}>Subtotal</td><td>{fmt.vnd(selected.subtotal)}</td></tr>
                                    <tr><td colSpan={6} style={{ textAlign: 'right' }}>VAT (10%)</td><td>{fmt.vnd(selected.tax_amount)}</td></tr>
                                    <tr style={{ background: '#F0FDF4' }}>
                                        <td colSpan={6} style={{ textAlign: 'right' }}><strong>TỔNG</strong></td>
                                        <td><strong style={{ color: '#10B981' }}>{fmt.vnd(selected.total_amount)}</strong></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

