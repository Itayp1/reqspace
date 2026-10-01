import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import api from '../../api/axios';
import { UserAutocomplete } from '../common/UserAutocomplete';
import { useToastStore } from '../../store/toastStore';
import { ConfirmModal } from '../common/ConfirmModal';

export default function WorkspaceSettingsModal({ onClose }: { onClose: () => void }) {
  const { activeWorkspace, workspaces, setWorkspaces, setActiveWorkspace } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'general' | 'members' | 'activity'>('general');
  const [name, setName] = useState(activeWorkspace?.name || '');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(activeWorkspace?.isPublic || false);
  // The details request can resolve after the user has already typed. Applying
  // the server payload then would wipe that edit and a Save would persist the
  // old name.
  const edited = useRef({ name: false, description: false, isPublic: false });
  const [members, setMembers] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [error, setError] = useState('');
  const [confirmConfig, setConfirmConfig] = useState<{isOpen: boolean; title: string; message: string; onConfirm: () => void}>({isOpen: false, title: '', message: '', onConfirm: () => {}});

  useEffect(() => {
    if (activeWorkspace) {
      setLoading(true);
      Promise.all([
        api.get(`/workspaces/${activeWorkspace._id}`),
        api.get(`/workspaces/${activeWorkspace._id}/activity`).catch(() => ({ data: [] }))
      ]).then(([res, actRes]) => {
        if (!edited.current.name) setName(res.data.name);
        if (!edited.current.description) setDescription(res.data.description || '');
        if (!edited.current.isPublic) setIsPublic(res.data.isPublic || false);
        setMembers(res.data.members || []);
        setActivityLogs(actRes.data || []);
      }).catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [activeWorkspace]);

  const refreshMembers = async () => {
    try {
      const res = await api.get(`/workspaces/${activeWorkspace?._id}`);
      setMembers(res.data.members || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdate = async () => {
    try {
      const res = await api.put(`/workspaces/${activeWorkspace?._id}`, { name, description, isPublic });
      const updatedWorkspaces = workspaces.map(w => w._id === res.data._id ? { ...w, name: res.data.name, isPublic: res.data.isPublic } : w);
      setWorkspaces(updatedWorkspaces);
      setActiveWorkspace(updatedWorkspaces.find(w => w._id === res.data._id) || null);
    } catch (e: any) {
      const message = e.response?.data?.message || 'Failed to update';
      setError(message);
      useToastStore.getState().addToast('error', message);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/workspaces/${activeWorkspace?._id}/members`, { email: inviteEmail, role: inviteRole });
      await refreshMembers();
      setInviteEmail('');
    } catch (e: any) {
      const message = e.response?.data?.message || 'Failed to add member';
      setError(message);
      useToastStore.getState().addToast('error', message);
    }
  };

  const handleDeleteWorkspace = async () => {
    try {
      await api.delete(`/workspaces/${activeWorkspace?._id}`);
      const updatedWorkspaces = workspaces.filter(w => w._id !== activeWorkspace?._id);
      setWorkspaces(updatedWorkspaces);
      setActiveWorkspace(updatedWorkspaces[0] || null);
      onClose();
    } catch (e: any) {
      const message = e.response?.data?.message || 'Failed to delete workspace';
      setError(message);
      useToastStore.getState().addToast('error', message);
    }
  };

  const executeRemoveMember = async (userId: string) => {
    try {
      await api.delete(`/workspaces/${activeWorkspace?._id}/members/${userId}`);
      await refreshMembers();
    } catch (e: any) {
      const message = e.response?.data?.message || 'Failed to remove member';
      setError(message);
      useToastStore.getState().addToast('error', message);
    }
  };

  const handleRemove = (userId: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Remove Member',
      message: 'Are you sure you want to remove this member from the workspace?',
      onConfirm: () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        executeRemoveMember(userId);
      }
    });
  };

  // Dummy original for replacement matching
  

  const isOwner = activeWorkspace?.myRole === 'owner';

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className="bg-background rounded-lg shadow-xl w-[600px] h-[500px] flex flex-col border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border bg-surface">
          <h2 className="text-lg font-bold">Workspace Settings</h2>
          <button data-testid="close-workspace-modal" onClick={onClose} className="p-1 hover:bg-border rounded"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex border-b border-border">
          <button 
            className={`px-4 py-2 font-medium ${activeTab === 'general' ? 'text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'}`}
            data-testid="workspace-general-tab"
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button
            data-testid="workspace-members-tab"
            className={`px-4 py-2 font-medium ${activeTab === 'members' ? 'text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'}`}
            onClick={() => setActiveTab('members')}
          >
            Members
          </button>
          <button 
            className={`px-4 py-2 font-medium ${activeTab === 'activity' ? 'text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'}`}
            data-testid="workspace-activity-tab"
            onClick={() => setActiveTab('activity')}
          >
            Activity / Changelog
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-text-muted bg-background/80 backdrop-blur-sm">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
              <span>Loading details...</span>
            </div>
          )}
          {error && <div className="bg-red-100 text-red-700 p-2 rounded mb-4 text-sm relative z-20">{error}</div>}

          {activeTab === 'general' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Workspace Name</label>
                <input 
                  data-testid="workspace-name-input"
                  type="text" 
                  value={name} 
                  onChange={e => { edited.current.name = true; setName(e.target.value); }} 
                  className="w-full p-2 border border-border rounded bg-surface"
                  disabled={!isOwner}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea 
                  value={description} 
                  onChange={e => { edited.current.description = true; setDescription(e.target.value); }}
                  className="w-full p-2 border border-border rounded bg-surface h-24 resize-none"
                  disabled={!isOwner}
                />
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="isPublic" 
                  checked={isPublic} 
                  onChange={e => { edited.current.isPublic = true; setIsPublic(e.target.checked); }} 
                  disabled={!isOwner}
                />
                <label htmlFor="isPublic" className="text-sm font-medium">Public Workspace (Visible to all users)</label>
              </div>
              {isOwner && (
                <div className="flex gap-2 pt-2 border-t border-border">
                  <button 
                    data-testid="workspace-save-btn"
                    onClick={handleUpdate}
                    className="bg-primary text-white px-4 py-2 rounded hover:bg-orange-600 transition"
                  >
                    Save Changes
                  </button>
                  <button 
                    data-testid="delete-workspace-btn"
                    onClick={() => setConfirmConfig({
                      isOpen: true,
                      title: 'Delete Workspace',
                      message: 'Are you sure you want to delete this workspace? This action cannot be undone and will delete all collections, requests, and environments within it.',
                      onConfirm: () => {
                        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                        handleDeleteWorkspace();
                      }
                    })}
                    className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition ml-auto"
                  >
                    Delete Workspace
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'members' && (
            <div>
              {isOwner && (
                <form onSubmit={handleAddMember} className="flex gap-2 mb-6">
                  <div className="flex-1">
                    <UserAutocomplete
                      value={inviteEmail}
                      onChange={setInviteEmail}
                      onSelect={setInviteEmail}
                    />
                  </div>
                  <select 
                    data-testid="workspace-invite-role"
                    value={inviteRole} 
                    onChange={e => setInviteRole(e.target.value)}
                    className="p-2 border border-border rounded bg-surface"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                  <button 
                    data-testid="workspace-invite-btn"
                    type="submit" 
                    disabled={!inviteEmail}
                    className="bg-primary text-white px-4 py-2 rounded hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2"
                  >
                    <UserPlus className="w-4 h-4" /> Add
                  </button>
                </form>
              )}

              <div className="border border-border rounded overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-surface border-b border-border">
                    <tr>
                      <th className="p-2">Name</th>
                      <th className="p-2">Email</th>
                      <th className="p-2">Role</th>
                      {isOwner && <th className="p-2 w-16">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map(m => (
                      <tr key={m.userId?._id || Math.random()} data-testid="member-row" className="border-b border-border last:border-0 hover:bg-surface">
                        <td className="p-2" data-testid="member-name">{m.userId?.name || "Deleted User"}</td>
                        <td className="p-2 text-text-muted" data-testid="member-email">{m.userId?.email || "N/A"}</td>
                        <td className="p-2 capitalize">
                          {isOwner && m.role !== 'owner' ? (
                            <select 
                              data-testid="member-role-select"
                              value={m.role}
                              onChange={async (e) => {
                                try {
                                  await api.put(`/workspaces/${activeWorkspace?._id}/members/${m.userId?._id}`, { role: e.target.value });
                                  await refreshMembers();
                                } catch (err: any) {
                                  const message = err?.response?.data?.message || 'Failed to update role';
                                  setError(message);
                                  useToastStore.getState().addToast('error', message);
                                }
                              }}
                              className="bg-transparent border border-border rounded p-1"
                            >
                              <option value="viewer">Viewer</option>
                              <option value="editor">Editor</option>
                            </select>
                          ) : (
                            <span className="p-1" data-testid="member-role-text">{m.role}</span>
                          )}
                        </td>
                        {isOwner && (
                          <td className="p-2">
                            {m.role !== 'owner' && (
                              <button data-testid="member-remove-btn" onClick={() => handleRemove(m.userId?._id)} className="text-text-muted hover:text-red-500 p-1">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b border-border pb-2">Workspace Activity</h3>
              {activityLogs.length === 0 ? (
                <p className="text-text-muted text-sm text-center py-8">No recent activity found.</p>
              ) : (
                <div className="space-y-3">
                  {activityLogs.map((log) => (
                    <div key={log._id} className="p-3 bg-surface border border-border rounded text-sm">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium text-text">{log.userId?.name || 'Unknown User'}</span>
                        <span className="text-text-muted text-xs">{new Date(log.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="text-text-muted">
                        Performed <span className="font-semibold text-primary">{log.action}</span>
                        {log.details?.requestName && (
                          <span> on request: <strong>{log.details.requestName}</strong></span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {confirmConfig.isOpen && (
        <ConfirmModal
          title={confirmConfig.title}
          message={confirmConfig.message}
          onConfirm={confirmConfig.onConfirm}
          onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        />
      )}
    </div>,
    document.body
  );
}
