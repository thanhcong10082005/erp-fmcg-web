/**
 * OTPInput — Component nhập mã OTP 6 số (Google Authenticator)
 * Tự động focus, paste support, keyboard navigation
 */

import { useRef, useEffect, useState } from 'react';

export default function OTPInput({ onComplete, disabled, error, length = 6 }) {
    const [values, setValues] = useState(Array(length).fill(''));
    const inputs = useRef([]);

    useEffect(() => {
        // Reset khi error thay đổi
        if (error) {
            setValues(Array(length).fill(''));
            inputs.current[0]?.focus();
        }
    }, [error, length]);

    const setValueAt = (idx, val) => {
        const cleaned = val.replace(/[^0-9]/g, '');
        const next = [...values];
        next[idx] = cleaned.slice(-1);
        setValues(next);

        if (cleaned && idx < length - 1) {
            inputs.current[idx + 1]?.focus();
        }

        if (next.every(v => v.length === 1)) {
            onComplete?.(next.join(''));
        }
    };

    const handleChange = (idx, e) => {
        setValueAt(idx, e.target.value);
    };

    const handleKeyDown = (idx, e) => {
        if (e.key === 'Backspace' && !values[idx] && idx > 0) {
            inputs.current[idx - 1]?.focus();
        }
        if (e.key === 'ArrowLeft' && idx > 0) {
            inputs.current[idx - 1]?.focus();
        }
        if (e.key === 'ArrowRight' && idx < length - 1) {
            inputs.current[idx + 1]?.focus();
        }
    };

    const handlePaste = (e) => {
        const paste = (e.clipboardData.getData('text') || '').replace(/[^0-9]/g, '');
        if (!paste) return;
        e.preventDefault();
        const next = Array(length).fill('');
        for (let i = 0; i < Math.min(paste.length, length); i++) {
            next[i] = paste[i];
        }
        setValues(next);
        const lastIdx = Math.min(paste.length, length) - 1;
        inputs.current[lastIdx]?.focus();
        if (next.every(v => v.length === 1)) {
            onComplete?.(next.join(''));
        }
    };

    return (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            {Array.from({ length }).map((_, i) => (
                <input
                    key={i}
                    ref={el => (inputs.current[i] = el)}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={values[i]}
                    onChange={e => handleChange(i, e)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    onPaste={handlePaste}
                    disabled={disabled}
                    autoFocus={i === 0}
                    aria-label={`OTP digit ${i + 1}`}
                    style={{
                        width: 48, height: 56, textAlign: 'center',
                        fontSize: '1.5rem', fontWeight: 700,
                        border: `2px solid ${error ? 'var(--danger)' : 'var(--gray-300)'}`,
                        borderRadius: 8,
                        background: disabled ? 'var(--gray-100)' : '#fff',
                    }}
                />
            ))}
        </div>
    );
}
