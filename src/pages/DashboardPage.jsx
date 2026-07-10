import React, { useState, useEffect, useCallback } from 'react';
import { apiCall, fmt } from '../api/client';

// ──────────────────────────────────────────────────────────────
//  Lucide-style inline SVG icons (lightweight, no extra deps)
// ──────────────────────────────────────────────────────────────
const Icon = ({ d, size = 20, color = 'currentColor', fill = 'none', strokeWidth = 2 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color}
        strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: d }} />
);
const Icons = {
    store: '<path d="M3 9l1-5h16l1 5M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M3 9h18M9 14h6"/>',
    package: '<path d="M16.5 9.4L7.55 4.24M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
    money: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    warn: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    truck: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    up: '<polyline points="6 15 12 9 18 15"/>',
    down: '<polyline points="6 9 12 15 18 9"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
};

// ──────────────────────────────────────────────────────────────
//  KPI Card — FDS-style rounded card with icon and trend
// ──────────────────────────────────────────────────────────────
function KpiCard({ label, value, IconSvg, color, subtitle, trend, iconBg }) {
    return (
        <div className="dash-card">
            <div className="dash-card-header">
                <div className="dash-card-label">{label}</div>
                <div className="dash-card-icon" style={{ background: iconBg || `${color}18`, color }}>
                    <IconSvg />
                </div>
            </div>
            <div className="dash-card-value">{value}</div>
            <div className="dash-card-foot">
                {subtitle && <span className="dash-card-subtitle">{subtitle}</span>}
                {trend !== undefined && (
                    <span className="dash-trend" style={{ color: trend >= 0 ? '#10B981' : '#DC2626' }}>
                        <Icon d={trend >= 0 ? Icons.up : Icons.down} size={12} />
                        {Math.abs(trend)}%
                    </span>
                )}
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
//  Inline reusable icon components
// ──────────────────────────────────────────────────────────────
const StoreIcon = () => <Icon d={Icons.store} size={18} />;
const PackageIcon = () => <Icon d={Icons.package} size={18} />;
const CartIcon = () => <Icon d={Icons.cart} size={18} />;
const MoneyIcon = () => <Icon d={Icons.money} size={18} />;
const WarnIcon = () => <Icon d={Icons.warn} size={20} />;
const AlertIcon = () => <Icon d={Icons.alert} size={20} />;
const TruckIcon = () => <Icon d={Icons.truck} size={20} />;
const RefreshIcon = () => <Icon d={Icons.refresh} size={14} />;
const CheckIcon = () => <Icon d={Icons.check} size={12} />;

// ──────────────────────────────────────────────────────────────
//  Process step (workflow hub)
// ──────────────────────────────────────────────────────────────
function ProcessStep({ step, number, title, description, status, count }) {
    const statusColors = { completed: '#10B981', active: '#3B82F6', pending: '#9CA3AF' };
    const statusBg = { completed: '#DCFCE7', active: '#DBEAFE', pending: '#F3F4F6' };
    return (
        <div className="dash-step" style={{ background: statusBg[status], borderLeftColor: statusColors[status] }}>
            <div className="dash-step-circle" style={{ background: statusColors[status] }}>
                {status === 'completed' ? <CheckIcon /> : number}
            </div>
            <div className="dash-step-body">
                <div className="dash-step-title">{title}</div>
                {description && <div className="dash-step-desc">{description}</div>}
            </div>
            {count !== undefined && (
                <div className="dash-step-count" style={{ background: statusColors[status] }}>
                    {count}
                </div>
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
//  Color tokens
// ──────────────────────────────────────────────────────────────
const COLORS = {
    blue:   '#3B82F6',
    green:  '#10B981',
    amber:  '#F59E0B',
    purple: '#8B5CF6',
    red:    '#DC2626',
};

// ──────────────────────────────────────────────────────────────
//  Workflow tasks — loaded from /reports/workflow-counts
// ──────────────────────────────────────────────────────────────
function buildWorkflowSteps(wc = {}) {
    const stepStatus = (count) => count > 0 ? 'active' : 'pending';
    return [
        { number: 1, title: 'ASO tạo đơn',     description: 'Nhân viên ASO tạo đơn hàng',   status: wc.draft_count > 0 ? 'active' : 'pending',    count: wc.draft_count },
        { number: 2, title: 'Duyệt đơn',        description: 'Quản lý duyệt đơn',             status: wc.confirmed_count > 0 ? 'active' : 'pending', count: wc.confirmed_count },
        { number: 3, title: 'Xếp xe',           description: 'Xếp đơn vào chuyến giao',       status: wc.trip_preparing_count > 0 ? 'active' : 'pending', count: wc.trip_preparing_count },
        { number: 4, title: 'Xuất kho',         description: 'Xuất hàng tại kho',             status: wc.trip_delivering_count > 0 ? 'active' : 'pending', count: wc.trip_delivering_count },
        { number: 5, title: 'Giao hàng',        description: 'Tài xế giao hàng',              status: wc.trip_delivering_count > 0 ? 'active' : 'pending', count: wc.trip_delivering_count },
        { number: 6, title: 'POD',              description: 'Xác nhận giao hàng',          status: wc.pod_today > 0 ? 'active' : 'pending',         count: wc.pod_today },
        { number: 7, title: 'Đối soát',         description: 'Đối soát cuối ngày',           status: wc.pending_recon > 0 ? 'active' : 'pending',  count: wc.pending_recon },
    ];
}

// ──────────────────────────────────────────────────────────────
//  Main page
// ──────────────────────────────────────────────────────────────
export default function DashboardPage({ token }) {
    const [data, setData] = useState(null);
    const [workflowCounts, setWorkflowCounts] = useState({});
    const [partnerTypes, setPartnerTypes] = useState([]);
    const [topProducts, setTopProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const [activeTab, setActiveTab] = useState('overview');
    const [recentActivities, setRecentActivities] = useState([]);

    const load = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const [dashboard, types, top, wc] = await Promise.all([
                apiCall('GET', '/reports/dashboard', null, token),
                apiCall('GET', '/partners/stats/summary', null, token).catch(() => []),
                apiCall('GET', '/reports/top-products?limit=5', null, token).catch(() => []),
                apiCall('GET', '/reports/workflow-counts', null, token).catch(() => ({})),
            ]);
            setData(dashboard);
            setPartnerTypes(types || []);
            setTopProducts(top || []);
            setWorkflowCounts(wc || {});

            // Recent activity extracted from today's orders (if any)
            const todayOrders = await apiCall('GET', '/sales/orders?status=CONFIRMED', null, token).catch(() => []);
            setRecentActivities((todayOrders || []).slice(0, 4).map(o => ({
                id: o.so_id,
                title: `Đơn ${o.so_number}`,
                sub: o.partner_name,
                amount: parseFloat(o.total_amount) || 0,
                status: o.status,
                time: 'gần đây',
            })));
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token]);

    useEffect(() => { if (token) load(); }, [token, load]);

    if (loading) {
        return (
            <div className="dash-loading">
                <div className="spinner" /> Đang tải Dashboard...
            </div>
        );
    }

    const d = data || {
        overview: { partner_count: 0, product_count: 0, order_today: 0 },
        today: { total: 0, count: 0 },
        low_stock_count: 0,
        partner_stats: { aso_count: 0, store_count: 0, agent_count: 0, total_debt: 0 },
    };

    const partnerCount = parseInt(d.overview.partner_count || d.overview.customer_count || 0);
    const productCount = parseInt(d.overview.product_count || 0);
    const tripsDelivering = workflowCounts.trip_delivering_count || 0;
    const pendingRecon = workflowCounts.pending_recon || 0;
    const steps = buildWorkflowSteps(workflowCounts);

    return (
        <div className="dash">
            {/* ─── Header ──────────────────────────────── */}
            <div className="dash-header">
                <div>
                    <h1 className="dash-title">Dashboard ERP-FMCG</h1>
                    <div className="dash-subtitle">
                        {new Date().toLocaleDateString('vi-VN', {
                            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                        })}
                    </div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={load}>
                    <RefreshIcon /> Refresh
                </button>
            </div>

            {/* ─── Tabs ──────────────────────────────── */}
            <div className="dash-tabs">
                <button
                    className={`dash-tab ${activeTab === 'overview' ? 'active' : ''}`}
                    onClick={() => setActiveTab('overview')}
                >
                    Tổng quan
                </button>
                <button
                    className={`dash-tab ${activeTab === 'workflow' ? 'active' : ''}`}
                    onClick={() => setActiveTab('workflow')}
                >
                    Quy trình Hub
                </button>
                <button
                    className={`dash-tab ${activeTab === 'breakdown' ? 'active' : ''}`}
                    onClick={() => setActiveTab('breakdown')}
                >
                    Chi tiết
                </button>
            </div>

            {/* ─── OVERVIEW TAB ──────────────────────── */}
            {activeTab === 'overview' && (
                <div className="dash-grid">
                    <KpiCard
                        label="Tổng Partners"
                        value={fmt.num(partnerCount)}
                        IconSvg={StoreIcon}
                        color={COLORS.blue}
                        subtitle="Khách hàng & ASO"
                    />
                    <KpiCard
                        label="Sản phẩm"
                        value={fmt.num(productCount)}
                        IconSvg={PackageIcon}
                        color={COLORS.green}
                        subtitle="Đang kinh doanh"
                    />
                    <KpiCard
                        label="Đơn hàng hôm nay"
                        value={fmt.num(d.overview.order_today || 0)}
                        IconSvg={CartIcon}
                        color={COLORS.amber}
                        subtitle="Đã xác nhận"
                    />
                    <KpiCard
                        label="Doanh thu hôm nay"
                        value={fmt.vnd(d.today?.total || 0)}
                        IconSvg={MoneyIcon}
                        color={COLORS.purple}
                        subtitle={`${d.today?.count || 0} đơn`}
                        trend={8}
                    />
                </div>
            )}

            {activeTab === 'overview' && (
                <>
                    {/* ─── Alert cards ──────────────────────── */}
                    <div className="dash-grid-alert">
                        <div className="dash-alert warn">
                            <WarnIcon />
                            <div className="dash-alert-value" style={{ color: '#D97706' }}>
                                {fmt.num(d.low_stock_count || 0)}
                            </div>
                            <div className="dash-alert-label">Sản phẩm sắp hết hàng</div>
                        </div>
                        <div className="dash-alert danger">
                            <AlertIcon />
                            <div className="dash-alert-value" style={{ color: '#DC2626' }}>
                                {fmt.num(d.partner_stats?.total_debt > 0 ? 1 : 0)}
                            </div>
                            <div className="dash-alert-label">Tổng công nợ</div>
                            <div className="dash-alert-meta">{fmt.vnd(d.partner_stats?.total_debt || 0)}</div>
                        </div>
                        <div className="dash-alert info">
                            <TruckIcon />
                            <div className="dash-alert-value" style={{ color: '#2563EB' }}>{tripsDelivering}</div>
                            <div className="dash-alert-label">Chuyến đang giao</div>
                        </div>
                    </div>

                    {/* ─── Two-column body ────────────────── */}
                    <div className="dash-cols-2">
                        {/* Recent activity */}
                        <div className="card">
                            <div className="card-header">
                                <h3>Hoạt động gần đây</h3>
                            </div>
                            <div className="card-body">
                                {recentActivities.length === 0 ? (
                                    <div className="dash-empty">Chưa có hoạt động nào trong ngày</div>
                                ) : (
                                    <div className="dash-activity">
                                        {recentActivities.map((a, i) => (
                                            <div key={a.id || i} className="dash-activity-row">
                                                <CheckIcon />
                                                <div className="dash-activity-title">
                                                    <strong>{a.title}</strong>
                                                    <div className="dash-activity-sub">{a.sub}</div>
                                                </div>
                                                <div className="dash-activity-amount">
                                                    {fmt.vnd(a.amount)}
                                                </div>
                                                <div className="dash-activity-time">{a.time}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Top products preview */}
                        <div className="card">
                            <div className="card-header">
                                <h3>Top sản phẩm bán chạy</h3>
                            </div>
                            <div className="card-body">
                                {topProducts.length === 0 ? (
                                    <div className="dash-empty">Chưa có dữ liệu bán hàng</div>
                                ) : (
                                    <div className="dash-toptable">
                                        {topProducts.map((p, i) => (
                                            <div key={p.product_id} className="dash-toptable-row">
                                                <span className={`dash-rank rank-${i + 1}`}>{i + 1}</span>
                                                <div className="dash-toptable-name">
                                                    <strong>{p.product_name}</strong>
                                                    <div className="text-sm text-muted">
                                                        <code>{p.sku}</code> · {p.category_name}
                                                    </div>
                                                </div>
                                                <div className="dash-toptable-qty">
                                                    {fmt.num(p.total_qty_sold)}
                                                </div>
                                                <div className="dash-toptable-rev">
                                                    <strong>{fmt.vnd(p.total_revenue)}</strong>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ─── Partner type breakdown ──────────── */}
                    {partnerTypes.length > 0 && (
                        <div className="card">
                            <div className="card-header">
                                <h3>Phân bổ Partners theo loại</h3>
                            </div>
                            <div className="card-body">
                                <div className="dash-type-grid">
                                    {partnerTypes.map(t => {
                                        const c = ({
                                            STORE: COLORS.blue, ASO: COLORS.purple,
                                            SUPERMARKET: COLORS.green, CHAIN: COLORS.amber,
                                            AGENT: '#EC4899', INDIVIDUAL: '#6B7280',
                                            CORPORATE: '#DC2626',
                                        })[t.partner_type] || '#6B7280';
                                        return (
                                            <div key={t.partner_type} className="dash-type-cell" style={{ background: `${c}15`, borderColor: `${c}40` }}>
                                                <div className="dash-type-value" style={{ color: c }}>
                                                    {fmt.num(t.count)}
                                                </div>
                                                <div className="dash-type-label">{t.partner_type}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ─── WORKFLOW TAB ────────────────────────────── */}
            {activeTab === 'workflow' && (
                <div className="dash-cols-2">
                    <div className="card">
                        <div className="card-header">
                            <h3>Quy trình 7 bước FMCG</h3>
                        </div>
                        <div className="card-body">
                            {steps.map((step, idx) => (
                                <div key={step.number}>
                                    <ProcessStep {...step} />
                                    {idx < steps.length - 1 && (
                                        <div className="dash-step-connector"
                                            style={{ background: step.status === 'completed' ? '#10B981' : '#E5E7EB' }}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header">
                            <h3>Việc cần làm hôm nay</h3>
                        </div>
                        <div className="card-body">
                            <div className="dash-todo-list">
                                {(workflowCounts.confirmed_count > 0 || workflowCounts.trip_preparing_count > 0 || tripsDelivering > 0 || pendingRecon > 0) ? [
                                    { bg: '#FEE2E2', badge: '#DC2626', title: `Duyệt đơn chờ (${workflowCounts.confirmed_count || 0})`, sub: 'Cần xử lý ngay', count: workflowCounts.confirmed_count || 0 },
                                    { bg: '#FEF3C7', badge: '#F59E0B', title: `Xếp đơn vào xe (${workflowCounts.trip_preparing_count || 0})`, sub: 'Trước khi bắt đầu chuyến', count: workflowCounts.trip_preparing_count || 0 },
                                    { bg: '#DBEAFE', badge: '#3B82F6', title: `Chuyến đang giao (${tripsDelivering})`, sub: 'Tài xế đang trên đường', count: tripsDelivering },
                                    { bg: '#F3F4F6', badge: '#6B7280', title: `Đối soát COD chờ (${pendingRecon})`, sub: 'Cuối ngày', count: pendingRecon },
                                ].filter(t => t.count > 0).map((t, i) => (
                                    <div key={i} className="dash-todo-row" style={{ background: t.bg, cursor: 'pointer' }}>
                                        <input type="checkbox" />
                                        <div className="dash-todo-body">
                                            <div className="dash-todo-title">{t.title}</div>
                                            <div className="dash-todo-sub">{t.sub}</div>
                                        </div>
                                        <span className="dash-todo-count" style={{ background: t.badge }}>
                                            {t.count}
                                        </span>
                                    </div>
                                )) : (
                                    <div style={{ textAlign: 'center', padding: 20, color: '#6B7280' }}>
                                        Không có việc cần xử lý ngay hôm nay
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── BREAKDOWN TAB ──────────────────────────── */}
            {activeTab === 'breakdown' && (
                <div className="dash-cols-2">
                    <div className="card">
                        <div className="card-header">
                            <h3>Số liệu tổng hợp</h3>
                        </div>
                        <div className="card-body">
                            <div className="dash-stats-table">
                                <div className="dash-stats-row">
                                    <span>Tổng số Partner (KH + ASO)</span>
                                    <strong>{fmt.num(partnerCount)}</strong>
                                </div>
                                <div className="dash-stats-row">
                                    <span>Sản phẩm đang kinh doanh</span>
                                    <strong>{fmt.num(productCount)}</strong>
                                </div>
                                <div className="dash-stats-row">
                                    <span>Đơn bán hôm nay</span>
                                    <strong>{fmt.num(d.overview.order_today || 0)}</strong>
                                </div>
                                <div className="dash-stats-row">
                                    <span>Doanh thu hôm nay</span>
                                    <strong>{fmt.vnd(d.today?.total || 0)}</strong>
                                </div>
                                <div className="dash-stats-row">
                                    <span>Sản phẩm sắp hết hàng</span>
                                    <strong style={{ color: '#D97706' }}>
                                        {fmt.num(d.low_stock_count || 0)}
                                    </strong>
                                </div>
                                <div className="dash-stats-row">
                                    <span>Tổng công nợ phải thu</span>
                                    <strong style={{ color: '#DC2626' }}>
                                        {fmt.vnd(d.partner_stats?.total_debt || 0)}
                                    </strong>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header">
                            <h3>Lưu ý vận hành</h3>
                        </div>
                        <div className="card-body">
                            <div className="dash-notes">
                                <div className="dash-note-row">
                                    <span>🔄</span>
                                    <div>
                                        <strong>Auto-import khi khởi động</strong>
                                        <div className="dash-note-sub">
                                            Khi backend start, 3 file CSV sẽ tự động được
                                            import nếu database trống. Sau đó chỉ đọc.
                                        </div>
                                    </div>
                                </div>
                                <div className="dash-note-row">
                                    <span>🏪</span>
                                    <div>
                                        <strong>Customers + ASO = Partners</strong>
                                        <div className="dash-note-sub">
                                            Toàn bộ điểm bán (kể cả STORE &amp; ASO)
                                            được lưu chung trong <code>tenant.partners</code>.
                                        </div>
                                    </div>
                                </div>
                                <div className="dash-note-row">
                                    <span>📦</span>
                                    <div>
                                        <strong>Tồn kho theo stock_ledger</strong>
                                        <div className="dash-note-sub">
                                            Tồn kho được tính từ sổ cái
                                            <code> tenant.stock_ledger</code>, cập nhật real-time
                                            từ các phiếu nhập / xuất.
                                        </div>
                                    </div>
                                </div>
                                <div className="dash-note-row">
                                    <span>🔐</span>
                                    <div>
                                        <strong>Role có MFA</strong>
                                        <div className="dash-note-sub">
                                            OWNER / ADMIN / SALES_ADMIN bắt buộc cấu hình MFA.
                                            Các role khác có thể bỏ qua.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {err && <div className="alert alert-warning" style={{ marginTop: 16 }}>
                Cảnh báo: {err}. Một số số liệu có thể hiển thị giá trị mặc định.
            </div>}
        </div>
    );
}
