/**
 * MfaSetup — Component thiết lập MFA lần đầu
 * Hiển thị QR code để quét bằng Google Authenticator
 */

import { useEffect, useState } from 'react';
import OTPInput from './OTPInput';
import { useAuth } from '../AuthContext';

const API_BASE = 'http://localhost:3001';

export default function MfaSetup({ onBack, onCompleted }) {
    const { jwtToken, markMfaVerified, user } = useAuth();
    const [setupData, setSetupData] = useState(null);
    const [loading, setLoading]                 = useState(false);
    const [error, setError]                     = useState('');
    const [backupCodes, setBackupCodes]         = useState([]);
    const [showBackupCodes, setShowBackupCodes] = useState(false);
    const [localLoading, setLocalLoading]       = useState(false);

    useEffect(() => {
        initiateSetup();
    }, []);

    const initiateSetup = async () => {
        setLoading(true);
        setError('');
        try {
            const r = await fetch(`${API_BASE}/api/mfa/setup`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwtToken}` },
                body:    JSON.stringify({}),
            });
            const json = await r.json();
            if (json.success) {
                setSetupData(json.data);
            } else {
                setError(json.error?.message || 'Không thể khởi tạo MFA');
            }
        } catch (e) {
            setError('Lỗi kết nối server. Vui lòng thử lại.');
        } finally {
            setLoading(false);
        }
    };

    const handleOtpComplete = async (otp) => {
        setLocalLoading(true);
        setError('');
        try {
            const r = await fetch(`${API_BASE}/api/mfa/verify-setup`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwtToken}` },
                body:    JSON.stringify({ token: otp }),
            });
            const json = await r.json();
            if (json.success) {
                setBackupCodes(json.data.backup_codes || []);
                setShowBackupCodes(true);
                markMfaVerified();
            } else {
                setError(json.error?.message || 'Mã OTP không đúng');
            }
        } catch (e) {
            setError('Lỗi kết nối. Vui lòng thử lại.');
        } finally {
            setLocalLoading(false);
        }
    };

    // Sau khi setup xong, hiển thị backup codes
    if (showBackupCodes) {
        return (
            <div className="auth-card" style={{ maxWidth: 480 }}>
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                    <div style={{
                        width: 64, height: 64, background: '#D1FAE5',
                        borderRadius: '50%', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', margin: '0 auto 12px', color: 'var(--success)',
                        fontSize: '2rem',
                    }}>✓</div>
                    <h2 style={{ color: 'var(--success)' }}>Kích hoạt 2FA thành công!</h2>
                    <p style={{ color: 'var(--warning)', fontSize: '.875rem', marginTop: 8 }}>
                        ⚠️ Lưu giữ các mã dự phòng này ở nơi an toàn
                    </p>
                </div>

                <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                    background: 'var(--gray-50)', padding: 16, borderRadius: 8, marginBottom: 16,
                }}>
                    {backupCodes.map((c, i) => (
                        <code key={i} style={{
                            padding: '6px 8px', background: '#fff',
                            border: '1px solid var(--gray-200)', borderRadius: 4,
                            fontSize: '.85rem', textAlign: 'center',
                        }}>{c.display}</code>
                    ))}
                </div>

                <button
                    className="btn btn-primary btn-full"
                    onClick={onCompleted}
                >
                    Tiếp tục vào hệ thống
                </button>
            </div>
        );
    }

    return (
        <div className="auth-card" style={{ maxWidth: 520 }}>
            <button
                onClick={onBack}
                style={{
                    background: 'none', border: 'none', color: 'var(--gray-500)',
                    cursor: 'pointer', fontSize: '.85rem', marginBottom: 8,
                }}
            >← Quay lại</button>

            <h2 style={{ marginBottom: 4 }}>🛡️ Kích hoạt bảo mật 2 lớp</h2>
            <p style={{ color: 'var(--gray-500)', fontSize: '.875rem', marginBottom: 16 }}>
                Tài khoản <strong>{user?.email}</strong> thuộc nhóm quản trị, cần bật MFA bắt buộc.
            </p>

            <div style={{
                background: '#FEF3C7', border: '1px solid var(--warning)',
                borderRadius: 8, padding: 12, fontSize: '.8rem', marginBottom: 16, color: '#92400E',
            }}>
                <strong>Hướng dẫn:</strong>
                <ol style={{ marginLeft: 20, marginTop: 4 }}>
                    <li>Tải <strong>Google Authenticator</strong> (App Store / CH Play)</li>
                    <li>Nhấn <strong>+</strong> → "Quét mã QR"</li>
                    <li>Quét mã bên dưới</li>
                    <li>Nhập mã 6 số hiển thị trong app</li>
                </ol>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 32 }}>
                    <div className="spinner" style={{ width: 32, height: 32 }}/>
                    <p style={{ marginTop: 8, color: 'var(--gray-500)' }}>Đang tạo mã QR...</p>
                </div>
            ) : setupData?.qr_code ? (
                <>
                    <div style={{ textAlign: 'center', marginBottom: 16 }}>
                        <img
                            src={setupData.qr_code}
                            alt="Mã QR thiết lập Google Authenticator"
                            style={{ display: 'inline-block', maxWidth: 220, border: '1px solid var(--gray-200)', borderRadius: 8 }}
                        />
                    </div>

                    <details style={{ marginBottom: 16, fontSize: '.8rem', color: 'var(--gray-500)' }}>
                        <summary style={{ cursor: 'pointer' }}>Không quét được? Nhập thủ công</summary>
                        <code style={{
                            display: 'block', marginTop: 8, padding: 8,
                            background: 'var(--gray-50)', borderRadius: 4, wordBreak: 'break-all',
                        }}>{setupData.secret}</code>
                    </details>

                    <p style={{ fontSize: '.85rem', color: 'var(--gray-700)', marginBottom: 12, textAlign: 'center' }}>
                        Nhập mã 6 số từ Google Authenticator:
                    </p>

                    <OTPInput
                        onComplete={handleOtpComplete}
                        disabled={localLoading}
                        error={error}
                    />

                    {error && (
                        <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>
                    )}

                    <button
                        onClick={initiateSetup}
                        className="btn btn-outline btn-sm"
                        style={{ marginTop: 12, width: '100%' }}
                        disabled={localLoading}
                    >
                        Tạo lại mã QR
                    </button>
                </>
            ) : error ? (
                <div className="alert alert-error">{error}</div>
            ) : null}
        </div>
    );
}
