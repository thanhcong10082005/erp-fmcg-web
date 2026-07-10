/**
 * MfaVerify — Verify OTP khi đăng nhập lại (MFA đã bật từ trước)
 * Hỗ trợ 2 tab: "Mã Google Authenticator" và "Mã dự phòng"
 */

import { useState } from 'react';
import OTPInput from './OTPInput';
import { useAuth } from '../AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function MfaVerify({ onBack }) {
    const { jwtToken, user, markMfaVerified } = useAuth();
    const [tab, setTab] = useState('otp'); // 'otp' | 'backup'
    const [otpError, setOtpError]       = useState('');
    const [backupError, setBackupError] = useState('');
    const [otpLoading, setOtpLoading]   = useState(false);
    const [backupLoading, setBackupLoading] = useState(false);

    // ── OTP tab ──────────────────────────────────────────────────────────────
    const handleOtpComplete = async (otp) => {
        setOtpLoading(true);
        setOtpError('');
        try {
            const r = await fetch(`${API_BASE}/mfa/verify-login`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwtToken}` },
                body:    JSON.stringify({ token: otp }),
            });
            const json = await r.json();
            if (json.success && json.data.verified) {
                markMfaVerified();
            } else {
                setOtpError(json.error?.message || json.data?.message || 'Mã OTP không đúng');
            }
        } catch (e) {
            setOtpError('Lỗi kết nối. Vui lòng thử lại.');
        } finally {
            setOtpLoading(false);
        }
    };

    // ── Backup code tab ───────────────────────────────────────────────────────
    const [backupCode, setBackupCode] = useState('');

    const handleBackupSubmit = async (e) => {
        e.preventDefault();
        if (!backupCode.trim()) {
            setBackupError('Vui lòng nhập mã dự phòng.');
            return;
        }
        setBackupLoading(true);
        setBackupError('');
        try {
            const r = await fetch(`${API_BASE}/mfa/verify-backup`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwtToken}` },
                body:    JSON.stringify({ code: backupCode.trim() }),
            });
            const json = await r.json();
            if (json.success && json.data.verified) {
                const remaining = json.data.remaining ?? 0;
                if (remaining < 3) {
                    // Show warning before proceeding
                    const proceed = window.confirm(
                        `⚠️ Cảnh báo: Bạn chỉ còn ${remaining} mã dự phòng. ` +
                        `Sau khi dùng hết, bạn cần setup lại MFA. Bạn có muốn tiếp tục?`
                    );
                    if (!proceed) {
                        setBackupLoading(false);
                        return;
                    }
                }
                markMfaVerified();
            } else {
                setBackupError(json.error?.message || 'Mã dự phòng không đúng hoặc đã được sử dụng.');
            }
        } catch (e) {
            setBackupError('Lỗi kết nối. Vui lòng thử lại.');
        } finally {
            setBackupLoading(false);
        }
    };

    return (
        <div className="auth-card" style={{ maxWidth: 480 }}>
            <button
                onClick={onBack}
                style={{
                    background: 'none', border: 'none', color: 'var(--gray-500)',
                    cursor: 'pointer', fontSize: '.85rem', marginBottom: 8,
                }}
            >← Đăng xuất</button>

            <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{
                    width: 56, height: 56, background: '#DBEAFE',
                    borderRadius: '50%', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', margin: '0 auto 12px', color: 'var(--primary)',
                    fontSize: '1.75rem',
                }}>🔒</div>
                <h2 style={{ marginBottom: 4 }}>Xác thực hai yếu tố</h2>
                <p style={{ color: 'var(--gray-500)', fontSize: '.875rem' }}>
                    Tài khoản: <strong>{user?.email}</strong>
                </p>
            </div>

            {/* Tab switcher */}
            <div style={{
                display: 'flex', borderBottom: '2px solid var(--gray-200)',
                marginBottom: 20, gap: 0,
            }}>
                <button
                    onClick={() => { setTab('otp'); setOtpError(''); setBackupError(''); }}
                    style={{
                        flex: 1, padding: '10px 12px', border: 'none', cursor: 'pointer',
                        fontSize: '.875rem', fontWeight: 600,
                        background: tab === 'otp' ? 'var(--primary)' : 'transparent',
                        color: tab === 'otp' ? '#fff' : 'var(--gray-500)',
                        borderRadius: '6px 6px 0 0',
                    }}
                >
                    📱 Google Authenticator
                </button>
                <button
                    onClick={() => { setTab('backup'); setOtpError(''); setBackupError(''); }}
                    style={{
                        flex: 1, padding: '10px 12px', border: 'none', cursor: 'pointer',
                        fontSize: '.875rem', fontWeight: 600,
                        background: tab === 'backup' ? 'var(--primary)' : 'transparent',
                        color: tab === 'backup' ? '#fff' : 'var(--gray-500)',
                        borderRadius: '6px 6px 0 0',
                    }}
                >
                    🔑 Mã dự phòng
                </button>
            </div>

            {/* OTP tab */}
            {tab === 'otp' && (
                <div>
                    <p style={{ textAlign: 'center', color: 'var(--gray-600)', fontSize: '.875rem', marginBottom: 16 }}>
                        Nhập mã 6 số từ Google Authenticator
                    </p>
                    <OTPInput
                        onComplete={handleOtpComplete}
                        disabled={otpLoading}
                        error={otpError}
                    />
                    {otpError && (
                        <div className="alert alert-error" style={{ marginTop: 16 }}>{otpError}</div>
                    )}
                </div>
            )}

            {/* Backup code tab */}
            {tab === 'backup' && (
                <div>
                    <div style={{
                        background: '#FEF3C7', border: '1px solid var(--warning)',
                        borderRadius: 8, padding: 12, fontSize: '.8rem', marginBottom: 16, color: '#92400E',
                    }}>
                        📋 <strong>Mã dự phòng</strong> là các mã 8 ký tự bạn đã lưu khi setup MFA lần đầu.
                        Mỗi mã chỉ sử dụng được <strong>một lần duy nhất</strong>.
                    </div>
                    <form onSubmit={handleBackupSubmit}>
                        <div className="form-group">
                            <label style={{ fontWeight: 600, fontSize: '.875rem', marginBottom: 6, display: 'block' }}>
                                Nhập mã dự phòng
                            </label>
                            <input
                                type="text"
                                value={backupCode}
                                onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                                placeholder="VD: A3F2B1C9"
                                maxLength={12}
                                style={{
                                    width: '100%', padding: '10px 12px', fontSize: '1rem',
                                    border: '1px solid var(--gray-300)', borderRadius: 8,
                                    letterSpacing: '0.1em', textAlign: 'center',
                                    fontFamily: 'monospace',
                                }}
                                disabled={backupLoading}
                            />
                        </div>
                        {backupError && (
                            <div className="alert alert-error" style={{ marginTop: 8 }}>{backupError}</div>
                        )}
                        <button
                            type="submit"
                            className="btn btn-primary btn-full"
                            style={{ marginTop: 12, padding: '12px', fontSize: '1rem' }}
                            disabled={backupLoading || !backupCode.trim()}
                        >
                            {backupLoading ? 'Đang xác thực...' : 'Xác thực bằng mã dự phòng'}
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
