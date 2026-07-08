/**
 * MfaVerify — Verify OTP khi đăng nhập lại (MFA đã bật từ trước)
 */

import { useState } from 'react';
import OTPInput from './OTPInput';
import { useAuth } from '../AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function MfaVerify({ onBack }) {
    const { jwtToken, user, markMfaVerified } = useAuth();
    const [error, setError]       = useState('');
    const [loading, setLoading]   = useState(false);

    const handleOtpComplete = async (otp) => {
        setLoading(true);
        setError('');
        try {
            const r = await fetch(`${API_BASE}/api/mfa/verify-login`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwtToken}` },
                body:    JSON.stringify({ token: otp }),
            });
            const json = await r.json();
            if (json.success && json.data.verified) {
                markMfaVerified();
                // useEffect ở App.jsx sẽ detect verified=true → render dashboard
            } else {
                setError(json.error?.message || 'Mã OTP không đúng');
            }
        } catch (e) {
            setError('Lỗi kết nối. Vui lòng thử lại.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-card" style={{ maxWidth: 440 }}>
            <button
                onClick={onBack}
                style={{
                    background: 'none', border: 'none', color: 'var(--gray-500)',
                    cursor: 'pointer', fontSize: '.85rem', marginBottom: 8,
                }}
            >← Đăng xuất</button>

            <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{
                    width: 56, height: 56, background: '#DBEAFE',
                    borderRadius: '50%', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', margin: '0 auto 12px', color: 'var(--primary)',
                    fontSize: '1.75rem',
                }}>🔒</div>
                <h2 style={{ marginBottom: 4 }}>Xác thực hai yếu tố</h2>
                <p style={{ color: 'var(--gray-500)', fontSize: '.875rem' }}>
                    Nhập mã 6 số từ Google Authenticator
                </p>
                <p style={{ color: 'var(--gray-700)', fontSize: '.85rem', marginTop: 4 }}>
                    <strong>{user?.email}</strong>
                </p>
            </div>

            <OTPInput
                onComplete={handleOtpComplete}
                disabled={loading}
                error={error}
            />

            {error && (
                <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>
            )}
        </div>
    );
}
