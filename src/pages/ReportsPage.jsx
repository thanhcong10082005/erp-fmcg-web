import React, { useState, useEffect, useCallback } from 'react';
import { apiCall, fmt } from '../api/client';

export default function ReportsPage({ token }) {
    const [tab, setTab] = useState('revenue');
    const [revenue, setRevenue] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [ar, setAR] = useState([]);
    const [topProducts, setTopProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const [groupBy, setGroupBy] = useState('day');

    const loadRevenue = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const qs = new URLSearchParams({ group_by: groupBy });
            const data = await apiCall('GET', '/reports/revenue?' + qs.toString(), null, token);
            setRevenue(Array.isArray(data) ? data : []);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token, groupBy]);

    const loadInventory = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const data = await apiCall('GET', '/reports/inventory', null, token);
            setInventory(Array.isArray(data) ? data : []);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token]);

    const loadAR = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const data = await apiCall('GET', '/reports/ar', null, token);
            setAR(Array.isArray(data) ? data : []);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token]);

    const loadTopProducts = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const data = await apiCall('GET', '/reports/top-products?limit=10', null, token);
            setTopProducts(Array.isArray(data) ? data : []);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token]);

    useEffect(() => {
        if (!token) return;
        if (tab === 'revenue') loadRevenue();
        if (tab === 'inventory') loadInventory();
        if (tab === 'ar') loadAR();
        if (tab === 'top') loadTopProducts();
    }, [token, tab, loadRevenue, loadInventory, loadAR, loadTopProducts]);

    return (
        <div>
            <div className="card">
                <div className="card-header">
                    <h3>📈 Báo cáo</h3>
                    <div className="flex">
                        {[
                            { id: 'revenue', label: '💰 Doanh thu' },
                            { id: 'inventory', label: '📦 Tồn kho' },
                            { id: 'ar', label: '💳 Công nợ' },
                            { id: 'top', label: '🏆 Top SP' },
                        ].map(t => (
                            <button key={t.id}
                                className={tab === t.id ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                                onClick={() => setTab(t.id)}>{t.label}</button>
                        ))}
                    </div>
                </div>
                <div className="card-body">
                    {err && <div className="alert alert-error">{err}</div>}
                    {loading ? <div>Đang tải...</div> : (
                        <>
                            {tab === 'revenue' && (
                                <>
                                    <div className="flex mb-16">
                                        <label>Nhóm theo:</label>
                                        <select value={groupBy} onChange={e => setGroupBy(e.target.value)}>
                                            <option value="day">Ngày</option>
                                            <option value="week">Tuần</option>
                                            <option value="month">Tháng</option>
                                        </select>
                                    </div>
                                    <div className="table-wrap">
                                        <table>
                                            <thead>
                                                <tr><th>Kỳ</th><th>Số HĐ</th><th>Doanh thu</th><th>Thuế</th><th>CK</th><th>Tổng</th><th>Đã thu</th></tr>
                                            </thead>
                                            <tbody>
                                                {revenue.map((r, i) => (
                                                    <tr key={i}>
                                                        <td>{fmt.dateOnly(r.period)}</td>
                                                        <td>{r.invoice_count}</td>
                                                        <td>{fmt.vnd(r.revenue)}</td>
                                                        <td>{fmt.vnd(r.revenue_tax)}</td>
                                                        <td>{fmt.vnd(r.revenue_discount)}</td>
                                                        <td><strong>{fmt.vnd(r.revenue_total)}</strong></td>
                                                        <td>{fmt.vnd(r.revenue_collected)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}

                            {tab === 'inventory' && (
                                <div className="table-wrap">
                                    <table>
                                        <thead>
                                            <tr><th>SKU</th><th>Sản phẩm</th><th>DM</th><th>SL tồn</th><th>Giá trị</th><th>Trạng thái</th></tr>
                                        </thead>
                                        <tbody>
                                            {inventory.map((i, idx) => (
                                                <tr key={idx}>
                                                    <td><code>{i.sku}</code></td>
                                                    <td>{i.product_name}</td>
                                                    <td>{i.category_name}</td>
                                                    <td>{i.total_qty}</td>
                                                    <td><strong>{fmt.vnd(i.total_value)}</strong></td>
                                                    <td>{i.stock_status === 'OK' ? '✅' : i.stock_status === 'LOW_STOCK' ? '⚠️' : '❌'} {i.stock_status}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {tab === 'ar' && (
                                <div className="table-wrap">
                                    <table>
                                        <thead>
                                            <tr><th>Mã KH</th><th>Tên KH</th><th>Phone</th><th>Số HĐ</th><th>Tổng bill</th><th>Đã thu</th><th>Còn nợ</th><th>Quá hạn</th></tr>
                                        </thead>
                                        <tbody>
                                            {ar.map(a => (
                                                <tr key={a.partner_id}>
                                                    <td><code>{a.partner_code}</code></td>
                                                    <td><strong>{a.partner_name}</strong></td>
                                                    <td>{a.phone || '—'}</td>
                                                    <td>{a.invoice_count}</td>
                                                    <td>{fmt.vnd(a.total_billed)}</td>
                                                    <td>{fmt.vnd(a.total_paid)}</td>
                                                    <td><strong style={{ color: '#DC2626' }}>{fmt.vnd(a.outstanding)}</strong></td>
                                                    <td><strong style={{ color: parseFloat(a.overdue) > 0 ? '#DC2626' : 'inherit' }}>{fmt.vnd(a.overdue)}</strong></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {tab === 'top' && (
                                <div className="table-wrap">
                                    <table>
                                        <thead>
                                            <tr><th>#</th><th>SKU</th><th>Sản phẩm</th><th>DM</th><th>SL bán</th><th>Doanh thu</th><th>Số HĐ</th></tr>
                                        </thead>
                                        <tbody>
                                            {topProducts.map((p, idx) => (
                                                <tr key={p.product_id}>
                                                    <td>{idx + 1} {idx < 3 && '🏆'}</td>
                                                    <td><code>{p.sku}</code></td>
                                                    <td><strong>{p.product_name}</strong></td>
                                                    <td>{p.category_name}</td>
                                                    <td>{fmt.num(p.total_qty_sold)}</td>
                                                    <td><strong>{fmt.vnd(p.total_revenue)}</strong></td>
                                                    <td>{p.invoice_count}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

