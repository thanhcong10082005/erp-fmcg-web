import React, { useState } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebase';
import DashboardPage from './pages/DashboardPage';
import PartnersPage from './pages/PartnersPage';
import ProductsPage from './pages/ProductsPage';
import SalesOrdersPage from './pages/SalesOrdersPage';
import WarehousePage from './pages/WarehousePage';
import InvoicesPage from './pages/InvoicesPage';
import ReportsPage from './pages/ReportsPage';
import RbacAdminPage from './pages/RbacAdminPage';
import LogisticsPage from './pages/LogisticsPage';
// import CodReconciliationPage from './pages/CodReconciliationPage';
import PaymentsPage from './pages/PaymentsPage';
import MfaSetup from './components/MfaSetup';
import MfaVerify from './components/MfaVerify';
import RegisterPage from './pages/RegisterPage';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null, info: null };
    }
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error, info) {
        console.error('[ErrorBoundary]', error, info);
        this.setState({ info });
    }
    render() {
        if (this.state.error) {
            return (
                <div style={{
                    minHeight: '100vh', background: '#FEE2E2', color: '#7F1D1D',
                    padding: 24, fontFamily: 'Consolas, monospace',
                }}>
                    <h1 style={{ fontSize: '1.5rem', marginBottom: 12 }}>Runtime Error</h1>
                    <div style={{ background: '#fff', border: '1px solid #DC2626', borderRadius: 8, padding: 16, marginBottom: 12 }}>
                        <strong style={{ color: '#DC2626' }}>{this.state.error.message || String(this.state.error)}</strong>
                    </div>
                    <pre style={{ background: '#fff', padding: 12, borderRadius: 8, overflow: 'auto', fontSize: '.8rem' }}>
{this.state.error.stack}
                    </pre>
                    {this.state.info && (
                        <details style={{ marginTop: 12 }}>
                            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Component stack</summary>
                            <pre style={{ background: '#fff', padding: 12, borderRadius: 8, overflow: 'auto', fontSize: '.8rem', marginTop: 8 }}>
{this.state.info.componentStack}
                            </pre>
                        </details>
                    )}
                    <button
                        onClick={() => location.reload()}
                        style={{ marginTop: 16, padding: '8px 16px', background: '#DC2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}
                    >Reload page</button>
                </div>
            );
        }
        return this.props.children;
    }
}

const API_BASE = 'http://localhost:3001/api';

const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'partners', label: 'Partners', icon: '👥' },  // Đổi từ 'customers'
    { id: 'products', label: 'Sản phẩm', icon: '📦' },
    { id: 'sales', label: 'Đơn bán hàng', icon: '🛒' },
    { id: 'logistics', label: 'Giao hàng', icon: '🚚' },
    { id: 'warehouse', label: 'Kho & Tồn kho', icon: '🏭' },
    { id: 'invoices', label: 'Hóa đơn', icon: '🧾' },
    { id: 'payments', label: 'Thu chi', icon: '💳' },
    { id: 'reports', label: 'Báo cáo', icon: '📈' },
    { id: 'rbac', label: 'RBAC Admin', icon: '🛡️' },
];

// PHN users
const DEV_USERS_PHN = [
    { user_id: 1,  label: '👤 thanhcongaptx48@gmail.com — OWNER (PHN)',          role: 'OWNER' },
    { user_id: 2,  label: '👤 admin@phn.vn           — ADMIN (PHN)',            role: 'ADMIN' },
    { user_id: 3,  label: '👤 salesadmin@phn.vn      — SALES_ADMIN (PHN)',      role: 'SALES_ADMIN' },
    { user_id: 4,  label: '👤 truongteam1@phn.vn     — SALES_MANAGER (PHN)',   role: 'SALES_MANAGER' },
    { user_id: 5,  label: '👤 nvkd1@phn.vn           — SALES_REP (PHN)',        role: 'SALES_REP' },
    { user_id: 6,  label: '👤 dcr001@phn.vn          — DCR (PHN)',              role: 'DCR' },
    { user_id: 7,  label: '👤 ketoan001@phn.vn       — ACCOUNTANT (PHN)',       role: 'ACCOUNTANT' },
    { user_id: 8,  label: '👤 qlykho001@phn.vn        — WAREHOUSE_MANAGER (PHN)',role: 'WAREHOUSE_MANAGER' },
    { user_id: 9,  label: '👤 nvkho001@phn.vn         — WAREHOUSE_STAFF (PHN)',  role: 'WAREHOUSE_STAFF' },
];
// BACH_HOA users
const DEV_USERS_BACHHOA = [
    { user_id: 10, label: '👤 thanhtx@gmail.com        — OWNER (BACH_HOA)',      role: 'OWNER' },
    { user_id: 11, label: '👤 admin@bachhoa.vn        — ADMIN (BACH_HOA)',        role: 'ADMIN' },
    { user_id: 12, label: '👤 salesmgr@bachhoa.vn    — SALES_MANAGER (BH)',      role: 'SALES_MANAGER' },
    { user_id: 13, label: '👤 dcr@bachhoa.vn          — DCR (BACH_HOA)',         role: 'DCR' },
    { user_id: 14, label: '👤 ketoan@bachhoa.vn       — ACCOUNTANT (BACH_HOA)',   role: 'ACCOUNTANT' },
];

function LoginPage({ onDevMode, onPasswordLogin, onShowRegister, loading, error }) {
    const { loading: authLoading } = useAuth();
    const [email, setEmail] = useState('');
    const [pw, setPw]     = useState('');
    const [showDev, setShowDev] = useState(false);
    const [devLoading, setDevLoading] = useState(false);
    const [localLoading, setLocalLoading] = useState(false);

    const handlePasswordLogin = async (e) => {
        e.preventDefault();
        setLocalLoading(true);
        await onPasswordLogin(email, pw);
        setLocalLoading(false);
    };

    const handleDevSelect = async (userId) => {
        setDevLoading(true);
        await onDevMode(userId);
        setDevLoading(false);
    };

    const isLoading = localLoading || authLoading || loading;

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2744 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
            <div style={{
                background: '#fff', borderRadius: 16, padding: '40px 36px',
                width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,.3)',
            }}>
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🏢</div>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827', margin: 0 }}>ERP-FMCG</h1>
                    <p style={{ color: '#6B7280', fontSize: '.875rem', marginTop: 4 }}>Hệ thống quản lý NPP FMCG</p>
                </div>

                {error && (
                    <div className="alert alert-error" style={{ marginBottom: 16, fontSize: '.85rem' }}>
                        {error}
                    </div>
                )}

                {/* Password Login — Main flow */}
                <form onSubmit={handlePasswordLogin}>
                    <div className="form-group">
                        <label>Email</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="nguyenvana@example.com" />
                    </div>
                    <div className="form-group">
                        <label>Mật khẩu</label>
                        <input type="password" value={pw} onChange={e => setPw(e.target.value)} required autoComplete="current-password" placeholder="••••••" />
                    </div>
                    <button type="submit" className="btn btn-primary btn-full" disabled={isLoading}>
                        {isLoading ? <><span className="spinner"/> Đang đăng nhập...</> : 'Đăng nhập'}
                    </button>
                </form>

                {/* Register link */}
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                    <button
                        type="button"
                        onClick={onShowRegister}
                        style={{ background: 'none', border: 'none', color: '#3B82F6', cursor: 'pointer', fontSize: '.875rem', fontWeight: 600, textDecoration: 'underline' }}
                    >
                        Chưa có tài khoản? Đăng ký ngay
                    </button>
                </div>

                {/* Dev Mode */}
                <div style={{ borderTop: '1px solid #E5E7EB', marginTop: 24, paddingTop: 24 }}>
                    <button
                        className="btn btn-outline btn-full"
                        style={{ marginBottom: showDev ? 12 : 0 }}
                        onClick={() => setShowDev(v => !v)}
                    >
                        🧪 Dev Mode {showDev ? '▲' : '▼'}
                    </button>

                    {showDev && (
                        <div style={{ marginTop: 12 }}>
                            <p style={{ fontSize: '.8rem', color: '#6B7280', marginBottom: 8 }}>
                                ⚠️ Dev Mode bỏ qua Firebase — chỉ dùng để test. Role <strong>OWNER/ADMIN/SALES_ADMIN</strong> bắt buộc MFA.
                            </p>

                            {/* PHN */}
                            <div style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#374151', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    PHN — NPP Phụng Hoàng Nguyên
                                </div>
                                {DEV_USERS_PHN.map(u => (
                                    <button
                                        key={u.user_id}
                                        className="btn btn-outline btn-full"
                                        style={{ fontSize: '.78rem', textAlign: 'left', marginBottom: 4, padding: '6px 10px' }}
                                        onClick={() => handleDevSelect(u.user_id)}
                                        disabled={devLoading}
                                    >
                                        {u.label}
                                    </button>
                                ))}
                            </div>

                            {/* BACH_HOA */}
                            <div>
                                <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#374151', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    BACH_HOA — Bách Hóa
                                </div>
                                {DEV_USERS_BACHHOA.map(u => (
                                    <button
                                        key={u.user_id}
                                        className="btn btn-outline btn-full"
                                        style={{ fontSize: '.78rem', textAlign: 'left', marginBottom: 4, padding: '6px 10px' }}
                                        onClick={() => handleDevSelect(u.user_id)}
                                        disabled={devLoading}
                                    >
                                        {u.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ErpAppShell() {
    const { user, jwtToken, userRole, loading, mfaState, devMode, devLogin, passwordLogin, logout } = useAuth();
    const [section, setSection] = useState('dashboard');
    const [mfaPhase, setMfaPhase] = useState('none');
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [showRegister, setShowRegister] = useState(false);

    React.useEffect(() => {
        if (!user) { setMfaPhase('none'); return; }
        if (loading) return;
        if (mfaState?.mfa_required) {
            if (mfaState.setupRequired) { setMfaPhase('setup'); return; }
            if (mfaState.enabled && !mfaState.verified) { setMfaPhase('verify'); return; }
            setMfaPhase('none'); return;
        }
        setMfaPhase('none');
    }, [user, loading, mfaState, userRole]);

    const handlePasswordLogin = async (email, password) => {
        await passwordLogin(email, password);
    };

    const handleLogout = async () => {
        await logout();
        setShowRegister(false);
    };

    if (showRegister) {
        return <RegisterPage onBack={() => setShowRegister(false)} />;
    }

    if (loading) {
        return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
            <span className="spinner" style={{ width: 32, height: 32 }}/>
        </div>;
    }

    if (!user) return (
        <LoginPage
            onDevMode={devLogin}
            onPasswordLogin={handlePasswordLogin}
            onShowRegister={() => setShowRegister(true)}
            loading={false}
            error={null}
        />
    );

    if (mfaPhase === 'setup') {
        return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f2744' }}>
            <MfaSetup onBack={handleLogout} onCompleted={() => setMfaPhase('none')} />
        </div>;
    }
    if (mfaPhase === 'verify') {
        return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f2744' }}>
            <MfaVerify onBack={handleLogout} />
        </div>;
    }

    const currentNav = NAV_ITEMS.find(n => n.id === section);

    return (
        <div className="app">
            <div className="topbar">
                <h1>🏢 ERP-FMCG</h1>
                <div className="flex">
                    {devMode ? (
                        <span className="badge" style={{ background: '#78350F' }}>🧪 DEV MODE</span>
                    ) : (
                        <>
                            <span className="badge" style={{ background: 'var(--primary)' }}>{user?.email}</span>
                            {userRole && (
                                <span className="badge" style={{ background: mfaState?.mfa_required ? '#DC2626' : 'var(--success)' }}>
                                    {userRole} {mfaState?.mfa_required && '🔐'}
                                </span>
                            )}
                        </>
                    )}
                    <button className="btn btn-outline btn-sm" onClick={handleLogout}
                        style={{ color: '#fff', borderColor: '#6B7280' }}>Đăng xuất</button>
                </div>
            </div>

            <div className="main">
                <nav className="sidebar" style={{ width: sidebarOpen ? 240 : 60 }}>
                    <div className="sidebar-title">
                        {sidebarOpen && 'Modules'}
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', float: 'right' }}
                        >
                            {sidebarOpen ? '◀' : '▶'}
                        </button>
                    </div>
                    {NAV_ITEMS.map(n => (
                        <button key={n.id}
                            className={`sidebar-btn ${section === n.id ? 'active' : ''}`}
                            onClick={() => setSection(n.id)}
                            title={n.label}>
                            <span style={{ fontSize: '1.2rem' }}>{n.icon}</span>
                            {sidebarOpen && <span>{n.label}</span>}
                        </button>
                    ))}
                </nav>

                <main className="content">
                    {section === 'dashboard' && <DashboardPage token={jwtToken}/>}
                    {section === 'partners' && <PartnersPage token={jwtToken}/>}
                    {section === 'products' && <ProductsPage token={jwtToken}/>}
                    {section === 'sales' && <SalesOrdersPage token={jwtToken}/>}
                    {section === 'warehouse' && <WarehousePage token={jwtToken}/>}
                    {section === 'invoices' && <InvoicesPage token={jwtToken}/>}
                    {section === 'logistics' && <LogisticsPage token={jwtToken}/>}
                    {/* COD page removed - not needed in v6 */}
                    {section === 'payments' && <PaymentsPage token={jwtToken}/>}
                    {section === 'reports' && <ReportsPage token={jwtToken}/>}
                    {section === 'rbac' && <RbacAdminPage token={jwtToken}/>}
                </main>
            </div>
        </div>
    );
}

export default function App() {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <ErpAppShell/>
            </AuthProvider>
        </ErrorBoundary>
    );
}
