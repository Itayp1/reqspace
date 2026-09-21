const fs = require('fs');

const code = import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import api from '../../api/axios';
import { UserAutocomplete } from '../common/UserAutocomplete';

export default function WorkspaceSettingsModal({ onClose }: { onClose: () => void }) {
  const { activeWorkspace, workspaces, setWorkspaces, setActiveWorkspace } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'general' | 'members'>('general');
  const [name, setName] = useState(activeWorkspace?.name || '');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(activeWorkspace?.isPublic || false);
  const [members, setMembers] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [error, setError] = useState('');

  useEffect(() => {
    if (activeWorkspace) {
      api.get(\/workspaces/\\).then(res => {
        setName(res.data.name);
        setDescription(res.data.description || '');
        setIsPublic(res.data.isPublic || false);
        setMembers(res.data.members || []);
      }).catch(err => console.error(err));
    }
  }, [activeWorkspace]);

  const handleUpdate = async () => {
    try {
      const res = await api.put(\/workspaces/\\, { name, description, isPublic });
      const updatedWorkspaces = workspaces.map(w => w._id === res.data._id ? { ...w, name: res.data.name, isPublic: res.data.isPublic } : w);
      setWorkspaces(updatedWorkspaces);
      setActiveWorkspace(updatedWorkspaces.find(w => w._id === res.data._id) || null);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to update');
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post(\/workspaces/\/members\, { email: inviteEmail, role: inviteRole });
      setMembers(res.data.members);
      setInviteEmail('');
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to add member');
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      const res = await api.delete(\/workspaces/\/members/\\);
      setMembers(res.data.members);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to remove member');
    }
  };

  const isOwner = activeWorkspace?.myRole === 'owner';
  const isAdminOrOwner = isOwner || activeWorkspace?.myRole === 'admin';

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className="bg-background rounded-lg shadow-xl w-[600px] h-[500px] flex flex-col border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border bg-surface">
          <h2 className="text-lg font-bold">Workspace Settings</h2>
          <button onClick={onClose} className="p-1 hover:bg-border rounded"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex border-b border-border">
          <button 
            className={\px-4 py-2 font-medium \\}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button 
            className={\px-4 py-2 font-medium \\}
            onClick={() => setActiveTab('members')}
          >
            Members
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && <div className="bg-red-100 text-red-700 p-2 rounded mb-4 text-sm">{error}</div>}

          {activeTab === 'general' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Workspace Name</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  className="w-full p-2 border border-border rounded bg-surface"
                  disabled={!isAdminOrOwner}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea 
                  value={description} 
                  onChange={e => setDescription(e.target.value)}
                  className="w-full p-2 border border-border rounded bg-surface h-24 resize-none"
                  disabled={!isAdminOrOwner}
                />
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="isPublic" 
                  checked={isPublic} 
                  onChange={e => setIsPublic(e.target.checked)} 
                  disabled={!isAdminOrOwner}
                />
                <label htmlFor="isPublic" className="text-sm font-medium">Public Workspace (Visible to all users)</label>
              </div>
              {isAdminOrOwner && (
                <button 
                  onClick={handleUpdate}
                  className="bg-primary text-white px-4 py-2 rounded hover:bg-orange-600 transition"
                >
                  Save Changes
                </button>
              )}
            </div>
          )}

          {activeTab === 'members' && (
            <div>
              {isAdminOrOwner && (
                <form onSubmit={handleAddMember} className="flex gap-2 mb-6">
                  <div className="flex-1">
                    <UserAutocomplete
                      value={inviteEmail}
                      onChange={setInviteEmail}
                      placeholder="Search users by name or email..."
                    />
                  </div>
                  <select 
                    value={inviteRole} 
                    onChange={e => setInviteRole(e.target.value)}
                    className="p-2 border border-border rounded bg-surface"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    {isOwner && <option value="admin">Admin</option>}
                  </select>
                  <button 
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
                      {isAdminOrOwner && <th className="p-2 w-16">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map(m => (
                      <tr key={m.userId._id} className="border-b border-border last:border-0 hover:bg-surface">
                        <td className="p-2">{m.userId.name}</td>
                        <td className="p-2 text-text-muted">{m.userId.email}</td>
                        <td className="p-2 capitalize">
                          {isAdminOrOwner && m.role !== 'owner' ? (
                            <select 
                              value={m.role}
                              onChange={async (e) => {
                                try {
                                  const res = await api.put(\/workspaces/\/members/\\, { role: e.target.value });
                                  setMembers(res.data.members);
                                } catch (err: any) {
                                  setError(err?.response?.data?.message || 'Failed to update role');
                                }
                              }}
                              className="bg-transparent border border-border rounded p-1"
                            >
                              <option value="viewer">Viewer</option>
                              <option value="editor">Editor</option>
                              {isOwner && <option value="admin">Admin</option>}
                            </select>
                          ) : (
                            <span className="p-1">{m.role}</span>
                          )}
                        </td>
                        {isAdminOrOwner && (
                          <td className="p-2">
                            {m.role !== 'owner' && (
                              <button onClick={() => handleRemove(m.userId._id)} className="text-text-muted hover:text-red-500 p-1">
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
        </div>
      </div>
    </div>,
    document.body
  );
};
fs.writeFileSync('client/src/components/workspace/WorkspaceSettingsModal.tsx', code);
