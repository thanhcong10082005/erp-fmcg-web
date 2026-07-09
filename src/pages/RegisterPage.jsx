/**
 * RegisterPage — ERP-FMCG
 * Đăng ký tài khoản mới.
 * Account được tạo với role = PENDING (null).
 * OWNER phải gán role trong RBAC Admin trước khi user có thể đăng nhập.
 */
import React, { useState } from 'react';

const ERP_API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const TENANTS = [
    { value: 'PHN', label: 'PHN — Phụng Hoàng Nguyên' },
    { value: 'BACH_HOA', label: 'BACH_HOA — Bách Hóa' },
];

export default function RegisterPage({ onBack }) {
    const [form, setForm] = useState({
        tenant_id: 'PHN',
        full_name: '',
        email: '',
        username: '',
        password: '',
        confirmPassword: '',
    });
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [loading, setLoading] = useState(false);

    const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

    const validate = () => {
        if (!form.full_name.trim()) return 'Họ tên không được để trống.';
        if (!form.email.trim()) return 'Email không được để trống.';
        if (!form.username.trim()) return 'Tên đăng nhập không được để trống.';
        if (!form.password) return 'Mật khẩu không được để trống.';
        if (form.password.length < 6) return 'Mật khẩu phải có ít nhất 6 ký tự.';
        if (form.password !== form.confirmPassword) return 'Mật khẩu xác nhận không khớp.';
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRe.test(form.email)) return 'Email không hợp lệ.';
        return null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        const validationError = validate();
        if (validationError) { setError(validationError); return; }

        setLoading(true);
        try {
            const r = await fetch(`${ERP_API}/auth/register?tenant_id=${form.tenant_id}`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    full_name: form.full_name.trim(),
                    email:     form.email.trim().toLowerCase(),
                    username:  form.username.trim().toLowerCase(),
                    password:  form.password,
                }),
            });
            const json = await r.json();

            if (!r.ok) {
                throw new Error(json.message || json.error || `HTTP ${r.status}`);
            }

            setSuccess(
                `Đăng ký thành công!\n\n` +
                `Tài khoản của bạn đang chờ duyệt. Vui lòng liên hệ OWNER để được cấp quyền truy cập.\n\n` +
                `Email: ${form.email}`
            );
            setForm(f => ({ ...f, password: '', confirmPassword: '' }));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2744 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
            <div style={{
                background: '#fff', borderRadius: 16, padding: '40px 36px',
                width: '100%', maxWidth: 520,
                boxShadow: '0 20px 60px rgba(0,0,0,.3)',
            }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <button
                        onClick={onBack}
                        style={{ position: 'absolute', top: 20, left: 20, background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.5rem' }}
                        title="Quay lại đăng nhập"
                    >←</button>
                    <div style={{ fontSize: '2.2rem', marginBottom: 8 }}>🏢</div>
                    <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#111827', margin: 0 }}>Đăng ký tài khoản</h1>
                    <p style={{ color: '#6B7280', fontSize: '.8rem', marginTop: 6 }}>
                        Account sẽ có quyền PENDING — liên hệ OWNER để được cấp quyền.
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div style={{
                        background: '#FEE2E2', border: '1px solid #DC2626', borderRadius: 8,
                        padding: '10px 14px', marginBottom: 16, color: '#7F1D1D',
                        fontSize: '.85rem', whiteSpace: 'pre-wrap',
                    }}>
                        ⚠️ {error}
                    </div>
                )}

                {/* Success */}
                {success && (
                    <div style={{
                        background: '#DCFCE7', border: '1px solid #16A34A', borderRadius: 8,
                        padding: '10px 14px', marginBottom: 16, color: '#14532D',
                        fontSize: '.85rem', whiteSpace: 'pre-wrap',
                    }}>
                        ✅ {success}
                    </div>
                )}

                {/* Form */}
                {!success && (
                    <form onSubmit={handleSubmit}>
                        {/* Tenant */}
                        <div className="form-group">
                            <label>Nhà phân phối (Tenant)</label>
                            <select value={form.tenant_id} onChange={set('tenant_id')} required>
                                {TENANTS.map(t => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Full name */}
                        <div className="form-group">
                            <label>Họ và tên <span style={{ color: '#DC2626' }}>*</span></label>
                            <input
                                type="text" value={form.full_name}
                                onChange={set('full_name')} required
                                placeholder="Nguyễn Văn A"
                                maxLength={255}
                            />
                        </div>

                        {/* Email */}
                        <div className="form-group">
                            <label>Email <span style={{ color: '#DC2626' }}>*</span></label>
                            <input
                                type="email" value={form.email}
                                onChange={set('email')} required
                                placeholder="nguyenvana@example.com"
                                autoComplete="email"
                            />
                        </div>

                        {/* Username */}
                        <div className="form-group">
                            <label>Tên đăng nhập <span style={{ color: '#DC2626' }}>*</span></label>
                            <input
                                type="text" value={form.username}
                                onChange={set('username')} required
                                placeholder="nguyenvana"
                                maxLength={100}
                            />
                            <small style={{ color: '#6B7280', fontSize: '.75rem' }}>
                                Không dấu, không khoảng trắng. Duy nhất trong tenant.
                            </small>
                        </div>

                        {/* Password */}
                        <div className="form-group">
                            <label>Mật khẩu <span style={{ color: '#DC2626' }}>*</span></label>
                            <input
                                type="password" value={form.password}
                                onChange={set('password')} required
                                placeholder="Tối thiểu 6 ký tự"
                                minLength={6} maxLength={128}
                                autoComplete="new-password"
                            />
                        </div>

                        {/* Confirm password */}
                        <div className="form-group">
                            <label>Xác nhận mật khẩu <span style={{ color: '#DC2626' }}>*</span></label>
                            <input
                                type="password" value={form.confirmPassword}
                                onChange={set('confirmPassword')} required
                                placeholder="Nhập lại mật khẩu"
                                autoComplete="new-password"
                            />
                        </div>

                        <button type="submit" className="btn btn-primary btn-full" disabled={loading}
                            style={{ marginTop: 8 }}>
                            {loading
                                ? <><span className="spinner"/> Đang đăng ký...</>
                                : 'Đăng ký'
                            }
                        </button>
                    </form>
                )}

                {/* Back to login */}
                <div style={{ textAlign: 'center', marginTop: 20 }}>
                    <button
                        type="button"
                        onClick={onBack}
                        style={{ background: 'none', border: 'none', color: '#3B82F6', cursor: 'pointer', fontSize: '.875rem', fontWeight: 600 }}
                    >
                        ← Quay lại trang đăng nhập
                    </button>
                </div>
            </div>
        </div>
    );
}
