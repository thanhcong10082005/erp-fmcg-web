import React, { useState, useEffect, useCallback } from 'react';
import { apiCall, fmt, StatusBadge } from '../api/client';

export default function CodReconciliationPage({ token }) {
    const [tab, setTab] = useState('cod'); // 'cod' | 'ar'
    return (
        <div>
            <div className="card">
                <div className="card-header">
                    <h3>📊 Đối soát & Công nợ</h3>
                    <div className="flex">
                        <button className={tab === 'cod' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'} onClick={() => setTab('cod')}>💰 Đối soát COD</button>
                        <button className={tab === 'ar' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'} onClick={() => setTab('ar')}>📋 Công nợ AR</button>
                    </div>
                </div>
                <div className="card-body">
                    {tab === 'cod' && <CodTab token={token} />}
                    {tab === 'ar' && <ARTab token={token} />}
                </div>
            </div>
        </div>
    );
}

// ── COD Reconciliation Tab ──────────────────────────────────────────────────
function CodTab({ token }) {
    const [pods, setPods] = useState([]);
    const [totals, setTotals] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [createReceiptLoading, setCreateReceiptLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const qs = new URLSearchParams();
            if (fromDate) qs.set('from_date', fromDate);
            const data = await apiCall('GET', '/reports/cod-reconciliation?' + qs.toString(), null, token);
            setPods(Array.isArray(data.pods) ? data.pods : []);
            setTotals(data.totals || null);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token, fromDate]);

    useEffect(() => { if (token) load(); }, [token, load]);

    const handleCreateReceipt = async (pod) => {
        if (!confirm(`Tạo phiếu thu cho "${pod.partner_name}"?\nSố tiền: ${fmt.vnd(pod.total_collected)}`)) return;
        setCreateReceiptLoading(true);
        try {
            const data = await apiCall('POST', '/payments/receipts', {
                partner_id: pod.partner_id,
                amount: parseFloat(pod.total_collected),
                payment_method: 'CASH',
                notes: `Thu tiền COD - Đơn ${pod.so_number} - Tài xế ${pod.driver_name || 'N/A'}`,
                receipt_date: new Date().toISOString().slice(0, 10),
            }, token);
            alert(`✅ Đã tạo phiếu thu ${data.receipt_number}`);
            load();
        } catch (e) { alert('Lỗi: ' + e.message); }
        finally { setCreateReceiptLoading(false); }
    };

    return (
        <>
            <div className="flex mb-16" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontWeight: 600 }}>Từ ngày:</label>
                    <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ padding: '4px 8px' }} />
                </div>
                <button className="btn btn-outline btn-sm" onClick={load}>🔍 Tải lại</button>
            </div>

            {err && <div className="alert alert-error" style={{ marginBottom: 16 }}>{err}</div>}

            {/* Summary cards */}
            {totals && (
                <div className="grid-4 mb-16">
                    <div style={{ background: '#EFF6FF', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#2563EB' }}>{totals.total_pods}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>Tổng POD</div>
                    </div>
                    <div style={{ background: '#F0FDF4', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10B981' }}>{fmt.vnd(totals.total_expected)}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>Tổng dự kiến</div>
                    </div>
                    <div style={{ background: '#FEF3C7', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#D97706' }}>{fmt.vnd(totals.total_collected)}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>Đã thu thực tế</div>
                    </div>
                    <div style={{ background: totals.total_shortage > 0 ? '#FEE2E2' : '#F0FDF4', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: totals.total_shortage > 0 ? '#DC2626' : '#10B981' }}>
                            {fmt.vnd(totals.total_shortage)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                            {totals.total_shortage > 0 ? 'Thiếu' : 'Khớp'} {totals.total_overage > 0 ? `(+${fmt.vnd(totals.total_overage)} dư)` : ''}
                        </div>
                    </div>
                </div>
            )}

            {loading ? <div>Đang tải...</div> : (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Ngày</th><th>Mã đơn</th><th>Partner</th><th>Tài xế</th>
                                <th>Tổng mới</th><th>Công nợ cũ</th><th>Thực thu</th>
                                <th>Thiếu</th><th>Dư</th><th>Trạng thái</th><th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {pods.map(p => {
                                const expected = (parseFloat(p.new_order_total) || 0) + (parseFloat(p.old_debt_total) || 0);
                                const actual = parseFloat(p.total_collected) || 0;
                                const shortage = expected - actual;
                                const overage = actual - expected;
                                return (
                                    <tr key={p.pod_id} style={shortage > 0 ? { background: '#FEF2F2' } : {}}>
                                        <td>{fmt.dateOnly(p.pod_date)}</td>
                                        <td><code>{p.so_number}</code></td>
                                        <td><strong>{p.partner_name}</strong></td>
                                        <td className="text-sm">{p.driver_name || '—'}</td>
                                        <td>{fmt.vnd(p.new_order_total)}</td>
                                        <td>{fmt.vnd(p.old_debt_total)}</td>
                                        <td><strong>{fmt.vnd(actual)}</strong></td>
                                        <td style={{ color: shortage > 0 ? '#DC2626' : '#10B981', fontWeight: 700 }}>
                                            {shortage > 0 ? fmt.vnd(shortage) : '—'}
                                        </td>
                                        <td style={{ color: overage > 0 ? '#10B981' : '#9CA3AF', fontWeight: 700 }}>
                                            {overage > 0 ? fmt.vnd(overage) : '—'}
                                        </td>
                                        <td><StatusBadge s={p.delivery_status} /></td>
                                        <td>
                                            <button className="btn btn-sm btn-success" onClick={() => handleCreateReceipt(p)} disabled={createReceiptLoading}>
                                                💵 Thu tiền
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {pods.length === 0 && (
                                <tr><td colSpan={11} style={{ textAlign: 'center', padding: 20, color: '#6B7280' }}>
                                    Không có POD nào để đối soát
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}

// ── AR Aging Tab ────────────────────────────────────────────────────────────
function ARTab({ token }) {
    const [details, setDetails] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');

    const load = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const data = await apiCall('GET', '/reports/ar-aging', null, token);
            setDetails(Array.isArray(data.details) ? data.details : []);
            setSummary(data.summary || null);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token]);

    useEffect(() => { if (token) load(); }, [token, load]);

    const agingColor = (debt) => {
        if (debt <= 0) return '#10B981';
        if (debt <= 1000000) return '#10B981';
        if (debt <= 5000000) return '#F59E0B';
        return '#DC2626';
    };

    return (
        <>
            {err && <div className="alert alert-error" style={{ marginBottom: 16 }}>{err}</div>}

            {/* Summary */}
            {summary && (
                <div className="grid-4 mb-16">
                    <div style={{ background: '#FEE2E2', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#DC2626' }}>{fmt.vnd(summary.total_outstanding)}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>Tổng công nợ</div>
                    </div>
                    <div style={{ background: '#F0FDF4', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10B981' }}>{fmt.vnd(summary.debt_0_30d)}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>Nợ 0–30 ngày</div>
                    </div>
                    <div style={{ background: '#FEF3C7', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#D97706' }}>{fmt.vnd(summary.debt_31_60d)}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>Nợ 31–60 ngày</div>
                    </div>
                    <div style={{ background: '#FEE2E2', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#DC2626' }}>{fmt.vnd(summary.debt_61_plusd)}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>Nợ 60+ ngày</div>
                    </div>
                </div>
            )}

            {loading ? <div>Đang tải...</div> : (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Mã</th><th>Tên Partner</th><th>Loại</th><th>Điện thoại</th>
                                <th>Công nợ hiện tại</th><th>Hạn mức</th>
                                <th>Nợ cũ</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {details.map(p => (
                                <tr key={p.partner_id}>
                                    <td><code>{p.partner_code}</code></td>
                                    <td><strong>{p.partner_name}</strong></td>
                                    <td>
                                        <span style={{
                                            background: '#3B82F620', color: '#3B82F6',
                                            padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600,
                                        }}>
                                            {p.partner_type}
                                        </span>
                                    </td>
                                    <td className="text-sm">{p.phone || '—'}</td>
                                    <td>
                                        <strong style={{ color: agingColor(parseFloat(p.total_outstanding)) }}>
                                            {fmt.vnd(p.total_outstanding)}
                                        </strong>
                                    </td>
                                    <td className="text-sm text-muted">{fmt.vnd(p.credit_limit)}</td>
                                    <td className="text-sm text-muted">{p.old_debt ? fmt.vnd(p.old_debt) : '—'}</td>
                                    <td>
                                        <button className="btn btn-sm btn-success" disabled>
                                            💵 Thu
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {details.length === 0 && (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20, color: '#6B7280' }}>
                                    Không có công nợ nào
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}
