import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../store/authStore';
import api from '../api/axios';
import { Shield, ShieldOff, Trash2, Ban } from 'lucide-react';
import { AddUserModal } from '../components/admin/AddUserModal';



export default function AdminPage() {
  const { user } = useAuthStore();
  const [users, setUsers] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'workspaces' | 'logs' | 'settings'>('users');
  const [loading, setLoading] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);

  useEffect(() => {
    if (user?.isSuperAdmin) {
      fetchUsers();
    }
  }, [user]);

  const fetchUsers = async () => {
    setLoading(true);
    try { const res = await api.get('/admin/users'); setUsers(res.data.users || []); } catch (e) { console.error(e); }
    setLoading(false);
  };
  const fetchWorkspaces = async () => {
    setLoading(true);
    try { const res = await api.get('/admin/workspaces'); setWorkspaces(res.data || []); } catch (e) { console.error(e); }
    setLoading(false);
  };
  const fetchLogs = async () => {
    setLoading(true);
    try { const res = await api.get('/admin/audit-logs'); setAuditLogs(res.data.logs || []); } catch (e) { console.error(e); }
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
    if (activeTab === 'logs') fetchLogs();
    if (activeTab === 'settings') fetchConfig();
  }, [activeTab]);

  const handlePromote = async (id: string) => {
    await api.post(`/admin/users/${id}/promote`);
    fetchUsers();
  };
  const handleRevoke = async (id: string) => {
    await api.post(`/admin/users/${id}/revoke`);
    fetchUsers();
  };
  const handleSuspend = async (id: string, suspend: boolean) => {
    await api.post(`/admin/users/${id}/suspend`, { suspended: suspend });
    fetchUsers();
  };
  const handleDeleteUser = async (id: string) => {
    if (confirm('Delete user?')) {
      await api.delete(`/admin/users/${id}`);
      fetchUsers();
    }
  };

  const saveConfig = async () => {
    try {
      await api.put('/admin/config', config);
      alert('Config saved');
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-surface p-8">
      <h1 className="text-3xl font-bold mb-6">Super Admin Dashboard</h1>
      
      <div className="flex border-b border-border mb-6">
        {['users', 'workspaces', 'logs', 'settings'].map(tab => (
          <button 
            key={tab}
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
            <div className="p-4 border-b border-border flex justify-end bg-surface">
              <button 
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
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u._id} className="border-b border-border last:border-0 hover:bg-surface">
                    <td className="p-4">{u.name}</td>
                    <td className="p-4">{u.email}</td>
                    <td className="p-4">
                      {u.suspended ? <span className="text-red-500 font-bold">Suspended</span> : <span className="text-green-500">Active</span>}
                    </td>
                    <td className="p-4">
                      {u.isSuperAdmin ? <Shield className="w-5 h-5 text-green-500" /> : <ShieldOff className="w-5 h-5 text-text-muted" />}
                    </td>
                    <td className="p-4 flex gap-2">
                      {u.isSuperAdmin ? (
                        <button onClick={() => handleRevoke(u._id)} className="flex items-center gap-1 p-1 text-orange-500 hover:bg-border rounded" title="Revoke Admin"><ShieldOff className="w-4 h-4" /><span className="text-xs">Revoke Admin</span></button>
                      ) : (
                        <button onClick={() => handlePromote(u._id)} className="flex items-center gap-1 p-1 text-green-500 hover:bg-border rounded" title="Make Admin"><Shield className="w-4 h-4" /><span className="text-xs">Make Admin</span></button>
                      )}
                      <button onClick={() => handleSuspend(u._id, !u.suspended)} className="flex items-center gap-1 p-1 text-text-muted hover:text-red-500 hover:bg-border rounded" title="Suspend">
                        <Ban className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteUser(u._id)} className="flex items-center gap-1 p-1 text-text-muted hover:text-red-500 hover:bg-border rounded" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {!loading && activeTab === 'workspaces' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface border-b border-border">
                <tr>
                  <th className="p-4">Name</th>
                  <th className="p-4">Members</th>
                  <th className="p-4">Created At</th>
                </tr>
              </thead>
              <tbody>
                {workspaces.map(w => (
                  <tr key={w._id} className="border-b border-border last:border-0 hover:bg-surface">
                    <td className="p-4 font-medium">{w.name}</td>
                    <td className="p-4">{w.members?.length || 0} members</td>
                    <td className="p-4 text-text-muted">{new Date(w.createdAt).toLocaleDateString()}</td>
                    <td className="p-4">
                      <button
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
                  <tr key={l._id} className="border-b border-border last:border-0 hover:bg-surface">
                    <td className="p-4 whitespace-nowrap text-text-muted">{new Date(l.createdAt).toLocaleString()}</td>
                    <td className="p-4 font-bold">{l.action}</td>
                      <td className="p-4">{l.userId?.name || l.userId?.email || String(l.userId) || 'System'}</td>
                    <td className="p-4">{l.resourceType} ({l.resourceId})</td>
                    <td className="p-4 font-mono text-xs">{JSON.stringify(l.details)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && activeTab === 'settings' && config && (
          <div className="p-8 max-w-2xl space-y-6">
            <div>
              <h3 className="text-lg font-bold mb-4">Authentication</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Auth Mode</label>
                  <select 
                    value={config.auth?.mode || 'login'} 
                    onChange={e => setConfig({...config, auth: {...config.auth, mode: e.target.value}})}
                    className="w-full p-2 border border-border rounded bg-surface"
                  >
                    <option value="login">Login (Email/Password)</option>
                    <option value="header">Header Based (SSO)</option>
                    <option value="both">Both</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Auth Header Name (if Header mode)</label>
                  <input 
                    type="text" 
                    value={config.auth?.headerName || ''} 
                    onChange={e => setConfig({...config, auth: {...config.auth, headerName: e.target.value}})}
                    className="w-full p-2 border border-border rounded bg-surface"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    checked={config.auth?.allowSelfRegistration || false} 
                    onChange={e => setConfig({...config, auth: {...config.auth, allowSelfRegistration: e.target.checked}})}
                  />
                  <label className="text-sm">Allow Self Registration</label>
                </div>

                <div className="pt-4 border-t border-border mt-4">
                  <h4 className="font-semibold mb-2">Google OAuth</h4>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        checked={config.auth?.googleOAuth?.enabled || false} 
                        onChange={e => setConfig({...config, auth: {...config.auth, googleOAuth: {...config.auth?.googleOAuth, enabled: e.target.checked}}})}
                      />
                      <label className="text-sm font-medium">Enable Google OAuth</label>
                    </div>
                    {config.auth?.googleOAuth?.enabled && (
                      <>
                        <div>
                          <label className="block text-sm mb-1 text-text-muted">Client ID</label>
                          <input 
                            type="text" 
                            value={config.auth.googleOAuth.clientId || ''} 
                            onChange={e => setConfig({...config, auth: {...config.auth, googleOAuth: {...config.auth.googleOAuth, clientId: e.target.value}}})}
                            className="w-full p-2 border border-border rounded bg-surface"
                          />
                        </div>
                        <div>
                          <label className="block text-sm mb-1 text-text-muted">Client Secret</label>
                          <input 
                            type="password" 
                            value={config.auth.googleOAuth.clientSecret || ''} 
                            onChange={e => setConfig({...config, auth: {...config.auth, googleOAuth: {...config.auth.googleOAuth, clientSecret: e.target.value}}})}
                            className="w-full p-2 border border-border rounded bg-surface"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
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

            <div className="pt-6">
              <button onClick={saveConfig} className="bg-primary text-white px-6 py-2 rounded hover:bg-orange-600 transition">
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
    if (!confirm('Remove member from workspace?')) return;
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
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text rounded-md">
            <Ban size={20} />
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
                  <select 
                    value={role} 
                    onChange={e => setRole(e.target.value)}
                    className="w-32 bg-background border border-border rounded px-3 py-1.5 text-sm"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="runner">Runner</option>
                    <option value="tester">Tester</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
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
                              <option value="runner">Runner</option>
                              <option value="tester">Tester</option>
                              <option value="editor">Editor</option>
                              <option value="admin">Admin</option>
                              <option value="owner" disabled>Owner</option>
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
