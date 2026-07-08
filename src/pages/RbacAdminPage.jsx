import React, { useState, useEffect, useCallback } from 'react';
import { apiCall } from '../api/client.jsx';

const ACTIONS = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT'];

export default function RbacAdminPage({ token }) {
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
            await apiCall('POST', `/rbac/roles/${roleId}/grant`, { permission_id: permissionId, scope_type: scopeType }, token);
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

    // Group matrix by role
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
                                                    <td colSpan={Object.keys(byRole).length + 1}><strong>{m.module_name}</strong> <span className="text-sm text-muted">({m.module_code})</span></td>
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
                                                                            background: scope === 'ALL' ? '#10B981' : scope === 'TEAM' ? '#3B82F6' : scope === 'ROUTE' ? '#F59E0B' : '#6B7280',
                                                                            color: '#fff', padding: '2px 6px', borderRadius: 3, fontSize: '.7rem', fontWeight: 700,
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
                        <button className="btn btn-outline btn-sm" onClick={() => setSelectedRole(null)}>✕</button>
                    </div>
                    <div className="card-body">
                        <p className="text-sm text-muted">
                            Click <span className="badge" style={{ background: '#DC2626' }}>×</span> để thu hồi.
                            Có thể cấp quyền mới qua API backend.
                        </p>
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr><th>Module</th><th>Action</th><th>Scope</th><th>Granted</th><th></th></tr>
                                </thead>
                                <tbody>
                                    {rolePerms.map(rp => (
                                        <tr key={rp.role_permission_id}>
                                            <td><strong>{rp.module_code}</strong> - {rp.module_name}</td>
                                            <td><span className="badge">{rp.action}</span></td>
                                            <td><span style={{
                                                background: rp.scope_type === 'ALL' ? '#10B981' : '#3B82F6',
                                                color: '#fff', padding: '2px 6px', borderRadius: 3, fontWeight: 700, fontSize: '.7rem',
                                            }}>{rp.scope_type}</span></td>
                                            <td>{rp.is_granted ? '✅' : '❌'}</td>
                                            <td>
                                                <button className="btn btn-sm btn-danger"
                                                    onClick={() => handleRevoke(rp.role_id, rp.permission_id)}>🗑️</button>
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

