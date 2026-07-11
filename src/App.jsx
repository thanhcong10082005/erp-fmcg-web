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
import DispatcherMapPage from './pages/DispatcherMapPage';
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

const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'partners', label: 'Partners', icon: '👥' },
    { id: 'products', label: 'Sản phẩm', icon: '📦' },
    { id: 'sales', label: 'Đơn bán hàng', icon: '🛒' },
    { id: 'logistics', label: 'Giao hàng', icon: '🚚' },
    { id: 'dispatcher-map', label: 'Bản đồ điều phối', icon: '🗺️' },
    { id: 'warehouse', label: 'Kho & Tồn kho', icon: '🏭' },
    { id: 'invoices', label: 'Hóa đơn', icon: '🧾' },
    { id: 'payments', label: 'Thu chi', icon: '💳' },
    { id: 'reports', label: 'Báo cáo', icon: '📈' },
    { id: 'rbac', label: 'RBAC Admin', icon: '🛡️' },
];

function LoginPage({ onPasswordLogin, onShowRegister, loading, error }) {
    const { loading: authLoading } = useAuth();
    const [email, setEmail] = useState('');
    const [pw, setPw]     = useState('');
    const [localLoading, setLocalLoading] = useState(false);

    const handlePasswordLogin = async (e) => {
        e.preventDefault();
        setLocalLoading(true);
        await onPasswordLogin(email, pw);
        setLocalLoading(false);
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

                <div style={{ textAlign: 'center', marginTop: 16 }}>
                    <button
                        type="button"
                        onClick={onShowRegister}
                        style={{ background: 'none', border: 'none', color: '#3B82F6', cursor: 'pointer', fontSize: '.875rem', fontWeight: 600, textDecoration: 'underline' }}
                    >
                        Chưa có tài khoản? Đăng ký ngay
                    </button>
                </div>
            </div>
        </div>
    );
}

function ErpAppShell() {
    const { user, jwtToken, userRole, loading, mfaState, passwordLogin, logout } = useAuth();
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

    return (
        <div className="app">
            <div className="topbar">
                <h1>🏢 ERP-FMCG</h1>
                <div className="flex">
                    <span className="badge" style={{ background: 'var(--primary)' }}>{user?.email}</span>
                    {userRole && (
                        <span className="badge" style={{ background: mfaState?.mfa_required ? '#DC2626' : 'var(--success)' }}>
                            {userRole} {mfaState?.mfa_required && '🔐'}
                        </span>
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
                    {section === 'dispatcher-map' && <DispatcherMapPage token={jwtToken} userRole={userRole}/>}
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
