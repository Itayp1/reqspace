import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import api from '../../api/axios';
import { UserAutocomplete } from '../common/UserAutocomplete';
import { useToastStore } from '../../store/toastStore';
import { ConfirmModal } from '../common/ConfirmModal';
import { DuplicateWorkspaceModal } from './DuplicateWorkspaceModal';
import { useSaveShortcut } from '../../hooks/useSaveShortcut';
import { apiErrorMessage } from '../../utils/apiError';
import { InviteLinksTab } from './InviteLinksTab';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function WorkspaceSettingsModal({ onClose }: { onClose: () => void }) {
  const { activeWorkspace, workspaces, setWorkspaces, setActiveWorkspace, user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'general' | 'members' | 'links' | 'activity'>('general');
  const [name, setName] = useState(activeWorkspace?.name || '');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(activeWorkspace?.isPublic || false);
  // The details request can resolve after the user has already typed. Applying
  // the server payload then would wipe that edit and a Save would persist the
  // old name.
  const edited = useRef({ name: false, description: false, isPublic: false });
  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<Array<{ email: string; role: string }>>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [emailError, setEmailError] = useState('');
  const [inviting, setInviting] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{isOpen: boolean; title: string; message: string; confirmLabel?: string; onConfirm: () => void}>({isOpen: false, title: '', message: '', onConfirm: () => {}});

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
        setInvites(res.data.invites || []);
        setActivityLogs(actRes.data || []);
      }).catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [activeWorkspace]);

  const refreshMembers = async () => {
    try {
      const res = await api.get(`/workspaces/${activeWorkspace?._id}`);
      setMembers(res.data.members || []);
      setInvites(res.data.invites || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const onChanged = (e: Event) => { if ((e as CustomEvent).detail === activeWorkspace?._id) refreshMembers(); };
    window.addEventListener('workspace-members-changed', onChanged);
    return () => window.removeEventListener('workspace-members-changed', onChanged);
  }, [activeWorkspace?._id]);

  const handleUpdate = async () => {
    try {
      const res = await api.put(`/workspaces/${activeWorkspace?._id}`, { name, description, isPublic });
      const updatedWorkspaces = workspaces.map(w => w._id === res.data._id ? { ...w, name: res.data.name, isPublic: res.data.isPublic } : w);
      setWorkspaces(updatedWorkspaces);
      setActiveWorkspace(updatedWorkspaces.find(w => w._id === res.data._id) || null);
      setError('');
      useToastStore.getState().addToast('success', 'Workspace settings saved');
    } catch (e: any) {
      const message = e.response?.data?.message || 'Failed to update';
      setError(message);
      useToastStore.getState().addToast('error', message);
    }
  };

  const BAD_EMAIL = 'Enter a valid email address, for example name@example.com.';
  const checkEmail = () => {
    const ok = EMAIL_RE.test(inviteEmail.trim());
    setEmailError(ok ? '' : BAD_EMAIL);
    return ok;
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inviting) return;
    if (!checkEmail()) { emailInput.current?.focus(); return; }
    const email = inviteEmail.trim().toLowerCase();
    setInviting(true);
    try {
      await api.post(`/workspaces/${activeWorkspace?._id}/members`, { email, role: inviteRole });
      await refreshMembers();
      useToastStore.getState().addToast('success', `Invitation sent to ${email}`);
      setInviteEmail('');
      setError('');
    } catch (e: any) {
      setEmailError(apiErrorMessage(e, 'Failed to add member'));
    } finally {
      setInviting(false);
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

  const revokeInvite = (email: string) => setConfirmConfig({
    isOpen: true,
    title: 'Revoke Invite',
    message: `${email} will not be able to join with this invite. This cannot be undone.`,
    confirmLabel: 'Revoke',
    onConfirm: async () => {
      setConfirmConfig(prev => ({ ...prev, isOpen: false }));
      try {
        await api.delete(`/workspaces/${activeWorkspace?._id}/invites/${encodeURIComponent(email)}`);
        await refreshMembers();
        useToastStore.getState().addToast('success', `Invite for ${email} revoked`);
      } catch (e: any) {
        const message = e.response?.data?.message || 'Failed to revoke invite';
        setError(message);
        useToastStore.getState().addToast('error', message);
      }
    },
  });

  const executeRemoveMember = async (userId: string) => {
    try {
      await api.delete(`/workspaces/${activeWorkspace?._id}/members/${userId}`);
      // Leaving: the server pushes workspace:access_revoked, which switches workspace.
      if (userId !== user?.id) await refreshMembers();
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
  const ownerCount = members.filter(m => m.role === 'owner').length;
  useSaveShortcut(() => { if (isOwner && activeTab === 'general' && !loading && !confirmConfig.isOpen && !showDuplicate) handleUpdate(); });

  // The confirm dialog (rendered inside this one) owns Escape while it is open.
  useEffect(() => {
    if (confirmConfig.isOpen || showDuplicate) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, confirmConfig.isOpen, showDuplicate]);

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[9999]">
      <div role="dialog" aria-modal="true" aria-labelledby="ws-settings-title" className="bg-background rounded-lg shadow-xl w-full max-w-[600px] h-[500px] max-h-full flex flex-col border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border bg-surface">
          <h2 id="ws-settings-title" className="text-lg font-bold">Workspace Settings</h2>
          <button data-testid="close-workspace-modal" onClick={onClose} aria-label="Close" className="p-1 hover:bg-border rounded focus-visible:ring-2 focus-visible:ring-primary"><X className="w-5 h-5" aria-hidden="true" /></button>
        </div>

        <div role="tablist" aria-label="Workspace settings sections" className="flex border-b border-border">
          <button 
            className={`px-4 py-2 font-medium ${activeTab === 'general' ? 'text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'} focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary`}
            role="tab"
            aria-selected={activeTab === 'general'}
            data-testid="workspace-general-tab"
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button
            data-testid="workspace-members-tab"
            className={`px-4 py-2 font-medium ${activeTab === 'members' ? 'text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'} focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary`}
            role="tab"
            aria-selected={activeTab === 'members'}
            onClick={() => setActiveTab('members')}
          >
            Members
          </button>
          {isOwner && (
            <button
              data-testid="workspace-links-tab"
              className={`px-4 py-2 font-medium ${activeTab === 'links' ? 'text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'} focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary`}
              role="tab"
              aria-selected={activeTab === 'links'}
              onClick={() => setActiveTab('links')}
            >
              Invite links
            </button>
          )}
          <button
            className={`px-4 py-2 font-medium ${activeTab === 'activity' ? 'text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'} focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary`}
            role="tab"
            aria-selected={activeTab === 'activity'}
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
              <span>Loading details…</span>
            </div>
          )}
          {error && <div role="alert" className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 p-2 rounded mb-4 text-sm relative z-20">{error}</div>}

          {activeTab === 'general' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="ws-name" className="block text-sm font-medium mb-1">Workspace Name</label>
                <input 
                  id="ws-name"
                  autoComplete="off"
                  data-testid="workspace-name-input"
                  type="text" 
                  value={name} 
                  onChange={e => { edited.current.name = true; setName(e.target.value); }} 
                  className="w-full p-2 border border-border rounded bg-surface disabled:opacity-60 focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
                  disabled={!isOwner}
                />
              </div>
              <div>
                <label htmlFor="ws-desc" className="block text-sm font-medium mb-1">Description</label>
                <textarea 
                  id="ws-desc"
                  value={description} 
                  onChange={e => { edited.current.description = true; setDescription(e.target.value); }}
                  className="w-full p-2 border border-border rounded bg-surface h-24 resize-none disabled:opacity-60 focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
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
                    className="bg-primary text-white px-4 py-2 rounded hover:bg-primary/90 transition"
                  >
                    Save Changes
                  </button>
                  <button
                    data-testid="duplicate-workspace-btn"
                    onClick={() => setShowDuplicate(true)}
                    className="border border-border px-4 py-2 rounded hover:bg-border transition"
                  >
                    Duplicate Workspace…
                  </button>
                  {!activeWorkspace?.isPersonal && <button
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
                  </button>}
                </div>
              )}
            </div>
          )}

          {activeTab === 'members' && (
            <div>
              {isOwner && (
                <form onSubmit={handleAddMember} noValidate className="flex gap-2 items-start">
                  <div className="flex-1">
                    <UserAutocomplete
                      value={inviteEmail}
                      onChange={v => { setInviteEmail(v); setEmailError(''); }}
                      onSelect={v => { setInviteEmail(v); setEmailError(''); }}
                      onBlur={() => { if (inviteEmail.trim()) checkEmail(); }}
                      inputRef={emailInput}
                      error={emailError ? 'workspace-invite-email-error' : undefined}
                    />
                  </div>
                  <select
                    data-testid="workspace-invite-role"
                    aria-label="Role for new member"
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value)}
                    className="p-2 border border-border rounded bg-surface text-text focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button
                    data-testid="workspace-invite-btn"
                    type="submit"
                    disabled={!inviteEmail.trim() || inviting}
                    className="bg-primary text-white px-4 py-2 rounded hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
                  >
                    <UserPlus className="w-4 h-4" aria-hidden="true" /> {inviting ? 'Inviting…' : 'Invite'}
                  </button>
                </form>
              )}
              {isOwner && emailError && <p id="workspace-invite-email-error" data-testid="workspace-invite-email-error" role="alert" className="text-xs text-delete mt-1">{emailError}</p>}
              {isOwner && inviteRole === 'owner' && <p className="text-xs text-text-muted mt-1">Owners can invite, remove and change anyone, including other owners.</p>}
              {isOwner && (
                <p className="text-xs text-text-muted mt-2 mb-4">Suggestions show only people you already share a workspace with. Type a full email to invite someone new. They join the next time they sign in.</p>
              )}

              <div className="border border-border rounded overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-surface border-b border-border">
                    <tr>
                      <th className="p-2">Name</th>
                      <th className="p-2">Email</th>
                      <th className="p-2">Role</th>
                      {isOwner && <th className="p-2 w-24">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map(m => (
                      <tr key={m.userId?._id || Math.random()} data-testid="member-row" className="border-b border-border last:border-0 hover:bg-surface">
                        <td className="p-2" data-testid="member-name">{m.userId?.name || "Deleted User"}</td>
                        <td className="p-2 text-text-muted" data-testid="member-email">{m.userId?.email || "N/A"}</td>
                        <td className="p-2 capitalize">
                          {isOwner && (m.role !== 'owner' || ownerCount > 1) ? (
                            <select 
                              data-testid="member-role-select"
                              aria-label={`Role for ${m.userId?.name || 'member'}`}
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
                              <option value="owner">Owner</option>
                            </select>
                          ) : (
                            <span className="p-1" data-testid="member-role-text" title={m.role === 'owner' ? 'A workspace needs at least one owner' : undefined}>{m.role}</span>
                          )}
                        </td>
                        {isOwner && (
                          <td className="p-2">
                            {(m.role !== 'owner' || ownerCount > 1) && (
                              <button data-testid="member-remove-btn" aria-label={`Remove ${m.userId?.name || 'member'}`} title="Remove member" onClick={() => handleRemove(m.userId?._id)} className="text-text-muted hover:text-red-500 p-1 rounded focus-visible:ring-2 focus-visible:ring-primary">
                                <Trash2 className="w-4 h-4" aria-hidden="true" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                    {invites.map(i => (
                      <tr key={i.email} data-testid="invite-row" className="border-b border-border last:border-0 hover:bg-surface">
                        <td className="p-2 text-text-muted italic">Invited</td>
                        <td className="p-2 text-text-muted" data-testid="invite-email">{i.email}</td>
                        <td className="p-2 text-text-muted"><span className="p-1">{cap(i.role)} · pending</span></td>
                        {isOwner && (
                          <td className="p-2">
                            <button data-testid="invite-cancel-btn" aria-label={`Revoke invite for ${i.email}`} onClick={() => revokeInvite(i.email)} className="text-sm text-text-muted hover:text-delete px-2 py-1 rounded focus-visible:ring-2 focus-visible:ring-primary">Revoke</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!isOwner && user && (
                <button
                  data-testid="leave-workspace-btn"
                  onClick={() => setConfirmConfig({
                    isOpen: true,
                    title: 'Leave Workspace',
                    message: 'Are you sure you want to leave this workspace?',
                    onConfirm: () => {
                      setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                      executeRemoveMember(user.id);
                    }
                  })}
                  className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition"
                >
                  Leave Workspace
                </button>
              )}
            </div>
          )}

          {activeTab === 'links' && isOwner && activeWorkspace && (
            <InviteLinksTab workspaceId={activeWorkspace._id} confirm={c => setConfirmConfig({ ...c, isOpen: true, onConfirm: () => { setConfirmConfig(prev => ({ ...prev, isOpen: false })); c.onConfirm(); } })} />
          )}

          {activeTab === 'activity' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b border-border pb-2">Workspace Activity</h3>
              {activityLogs.length === 0 ? (
                <p className="text-text-muted text-sm text-center py-8">No recent activity found.</p>
              ) : (
                <div className="space-y-3">
                  {activityLogs.map((log) => (
                    <div key={log._id} data-testid="activity-log-entry" className="p-3 bg-surface border border-border rounded text-sm">
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
      {showDuplicate && activeWorkspace && (
        <DuplicateWorkspaceModal workspace={activeWorkspace} onClose={() => setShowDuplicate(false)} onDone={onClose} />
      )}
      {confirmConfig.isOpen && (
        <ConfirmModal
          title={confirmConfig.title}
          confirmLabel={confirmConfig.confirmLabel}
          message={confirmConfig.message}
          onConfirm={confirmConfig.onConfirm}
          onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        />
      )}
    </div>,
    document.body
  );
}
