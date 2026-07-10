import React, { useState, useEffect, useCallback } from 'react';
import { apiCall } from '../api/client';

const ACTIONS = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT'];

export default function RbacAdminPage({ token }) {
    const [tab, setTab] = useState('permissions'); // 'permissions' | 'users'
    return (
        <div>
            {tab === 'permissions' && (
                <PermissionsTab token={token} />
            )}
            {tab === 'users' && (
                <UsersTab token={token} />
            )}

            {/* Bottom nav for switching */}
            <div style={{
                display: 'flex', gap: 8, marginTop: 16,
                borderTop: '1px solid #E5E7EB', paddingTop: 12,
            }}>
                <button
                    className={`btn ${tab === 'permissions' ? 'btn-primary' : 'btn-outline'} btn-sm`}
                    onClick={() => setTab('permissions')}
                >🛡️ Phân quyền (Role × Permission)</button>
                <button
                    className={`btn ${tab === 'users' ? 'btn-primary' : 'btn-outline'} btn-sm`}
                    onClick={() => setTab('users')}
                >👥 Quản lý User</button>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 1: Ma trận phân quyền (giữ nguyên)
// ─────────────────────────────────────────────────────────────────────────────
function PermissionsTab({ token }) {
    const [matrix, setMatrix] = useState([]);
    const [modules, setModules] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const [selectedRole, setSelectedRole] = useState(null);
    const [rolePerms, setRolePerms] = useState([]);

    const load = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const [m, r, mx] = await Promise.all([
                apiCall('GET', '/rbac/modules', null, token),
                apiCall('GET', '/rbac/roles', null, token),
                apiCall('GET', '/rbac/matrix', null, token),
            ]);
            setModules(Array.isArray(m) ? m : []);
            setRoles(Array.isArray(r) ? r : []);
            setMatrix(Array.isArray(mx) ? mx : []);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    }, [token]);

    useEffect(() => { if (token) load(); }, [token, load]);

    const loadRolePerms = async (roleId) => {
        setSelectedRole(roleId);
        try {
            const data = await apiCall('GET', `/rbac/roles/${roleId}/permissions`, null, token);
            setRolePerms(Array.isArray(data) ? data : []);
        } catch (e) { setErr(e.message); }
    };

    const handleGrant = async (roleId, permissionId, scopeType) => {
        try {
            await apiCall('POST', `/rbac/roles/${roleId}/grant`,
                { permission_id: permissionId, scope_type: scopeType }, token);
            loadRolePerms(roleId);
            load();
        } catch (e) { setErr(e.message); }
    };

    const handleRevoke = async (roleId, permissionId) => {
        if (!confirm('Thu hồi quyền này?')) return;
        try {
            await apiCall('DELETE', `/rbac/roles/${roleId}/permissions/${permissionId}`, null, token);
            loadRolePerms(roleId);
            load();
        } catch (e) { setErr(e.message); }
    };

    const byRole = matrix.reduce((acc, row) => {
        if (!acc[row.role_code]) acc[row.role_code] = { name: row.role_name, perms: {} };
        acc[row.role_code].perms[`${row.module_code}.${row.action}`] = row.scope_type;
        return acc;
    }, {});

    return (
        <div>
            <div className="card">
                <div className="card-header">
                    <h3>🛡️ RBAC — Ma trận phân quyền</h3>
                    <button className="btn btn-outline btn-sm" onClick={load}>↻ Refresh</button>
                </div>
                <div className="card-body">
                    {err && <div className="alert alert-error">{err}</div>}
                    {loading ? <div>Đang tải...</div> : (
                        <>
                            <h4>Roles ({roles.length})</h4>
                            <div className="grid-3 mb-16">
                                {roles.map(r => (
                                    <div key={r.role_id}
                                        onClick={() => loadRolePerms(r.role_id)}
                                        style={{
                                            border: '2px solid ' + (selectedRole === r.role_id ? '#3B82F6' : '#E5E7EB'),
                                            borderRadius: 8, padding: 12, cursor: 'pointer',
                                            background: selectedRole === r.role_id ? '#EFF6FF' : '#fff',
                                        }}>
                                        <div style={{ fontWeight: 700 }}>{r.role_name}</div>
                                        <div className="text-sm text-muted">code: {r.role_code}</div>
                                        <div className="text-sm">🔑 {r.permission_count} permissions | 👥 {r.user_count} users</div>
                                        {r.is_system && <span className="badge" style={{ background: '#DC2626' }}>SYSTEM</span>}
                                    </div>
                                ))}
                            </div>

                            <h4>Ma trận Role × Module × Action</h4>
                            <div className="table-wrap" style={{ maxHeight: 600, overflow: 'auto' }}>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Module</th>
                                            {Object.keys(byRole).map(code => <th key={code}>{code}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {modules.map(m => (
                                            <React.Fragment key={m.module_id}>
                                                <tr style={{ background: '#F9FAFB' }}>
                                                    <td colSpan={Object.keys(byRole).length + 1}>
                                                        <strong>{m.module_name}</strong>
                                                        <span className="text-sm text-muted"> ({m.module_code})</span>
                                                    </td>
                                                </tr>
                                                {ACTIONS.map(act => (
                                                    <tr key={`${m.module_id}-${act}`}>
                                                        <td style={{ paddingLeft: 30 }}>{m.module_code}.{act}</td>
                                                        {Object.keys(byRole).map(roleCode => {
                                                            const scope = byRole[roleCode].perms[`${m.module_code}.${act}`];
                                                            return (
                                                                <td key={roleCode} style={{ textAlign: 'center' }}>
                                                                    {scope ? (
                                                                        <span style={{
                                                                            background: scope === 'ALL' ? '#10B981' : scope === 'TEAM' ? '#3B82F6' : '#F59E0B',
                                                                            color: '#fff', padding: '2px 6px', borderRadius: 3,
                                                                            fontSize: '.7rem', fontWeight: 700,
                                                                        }}>{scope}</span>
                                                                    ) : <span style={{ color: '#9CA3AF' }}>—</span>}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {selectedRole && (
                <div className="card mt-16">
                    <div className="card-header">
                        <h3>🔑 Quyền chi tiết — {roles.find(r => r.role_id === selectedRole)?.role_name}</h3>
                        <button className="btn btn-outline btn-sm" onClick={() => setSelectedRole(null)}>✕ Đóng</button>
                    </div>
                    <div className="card-body">
                        <p className="text-sm text-muted">
                            Click <strong>×</strong> để thu hồi quyền.
                        </p>
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr><th>Module</th><th>Action</th><th>Scope</th><th>Granted</th><th></th></tr>
                                </thead>
                                <tbody>
                                    {rolePerms.map(rp => (
                                        <tr key={rp.role_permission_id}>
                                            <td><strong>{rp.module_code}</strong> — {rp.module_name}</td>
                                            <td><span className="badge">{rp.action}</span></td>
                                            <td><span style={{
                                                background: rp.scope_type === 'ALL' ? '#10B981' : '#3B82F6',
                                                color: '#fff', padding: '2px 6px', borderRadius: 3, fontWeight: 700, fontSize: '.7rem',
                                            }}>{rp.scope_type}</span></td>
                                            <td>{rp.is_granted ? '✅' : '❌'}</td>
                                            <td>
                                                <button className="btn btn-sm btn-danger"
                                                    onClick={() => handleRevoke(rp.role_id, rp.permission_id)}>× Thu hồi</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 2: Quản lý User — gán role cho tài khoản
// ─────────────────────────────────────────────────────────────────────────────
function UsersTab({ token }) {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const [filter, setFilter] = useState('');
    const [editingUser, setEditingUser] = useState(null); // { user_id, username, email, current_role, new_role }
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');

    const load = useCallback(async () => {
        setLoading(true); setErr(''); setMsg('');
        try {
            const [u, r] = await Promise.all([
                apiCall('GET', '/users?include_deleted=false', null, token),
                apiCall('GET', '/rbac/roles', null, token),
            ]);
            setUsers(Array.isArray(u) ? u : []);
            setRoles(Array.isArray(r) ? r : []);
        } catch (e) {
            setErr(e.message);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => { if (token) load(); }, [token, load]);

    const startEdit = (user) => {
        setEditingUser({ user_id: user.user_id, username: user.username, email: user.email, current_role_id: user.primary_role_id, new_role_id: user.primary_role_id || '' });
        setMsg('');
        setErr('');
    };

    const cancelEdit = () => { setEditingUser(null); setMsg(''); setErr(''); };

    const saveEdit = async () => {
        if (!editingUser) return;
        if (editingUser.current_role_id === editingUser.new_role_id) {
            setEditingUser(null);
            return;
        }
        setSaving(true); setErr(''); setMsg('');
        try {
            await apiCall('PUT', `/users/${editingUser.user_id}/role`,
                { role_id: editingUser.new_role_id ? Number(editingUser.new_role_id) : null },
                token);
            setMsg(`✅ Đã cập nhật role cho ${editingUser.username}`);
            setEditingUser(null);
            await load();
        } catch (e) {
            setErr(e.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (user) => {
        if (!confirm(`Bạn muốn ${user.is_active ? 'vô hiệu hóa' : 'kích hoạt'} tài khoản "${user.username}"?`)) return;
        try {
            await apiCall('PUT', `/users/${user.user_id}`,
                { is_active: !user.is_active }, token);
            await load();
            setMsg(`✅ Đã ${user.is_active ? 'vô hiệu hóa' : 'kích hoạt'} ${user.username}`);
        } catch (e) { setErr(e.message); }
    };

    const filtered = users.filter(u => {
        if (!filter) return true;
        const q = filter.toLowerCase();
        return (
            (u.username || '').toLowerCase().includes(q) ||
            (u.email || '').toLowerCase().includes(q) ||
            (u.full_name || '').toLowerCase().includes(q)
        );
    });

    const getRoleName = (roleId) => {
        if (!roleId) return { name: '— CHƯA CÓ ROLE —', color: '#DC2626' };
        const r = roles.find(x => x.role_id === roleId);
        return { name: r ? r.role_name : `ID ${roleId}`, color: '#3B82F6' };
    };

    return (
        <div>
            <div className="card">
                <div className="card-header">
                    <h3>👥 Quản lý User — Gán Role</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            type="text"
                            placeholder="🔍 Tìm username, email, tên..."
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                            style={{ border: '1px solid #D1D5DB', borderRadius: 6, padding: '4px 10px', fontSize: '.85rem', minWidth: 220 }}
                        />
                        <button className="btn btn-outline btn-sm" onClick={load}>↻ Refresh</button>
                    </div>
                </div>
                <div className="card-body">
                    {err && <div className="alert alert-error">{err}</div>}
                    {msg && <div className="alert" style={{ background: '#DCFCE7', border: '1px solid #16A34A', color: '#14532D' }}>{msg}</div>}

                    <p style={{ fontSize: '.8rem', color: '#6B7280', marginBottom: 12 }}>
                        Gán role cho user để họ có quyền truy cập hệ thống.
                        User chưa có role (PENDING) sẽ không đăng nhập được.
                    </p>

                    {loading ? <div>Đang tải...</div> : (
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>STT</th>
                                        <th>Username</th>
                                        <th>Họ tên</th>
                                        <th>Email</th>
                                        <th>Team</th>
                                        <th>Role hiện tại</th>
                                        <th>Trạng thái</th>
                                        <th>Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.length === 0 && (
                                        <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9CA3AF', padding: 20 }}>Không có user nào</td></tr>
                                    )}
                                    {filtered.map((u, i) => {
                                        const roleInfo = getRoleName(u.primary_role_id);
                                        const isEditing = editingUser?.user_id === u.user_id;
                                        return (
                                            <tr key={u.user_id} style={{ background: isEditing ? '#EFF6FF' : u.is_active ? '#fff' : '#F9FAFB' }}>
                                                <td style={{ color: '#9CA3AF', fontSize: '.8rem' }}>{i + 1}</td>
                                                <td><strong>{u.username}</strong></td>
                                                <td>{u.full_name || '—'}</td>
                                                <td style={{ fontSize: '.85rem', color: '#374151' }}>{u.email}</td>
                                                <td style={{ fontSize: '.8rem' }}>{u.team_id ? `Team #${u.team_id}` : '—'}</td>
                                                <td>
                                                    {isEditing ? (
                                                        <select
                                                            value={editingUser.new_role_id}
                                                            onChange={e => setEditingUser({ ...editingUser, new_role_id: e.target.value })}
                                                            style={{ border: '1px solid #3B82F6', borderRadius: 4, padding: '2px 6px', fontSize: '.85rem', minWidth: 150 }}
                                                        >
                                                            <option value="">— CHƯA CÓ ROLE —</option>
                                                            {roles.map(r => (
                                                                <option key={r.role_id} value={r.role_id}>
                                                                    {r.role_name} ({r.role_code})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <span style={{ color: roleInfo.color, fontWeight: 700, fontSize: '.85rem' }}>
                                                            {roleInfo.name}
                                                        </span>
                                                    )}
                                                </td>
                                                <td>
                                                    <span className={`badge`} style={{
                                                        background: u.is_active ? '#10B981' : '#DC2626',
                                                        color: '#fff',
                                                    }}>
                                                        {u.is_active ? 'ACTIVE' : 'INACTIVE'}
                                                    </span>
                                                </td>
                                                <td>
                                                    {isEditing ? (
                                                        <div style={{ display: 'flex', gap: 4 }}>
                                                            <button
                                                                className="btn btn-primary btn-sm"
                                                                onClick={saveEdit}
                                                                disabled={saving}
                                                            >
                                                                {saving ? '...' : '💾 Lưu'}
                                                            </button>
                                                            <button className="btn btn-outline btn-sm" onClick={cancelEdit}>✕</button>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', gap: 4 }}>
                                                            <button
                                                                className="btn btn-outline btn-sm"
                                                                onClick={() => startEdit(u)}
                                                                style={{ color: '#3B82F6' }}
                                                            >✏️ Gán Role</button>
                                                            <button
                                                                className="btn btn-outline btn-sm"
                                                                onClick={() => toggleActive(u)}
                                                                style={{ color: u.is_active ? '#DC2626' : '#10B981' }}
                                                            >
                                                                {u.is_active ? '🚫 Vô hiệu' : '✅ Kích hoạt'}
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: 8 }}>
                        Tổng: {filtered.length} / {users.length} user
                    </div>
                </div>
            </div>
        </div>
    );
}
