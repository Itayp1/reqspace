import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../store/authStore';
import api from '../api/axios';
import { Shield, ShieldOff, Trash2, Ban, X } from 'lucide-react';
import { AddUserModal } from '../components/admin/AddUserModal';
import { ErrorsPanel } from '../components/admin/ErrorsPanel';
import { customConfirm } from '../utils/dialog';
import { useToastStore } from '../store/toastStore';
import { OAUTH_LABELS, OAUTH_PROVIDERS, oauthRedirectUri } from '../utils/oauth';


export default function AdminPage() {
  const { user } = useAuthStore();
  const [users, setUsers] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'workspaces' | 'logs' | 'settings' | 'errors'>('users');
  const [loading, setLoading] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [usersNext, setUsersNext] = useState<string | null>(null);
  const [logFilters, setLogFilters] = useState({ action: '', from: '', to: '' });
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(0);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const testingSmtpRef = useRef(false); // synchronous guard: state is stale between rapid clicks

  useEffect(() => {
    if (user?.isSuperAdmin) {
      fetchUsers();
    }
  }, [user]);

  const USERS_PAGE = 100;
  const fetchUsers = async (search = userSearch, cursor?: string) => {
    if (!cursor) setLoading(true);
    try {
      const res = await api.get('/admin/users', { params: { search: search || undefined, limit: USERS_PAGE, cursor } });
      setUsers(prev => (cursor ? [...prev, ...(res.data.users || [])] : res.data.users || []));
      setUsersNext(res.data.nextCursor || null);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  const fetchWorkspaces = async () => {
    setLoading(true);
    // The endpoint is paginated ({ workspaces, nextCursor }); handing the whole
    // object to the table made workspaces.map throw and took the page down.
    try { const res = await api.get('/admin/workspaces'); setWorkspaces(res.data?.workspaces || []); } catch (e) { console.error(e); }
    setLoading(false);
  };
  const LOGS_PAGE = 50;
  const fetchLogs = async (page = logPage, filters = logFilters) => {
    setLoading(true);
    try {
      const res = await api.get('/admin/logs', {
        params: {
          action: filters.action.trim() || undefined,
          from: filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : undefined,
          to: filters.to ? new Date(`${filters.to}T23:59:59.999`).toISOString() : undefined,
          page,
          limit: LOGS_PAGE,
        },
      });
      setAuditLogs(res.data.logs || []);
      setLogTotal(res.data.total || 0);
      setLogPage(page);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  const fetchConfig = async () => {
    setLoading(true);
    try { const res = await api.get('/admin/config'); setConfig(res.data || null); } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'workspaces') fetchWorkspaces();
    if (activeTab === 'logs') fetchLogs(1);
    if (activeTab === 'settings') fetchConfig();
  }, [activeTab]);

  // Each action reports its own outcome; a rejected call (e.g. revoking the
  // last super admin) used to surface as an unhandled promise rejection.
  const runUserAction = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      useToastStore.getState().addToast('success', success);
    } catch (e: any) {
      useToastStore.getState().addToast('error', e?.response?.data?.message || e?.message || 'Action failed');
    }
    fetchUsers();
  };
  const handlePromote = (id: string) => runUserAction(() => api.post(`/admin/users/${id}/promote`), 'User is now a super admin');
  const handleRevoke = (id: string) => runUserAction(() => api.post(`/admin/users/${id}/revoke`), 'Super admin role revoked');
  const handleSuspend = (id: string, suspend: boolean) =>
    runUserAction(() => api.post(`/admin/users/${id}/suspend`, { suspended: suspend }), suspend ? 'User suspended' : 'User reactivated');
  const handleDeleteUser = async (id: string) => {
    if (await customConfirm('Confirm Deletion', 'Delete this user? Their personal workspace is deleted too; shared workspaces they own are transferred to you.')) {
      await runUserAction(() => api.delete(`/admin/users/${id}`), 'User deleted');
    }
  };

  const saveConfig = async () => {
    try {
      const payload = { ...config };
      delete payload._id;
      delete (payload as any).id;
      delete (payload as any).createdAt;
      delete (payload as any).updatedAt;
      await api.put('/admin/config', payload);
      useToastStore.getState().addToast('success', 'Config saved');
    } catch (e: any) {
      useToastStore.getState().addToast('error', e.message);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-surface p-8">
      <h1 data-testid="admin-dashboard-title" className="text-3xl font-bold mb-6">Super Admin Dashboard</h1>
      
      <div className="flex border-b border-border mb-6">
        {['users', 'workspaces', 'logs', 'settings', 'errors'].map(tab => (
          <button 
            key={tab}
            data-testid={`admin-tab-${tab}`}
            className={`px-6 py-3 font-medium capitalize ${activeTab === tab ? 'text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'}`}
            onClick={() => setActiveTab(tab as any)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 bg-background rounded-lg border border-border shadow-sm overflow-hidden flex flex-col">
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3 text-text-muted">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
            <span>Loading data...</span>
          </div>
        )}

        {!loading && activeTab === 'users' && (
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-border flex justify-between gap-2 bg-surface">
              <form className="flex gap-2" onSubmit={e => { e.preventDefault(); fetchUsers(userSearch); }}>
                <input
                  data-testid="admin-user-search"
                  className="p-2 border border-border rounded bg-background text-sm"
                  placeholder="Search name or email..."
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                />
                <button type="submit" data-testid="admin-user-search-btn" className="px-3 py-2 border border-border rounded text-sm hover:bg-border">Search</button>
              </form>
              <button
                data-testid="admin-add-user-btn"
                className="bg-primary text-white px-4 py-2 rounded-md font-semibold text-sm hover:bg-orange-600 transition"
                onClick={() => setIsAddUserModalOpen(true)}
              >
                + Add User
              </button>
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface border-b border-border">
                <tr>
                  <th className="p-4">Name</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">SuperAdmin</th>
                  <th className="p-4">Created</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u._id} data-testid={`user-row-${u.name}`} className="border-b border-border last:border-0 hover:bg-surface">
                    <td className="p-4">{u.name}</td>
                    <td className="p-4">{u.email}</td>
                    <td className="p-4" data-testid={`user-status-${u.name}`}>
                      {u.status === 'suspended' ? <span className="text-red-500 font-bold">Suspended</span> : <span className="text-green-500">Active</span>}
                    </td>
                    <td className="p-4" data-testid={`user-superadmin-${u.name}`} data-superadmin={u.isSuperAdmin ? 'true' : 'false'}>
                      {u.isSuperAdmin ? <Shield className="w-5 h-5 text-green-500" /> : <ShieldOff className="w-5 h-5 text-text-muted" />}
                    </td>
                    <td className="p-4 whitespace-nowrap text-text-muted">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : ''}</td>
                    <td className="p-4 flex gap-2">
                      {u.isSuperAdmin ? (
                        <button data-testid={`user-revoke-${u.name}`} onClick={() => handleRevoke(u._id)} className="flex items-center gap-1 p-1 text-orange-500 hover:bg-border rounded" title="Revoke Admin"><ShieldOff className="w-4 h-4" /><span className="text-xs">Revoke Admin</span></button>
                      ) : (
                        <button data-testid={`user-promote-${u.name}`} onClick={() => handlePromote(u._id)} className="flex items-center gap-1 p-1 text-green-500 hover:bg-border rounded" title="Make Admin"><Shield className="w-4 h-4" /><span className="text-xs">Make Admin</span></button>
                      )}
                      <button
                        data-testid={`user-suspend-${u.name}`}
                        onClick={() => handleSuspend(u._id, u.status !== 'suspended')}
                        className="flex items-center gap-1 p-1 text-text-muted hover:text-red-500 hover:bg-border rounded"
                        title={u.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                        aria-label={u.status === 'suspended' ? 'Reactivate user' : 'Suspend user'}
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                      <button data-testid={`user-delete-${u.name}`} onClick={() => handleDeleteUser(u._id)} className="flex items-center gap-1 p-1 text-text-muted hover:text-red-500 hover:bg-border rounded" title="Delete" aria-label="Delete user">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {usersNext && (
              <div className="p-4 text-center">
                <button data-testid="admin-users-load-more" className="px-4 py-2 border border-border rounded text-sm hover:bg-surface" onClick={() => fetchUsers(userSearch, usersNext)}>Load more</button>
              </div>
            )}
          </div>
        </div>
        )}

        {!loading && activeTab === 'workspaces' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface border-b border-border">
                <tr>
                  <th className="p-4">Name</th>
                  <th className="p-4">Owner</th>
                  <th className="p-4">Members</th>
                  <th className="p-4">Size</th>
                  <th className="p-4">Created At</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {workspaces.map(w => (
                  <tr key={w._id} data-testid={`admin-workspace-row-${w.name}`} className="border-b border-border last:border-0 hover:bg-surface">
                    <td className="p-4 font-medium">{w.name}</td>
                    <td className="p-4">{w.owner ? (w.owner.name || w.owner.email) : '—'}</td>
                    <td className="p-4">{w.members?.length || 0} members</td>
                    <td className="p-4 whitespace-nowrap text-text-muted">{w.collectionCount ?? 0} collections · {w.requestCount ?? 0} requests · {(w.storageBytes ?? 0) < 1024 ? `${w.storageBytes ?? 0} B` : `${((w.storageBytes ?? 0) / 1024).toFixed(1)} KB`}</td>
                    <td className="p-4 text-text-muted">{new Date(w.createdAt).toLocaleDateString()}</td>
                    <td className="p-4">
                      <button
                        data-testid={`admin-manage-permissions-${w.name}`}
                        onClick={() => setSelectedWorkspaceId(w._id)}
                        className="text-primary hover:underline text-sm font-semibold"
                      >
                        Manage Permissions
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && activeTab === 'logs' && (
          <div className="overflow-x-auto">
            <form className="p-4 border-b border-border flex flex-wrap gap-2 bg-surface" onSubmit={e => { e.preventDefault(); fetchLogs(1); }}>
              <input data-testid="audit-filter-action" className="p-2 border border-border rounded bg-background text-sm" placeholder="Action (e.g. auth.login)" value={logFilters.action} onChange={e => setLogFilters({ ...logFilters, action: e.target.value })} />
              <input data-testid="audit-filter-from" type="date" aria-label="From date" className="p-2 border border-border rounded bg-background text-sm" value={logFilters.from} onChange={e => setLogFilters({ ...logFilters, from: e.target.value })} />
              <input data-testid="audit-filter-to" type="date" aria-label="To date" className="p-2 border border-border rounded bg-background text-sm" value={logFilters.to} onChange={e => setLogFilters({ ...logFilters, to: e.target.value })} />
              <button type="submit" data-testid="audit-filter-apply" className="px-3 py-2 border border-border rounded text-sm hover:bg-border">Filter</button>
            </form>
            <table className="w-full text-left text-sm">
              <thead className="bg-surface border-b border-border">
                <tr>
                  <th className="p-4">Time</th>
                  <th className="p-4">Action</th>
                  <th className="p-4">User</th>
                  <th className="p-4">Resource</th>
                  <th className="p-4">Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(l => (
                  <tr key={l._id || l.id} data-testid="audit-log-row" className="border-b border-border last:border-0 hover:bg-surface">
                    <td className="p-4 whitespace-nowrap text-text-muted">{new Date(l.createdAt).toLocaleString()}</td>
                    <td className="p-4 font-bold">{l.action}</td>
                    <td className="p-4">{(typeof l.userId === 'object' ? (l.userId?.name || l.userId?.email) : l.userId) || 'System'}</td>
                    <td className="p-4">{l.targetType || l.targetId ? `${l.targetType || '—'}${l.targetId ? ` (${l.targetId})` : ''}` : '—'}</td>
                    <td className="p-4 font-mono text-xs">{l.details ? JSON.stringify(l.details) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-4 flex items-center justify-between text-sm text-text-muted">
              <span>{logTotal} entries · page {logPage} of {Math.max(1, Math.ceil(logTotal / LOGS_PAGE))}</span>
              <span className="flex gap-2">
                <button data-testid="audit-prev" disabled={logPage <= 1} className="px-3 py-1 border border-border rounded disabled:opacity-40" onClick={() => fetchLogs(logPage - 1)}>Prev</button>
                <button data-testid="audit-next" disabled={logPage * LOGS_PAGE >= logTotal} className="px-3 py-1 border border-border rounded disabled:opacity-40" onClick={() => fetchLogs(logPage + 1)}>Next</button>
              </span>
            </div>
          </div>
        )}

        {activeTab === 'errors' && <ErrorsPanel />}

        {!loading && activeTab === 'settings' && config && (
          <div className="p-8 max-w-2xl space-y-6">
            <div data-testid="admin-settings-title">
              <h3 className="text-lg font-bold mb-4">User Registration & Authentication</h3>
              <div className="space-y-6">
                
                {/* 1. Email (SMTP) */}
                <div className="p-4 border border-border rounded-lg bg-surface">
                  <div className="flex items-center gap-2 mb-2">
                    <input 
                      type="checkbox" 
                      data-testid="admin-smtp-enabled"
                      checked={config.auth?.smtp?.enabled || false} 
                      onChange={e => setConfig({...config, auth: {...config.auth, smtp: {...config.auth?.smtp, enabled: e.target.checked}}})}
                    />
                    <label className="text-sm font-bold">1. Email (SMTP Configuration)</label>
                  </div>
                  {config.auth?.smtp?.enabled && (
                    <div className="space-y-3 mt-3 ml-6 border-l-2 border-border pl-4">
                      <div>
                        <label className="block text-xs mb-1 text-text-muted">Host</label>
                        <input data-testid="admin-smtp-host" type="text" value={config.auth.smtp.host || ''} onChange={e => setConfig({...config, auth: {...config.auth, smtp: {...config.auth.smtp, host: e.target.value}}})} className="w-full p-2 border border-border rounded bg-background text-sm" placeholder="smtp.gmail.com" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs mb-1 text-text-muted">Port</label>
                          <input data-testid="admin-smtp-port" type="number" value={config.auth.smtp.port || 587} onChange={e => setConfig({...config, auth: {...config.auth, smtp: {...config.auth.smtp, port: Number(e.target.value)}}})} className="w-full p-2 border border-border rounded bg-background text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs mb-1 text-text-muted">From Address</label>
                          <input data-testid="admin-smtp-from" type="text" value={config.auth.smtp.fromAddress || ''} onChange={e => setConfig({...config, auth: {...config.auth, smtp: {...config.auth.smtp, fromAddress: e.target.value}}})} className="w-full p-2 border border-border rounded bg-background text-sm" placeholder="noreply@reqspace.com" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs mb-1 text-text-muted">User</label>
                          <input data-testid="admin-smtp-user" type="text" value={config.auth.smtp.user || ''} onChange={e => setConfig({...config, auth: {...config.auth, smtp: {...config.auth.smtp, user: e.target.value}}})} className="w-full p-2 border border-border rounded bg-background text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs mb-1 text-text-muted">Password</label>
                          <input data-testid="admin-smtp-pass" type="password" value={config.auth.smtp.pass || ''} onChange={e => setConfig({...config, auth: {...config.auth, smtp: {...config.auth.smtp, pass: e.target.value}}})} className="w-full p-2 border border-border rounded bg-background text-sm" />
                        </div>
                      </div>
                      <button 
                        onClick={async () => {
                          if (testingSmtpRef.current) return;
                          if (!config.auth.smtp.host?.trim()) {
                            useToastStore.getState().addToast('error', 'SMTP host is required');
                            return;
                          }
                          testingSmtpRef.current = true;
                          setTestingSmtp(true);
                          try {
                            const res = await api.post('/admin/test-smtp', config.auth.smtp);
                            useToastStore.getState().addToast('success', res.data.message);
                          } catch(err: any) {
                            useToastStore.getState().addToast('error', err.response?.data?.message || err.message);
                          } finally {
                            testingSmtpRef.current = false;
                            setTestingSmtp(false);
                          }
                        }}
                        disabled={testingSmtp}
                        data-testid="admin-smtp-test"
                        className="bg-primary text-white text-xs px-3 py-1.5 rounded hover:bg-orange-600 transition disabled:opacity-50"
                      >
                        {testingSmtp ? 'Testing...' : 'Test Connection'}
                      </button>
                    </div>
                  )}
                </div>

                {/* 2. Self Registration */}
                <div className="p-4 border border-border rounded-lg bg-surface">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      data-testid="admin-self-registration"
                      checked={config.auth?.allowSelfRegistration || false} 
                      onChange={e => setConfig({...config, auth: {...config.auth, allowSelfRegistration: e.target.checked}})}
                    />
                    <label className="text-sm font-bold">2. Self Registration (Local DB Users)</label>
                  </div>
                  {config.auth?.allowSelfRegistration && (
                    <div className="mt-2 ml-6 text-xs text-text-muted">
                      Allows users to register using a local email and password stored in the database.
                    </div>
                  )}
                </div>

                {/* 3-5. OAuth sign-in providers */}
                {OAUTH_PROVIDERS.map((provider, i) => {
                  const key = `${provider}OAuth`;
                  const label = OAUTH_LABELS[provider];
                  const p = config.auth?.[key] || {};
                  const setP = (patch: Record<string, unknown>) => setConfig({ ...config, auth: { ...config.auth, [key]: { ...p, ...patch } } });
                  return (
                    <div key={provider} className="p-4 border border-border rounded-lg bg-surface">
                      <div className="flex items-center gap-2 mb-2">
                        <input type="checkbox" data-testid={`admin-${provider}-enabled`} checked={p.enabled || false} onChange={e => setP({ enabled: e.target.checked })} />
                        <label className="text-sm font-bold">{i + 3}. {provider === 'microsoft' ? 'Microsoft (Azure / Entra ID)' : provider === 'custom' ? 'Custom OAuth2 / OIDC' : label} OAuth</label>
                      </div>
                      {p.enabled && (
                        <div className="space-y-3 mt-3 ml-6 border-l-2 border-border pl-4">
                          <div className="text-xs text-text-muted">Redirect URI: <code>{oauthRedirectUri(provider)}</code></div>
                          <div>
                            <label className="block text-xs mb-1 text-text-muted">{provider === 'microsoft' ? 'Application (client) ID' : 'Client ID'}</label>
                            <input data-testid={`admin-${provider}-client-id`} type="text" value={p.clientId || ''} onChange={e => setP({ clientId: e.target.value })} className="w-full p-2 border border-border rounded bg-background text-sm" />
                          </div>
                          <div>
                            <label className="block text-xs mb-1 text-text-muted">Client Secret</label>
                            <input data-testid={`admin-${provider}-client-secret`} type="password" value={p.clientSecret || ''} onChange={e => setP({ clientSecret: e.target.value })} className="w-full p-2 border border-border rounded bg-background text-sm" />
                          </div>
                          {provider === 'custom' && (
                            <>
                              {([
                                ['name', 'Button label', 'SSO'],
                                ['authorizeUrl', 'Authorize URL', 'https://idp.example.com/authorize'],
                                ['tokenUrl', 'Token URL', 'https://idp.example.com/token'],
                                ['userinfoUrl', 'UserInfo URL (must return email)', 'https://idp.example.com/userinfo'],
                                ['scope', 'Scope', 'openid email profile'],
                              ] as const).map(([field, text, ph]) => (
                                <div key={field}>
                                  <label className="block text-xs mb-1 text-text-muted">{text}</label>
                                  <input data-testid={`admin-custom-${field}`} type="text" value={p[field] || ''} onChange={e => setP({ [field]: e.target.value })} className="w-full p-2 border border-border rounded bg-background text-sm" placeholder={ph} />
                                </div>
                              ))}
                            </>
                          )}
                          {provider === 'microsoft' && (
                            <div>
                              <label className="block text-xs mb-1 text-text-muted">Tenant ID (or common / organizations / consumers)</label>
                              <input data-testid="admin-microsoft-tenant-id" type="text" value={p.tenantId || ''} onChange={e => setP({ tenantId: e.target.value })} className="w-full p-2 border border-border rounded bg-background text-sm" placeholder="common" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

              </div>
            </div>

            <div className="pt-6 border-t border-border">
              <h3 className="text-lg font-bold mb-4">History Limits</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Max Request Body KB (before truncate)</label>
                  <input 
                    type="number" 
                    value={config.history?.maxRequestBodyKB || 10} 
                    onChange={e => setConfig({...config, history: {...config.history, maxRequestBodyKB: +e.target.value}})}
                    className="w-full p-2 border border-border rounded bg-surface"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Max Total History per User MB</label>
                  <input 
                    type="number" 
                    value={config.history?.maxTotalPerUserMB || 20} 
                    onChange={e => setConfig({...config, history: {...config.history, maxTotalPerUserMB: +e.target.value}})}
                    className="w-full p-2 border border-border rounded bg-surface"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Max History Records per User (0 = unlimited)</label>
                  <input
                    type="number"
                    min={0}
                    data-testid="admin-history-max-records"
                    value={config.history?.maxRecords ?? 0}
                    onChange={e => setConfig({...config, history: {...config.history, maxRecords: +e.target.value}})}
                    className="w-full p-2 border border-border rounded bg-surface"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">History Retention Days (0 = keep forever)</label>
                  <input
                    type="number"
                    min={0}
                    data-testid="admin-history-retention-days"
                    value={config.history?.retentionDays ?? 0}
                    onChange={e => setConfig({...config, history: {...config.history, retentionDays: +e.target.value}})}
                    className="w-full p-2 border border-border rounded bg-surface"
                  />
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-border">
              <h3 className="text-lg font-bold mb-4">HTTP Proxy Configuration (For outbound API requests)</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.proxy?.enabled || false}
                    onChange={e => setConfig({...config, proxy: {...(config.proxy || {}), enabled: e.target.checked}})}
                  />
                  <label className="text-sm font-medium">Enable Global Proxy</label>
                </div>
                <div className="flex items-start gap-2 p-3 rounded border border-orange-500/30 bg-orange-500/10">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={config.proxy?.allowPrivateTargets || false}
                    onChange={e => setConfig({...config, proxy: {...(config.proxy || {}), allowPrivateTargets: e.target.checked}})}
                  />
                  <div>
                    <label className="text-sm font-medium block">Allow requests to internal/private network addresses</label>
                    <p className="text-xs text-text-muted mt-0.5">
                      Off by default: requests this server makes on a user's behalf (for example importing a
                      collection, OpenAPI or WSDL definition from a URL) are blocked from reaching localhost,
                      RFC1918 ranges, and link-local addresses (including cloud metadata endpoints like
                      169.254.169.254) — this prevents any signed-in user from using this server to reach its own
                      internal network (SSRF). It does not affect "Send": those requests run from the user's own
                      browser or desktop app, not from this server. Only enable this on a self-hosted,
                      single-tenant deployment that genuinely needs the server to fetch internal URLs.
                    </p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Proxy URL (e.g. http://proxy.corporate.com:8080)</label>
                  <input 
                    type="text" 
                    value={config.proxy?.url || ''} 
                    onChange={e => setConfig({...config, proxy: {...(config.proxy || {}), url: e.target.value}})}
                    className="w-full p-2 border border-border rounded bg-surface"
                    placeholder="http://my-proxy:8080"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Username (Optional)</label>
                    <input 
                      type="text" 
                      value={config.proxy?.username || ''} 
                      onChange={e => setConfig({...config, proxy: {...(config.proxy || {}), username: e.target.value}})}
                      className="w-full p-2 border border-border rounded bg-surface"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Password (Optional)</label>
                    <input 
                      type="password" 
                      value={config.proxy?.password || ''} 
                      onChange={e => setConfig({...config, proxy: {...(config.proxy || {}), password: e.target.value}})}
                      className="w-full p-2 border border-border rounded bg-surface"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-border">
              <h3 className="text-lg font-bold mb-4">Export / Import System Data</h3>
              <p className="text-sm text-text-muted mb-4">
                Exporting data will download a full JSON dump of the current workspace, environments, collections, globals, and system configuration.
                You can use this file to import the exact state into another Reqspace instance.
              </p>
              <div className="flex gap-4">
                <button 
                  data-testid="export-data-btn"
                  onClick={() => {
                    const workspaceId = useAuthStore.getState().activeWorkspace?._id;
                    if (!workspaceId) return useToastStore.getState().addToast('error', 'No active workspace selected.');
                    window.location.href = `/api/admin/export/${workspaceId}`;
                  }}
                  className="bg-surface border border-border px-4 py-2 rounded hover:bg-border transition text-sm"
                >
                  Export Data
                </button>
                <div className="relative">
                  <input 
                    data-testid="import-data-input"
                    type="file"
                    accept=".json"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const workspaceId = useAuthStore.getState().activeWorkspace?._id;
                      if (!workspaceId) return useToastStore.getState().addToast('error', 'No active workspace selected.');
                      
                      const reader = new FileReader();
                      reader.onload = async (event) => {
                        try {
                          const dump = JSON.parse(event.target?.result as string);
                          if (!(await customConfirm('Confirm Import', 'This will insert all dumped collections, environments, and globals into the current workspace. Proceed?'))) return;
                          
                          try {
                            await api.post(`/admin/import/${workspaceId}`, dump);
                          } catch (err: any) {
                            if (err.response?.data?.code !== 'WORKSPACE_NOT_EMPTY') throw err;
                            // The workspace already has data: ask whether to add to it or replace it.
                            let mode: 'append' | 'overwrite';
                            if (await customConfirm('Workspace is not empty', 'This workspace already has collections or environments. Add the imported data next to them? (Cancel to choose another option)')) mode = 'append';
                            else if (await customConfirm('Replace workspace data', 'Delete the existing collections and environments and replace them with the imported data?')) mode = 'overwrite';
                            else return;
                            await api.post(`/admin/import/${workspaceId}?mode=${mode}`, dump);
                          }
                          useToastStore.getState().addToast('success', 'Import successful! Reloading...');
                          setTimeout(() => window.location.reload(), 1500);
                        } catch (err: any) {
                          useToastStore.getState().addToast('error', 'Import failed: ' + (err.response?.data?.message || err.message));
                        }
                      };
                      reader.readAsText(file);
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full"
                    title="Import Data"
                  />
                  <button className="bg-surface border border-border px-4 py-2 rounded hover:bg-border transition text-sm">
                    Import Data
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-6 mt-6 border-t border-border">
              <button data-testid="admin-save-config" onClick={saveConfig} className="bg-primary text-white px-6 py-2 rounded hover:bg-orange-600 transition">
                Save System Config
              </button>
            </div>
          </div>
        )}

      </div>
      
      {selectedWorkspaceId && (
        <WorkspacePermissionsModal
          workspaceId={selectedWorkspaceId} 
          onClose={() => setSelectedWorkspaceId(null)} 
        />
      )}
      
      {isAddUserModalOpen && (
        <AddUserModal 
          onClose={() => setIsAddUserModalOpen(false)}
          onSuccess={() => fetchUsers()}
        />
      )}
    </div>
  );
}

function WorkspacePermissionsModal({ workspaceId, onClose }: { workspaceId: string, onClose: () => void }) {
  const [workspace, setWorkspace] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [error, setError] = useState('');

  const fetchWorkspace = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/workspaces/${workspaceId}`);
      setWorkspace(res.data);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to load workspace');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspace();
  }, [workspaceId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/workspaces/${workspaceId}/members`, { email, role });
      setEmail('');
      fetchWorkspace();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to add member');
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      await api.put(`/workspaces/${workspaceId}/members/${userId}`, { role: newRole });
      fetchWorkspace();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to change role');
    }
  };

  const handleRemove = async (userId: string) => {
    if (!(await customConfirm('Confirm Action', 'Remove member from workspace?'))) return;
    try {
      await api.delete(`/workspaces/${workspaceId}/members/${userId}`);
      fetchWorkspace();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to remove member');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-xl font-bold">Manage Permissions {workspace ? `- ${workspace.name}` : ''}</h2>
          <button onClick={onClose} data-testid="admin-perm-close" aria-label="Close" className="p-1 text-text-muted hover:text-text rounded-md">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
          {error && <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">{error}</div>}
          
          {loading ? (
            <div className="flex items-center justify-center py-10 flex-col gap-3 text-text-muted">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
              <span>Loading workspace details...</span>
            </div>
          ) : (
            <>
              <form onSubmit={handleInvite} className="flex gap-2 items-end bg-surface p-4 rounded-lg border border-border">
                <div className="flex-1">
                  <label className="block text-xs font-semibold mb-1">User Email or Name</label>
                  <input 
                    type="text" 
                    required 
                    value={email} 
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm"
                    placeholder="email@example.com or Username"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Role</label>
                  {/* The server only knows viewer / editor / owner; the old
                      runner / tester / admin options were always rejected. */}
                  <select
                    data-testid="admin-perm-invite-role"
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    className="w-32 bg-background border border-border rounded px-3 py-1.5 text-sm"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="owner">Owner</option>
                  </select>
                </div>
                <button type="submit" className="bg-primary text-white px-4 py-1.5 rounded hover:bg-orange-600 transition text-sm font-semibold">
                  Add Member
                </button>
              </form>

              {workspace && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface border-b border-border">
                      <tr>
                        <th className="p-3">User</th>
                        <th className="p-3">Email</th>
                        <th className="p-3">Role</th>
                        <th className="p-3 w-16">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.members.map((m: any) => (
                        <tr key={m.userId?._id || Math.random()} className="border-b border-border last:border-0 hover:bg-surface">
                          <td className="p-3 font-medium">{m.userId?.name || "Deleted User"}</td>
                          <td className="p-3 text-text-muted">{m.userId?.email || "N/A"}</td>
                          <td className="p-3">
                            <select
                              value={m.role}
                              onChange={(e) => handleChangeRole(m.userId?._id, e.target.value)}
                              className="bg-background border border-border rounded px-2 py-1 text-xs"
                            >
                              <option value="viewer">Viewer</option>
                              <option value="editor">Editor</option>
                              <option value="owner">Owner</option>
                            </select>
                          </td>
                          <td className="p-3">
                            {m.role !== 'owner' && (
                              <button onClick={() => handleRemove(m.userId?._id)} className="p-1 text-text-muted hover:text-red-500 rounded">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
