import { useEffect, useRef, useState } from 'react';
import api from '../../api/axios';
import { apiErrorMessage } from '../../utils/apiError';
import { useToastStore } from '../../store/toastStore';

interface Link { id: string; role: string; singleUse: boolean; expiresAt: string; useCount: number }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const select = 'p-2 border border-border rounded bg-surface text-text focus-visible:ring-2 focus-visible:ring-primary/40';
const secondaryBtn = 'border border-border px-4 py-2 rounded hover:bg-border focus-visible:ring-2 focus-visible:ring-primary';

function expiresIn(iso: string): string {
  const mins = Math.max(1, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'always', style: 'short' });
  return mins < 60 ? rtf.format(mins, 'minute') : rtf.format(Math.round(mins / 60), 'hour');
}

export function InviteLinksTab({ workspaceId, confirm }: {
  workspaceId: string;
  confirm: (c: { title: string; message: string; confirmLabel: string; onConfirm: () => void }) => void;
}) {
  const [role, setRole] = useState('viewer');
  const [use, setUse] = useState('single');
  const [expiry, setExpiry] = useState('1h');
  const [links, setLinks] = useState<Link[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState<string | null>(null); // the token exists only here, once
  const [copied, setCopied] = useState(false);
  const copyRef = useRef<HTMLButtonElement>(null);
  const roleRef = useRef<HTMLSelectElement>(null);
  const toast = useToastStore.getState().addToast;

  const load = () => api.get(`/workspaces/${workspaceId}/invite-links`)
    .then(r => { setLinks(r.data); setLoadError(false); })
    .catch(() => setLoadError(true));
  useEffect(() => { load(); }, [workspaceId]);
  useEffect(() => { if (url) copyRef.current?.focus(); }, [url]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const { data } = await api.post(`/workspaces/${workspaceId}/invite-links`, { role, singleUse: use === 'single', expiresIn: expiry });
      setUrl(`${window.location.origin}/invite/${data.token}`);
      setCopied(false);
      await load();
    } catch (err: any) {
      toast('error', apiErrorMessage(err, 'Failed to create invite link'));
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url!);
      setCopied(true);
      toast('success', 'Invite link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('error', 'Could not copy. Select the link and copy it manually.');
    }
  };

  const revoke = (l: Link) => confirm({
    title: 'Revoke Invite Link',
    message: 'Anyone who has this link will no longer be able to join. People who already joined stay members.',
    confirmLabel: 'Revoke',
    onConfirm: async () => {
      try {
        await api.delete(`/workspaces/${workspaceId}/invite-links/${l.id}`);
        toast('success', 'Invite link revoked');
        await load();
        roleRef.current?.focus();
      } catch (err: any) {
        toast('error', apiErrorMessage(err, 'Failed to revoke invite link'));
      }
    },
  });

  return (
    <div>
      <form onSubmit={create} className="flex flex-wrap items-end gap-2">
        <label className="text-sm font-medium flex flex-col gap-1">Role
          <select ref={roleRef} data-testid="invite-link-role" value={role} onChange={e => setRole(e.target.value)} className={select}>
            <option value="viewer">Viewer</option><option value="editor">Editor</option><option value="owner">Owner</option>
          </select>
        </label>
        <label className="text-sm font-medium flex flex-col gap-1">Uses
          <select data-testid="invite-link-use" value={use} onChange={e => setUse(e.target.value)} className={select}>
            <option value="single">One-time</option><option value="multi">Multi-use</option>
          </select>
        </label>
        <label className="text-sm font-medium flex flex-col gap-1">Valid for
          <select data-testid="invite-link-expiry" value={expiry} onChange={e => setExpiry(e.target.value)} className={select}>
            <option value="1h">1 hour</option><option value="1d">1 day</option>
          </select>
        </label>
        <button data-testid="invite-link-create-btn" type="submit" disabled={creating}
          className="bg-primary text-white px-4 py-2 rounded hover:bg-primary/90 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2">
          {creating ? 'Creating…' : 'Create Link'}
        </button>
      </form>

      {url && (
        <div data-testid="invite-link-result" role="status" className="mt-4 p-3 rounded border border-primary/40 bg-primary/5">
          <p className="font-medium text-sm mb-2">Link created. Copy it now.</p>
          <div className="flex gap-2">
            <input data-testid="invite-link-url" readOnly value={url} aria-label="Invite link" onFocus={e => e.currentTarget.select()}
              className="w-full p-2 border border-border rounded bg-surface text-text font-mono text-xs focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 outline-none" />
            <button ref={copyRef} data-testid="invite-link-copy-btn" type="button" onClick={copy} className={secondaryBtn}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <p className="text-xs text-text-muted mt-2">This link is shown only once. If you lose it, revoke it and create a new one.</p>
          <button data-testid="invite-link-dismiss-btn" type="button" onClick={() => setUrl(null)} className="mt-2 text-sm text-text-muted hover:text-text px-2 py-1 rounded focus-visible:ring-2 focus-visible:ring-primary">Done</button>
        </div>
      )}

      <h3 className="text-sm font-semibold mt-6 mb-2">Active links</h3>
      {loadError && <p role="alert" className="text-xs text-delete mb-2">Could not load invite links. Close and reopen settings to retry.</p>}
      {links.length === 0 && !loadError ? (
        <p data-testid="invite-links-empty" className="text-sm text-text-muted text-center py-6">No active links. Create one above to invite people without knowing their email.</p>
      ) : links.length > 0 && (
        <div className="border border-border rounded overflow-hidden">
          <table data-testid="invite-links-table" className="w-full text-sm text-left">
            <thead className="bg-surface border-b border-border">
              <tr><th className="p-2">Role</th><th className="p-2">Type</th><th className="p-2">Expires</th><th className="p-2">Uses</th><th className="p-2 w-24"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {links.map(l => (
                <tr key={l.id} data-testid="invite-link-row" className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="p-2">{cap(l.role)}</td>
                  <td className="p-2">{l.singleUse ? 'One-time' : 'Multi-use'}</td>
                  <td className="p-2" title={new Date(l.expiresAt).toLocaleString()}>{expiresIn(l.expiresAt)}</td>
                  <td className="p-2 tabular-nums">{l.singleUse ? `${l.useCount} / 1` : l.useCount}</td>
                  <td className="p-2">
                    <button data-testid="invite-link-revoke-btn" aria-label={`Revoke ${l.role} link expiring ${expiresIn(l.expiresAt)}`} onClick={() => revoke(l)}
                      className="text-sm text-text-muted hover:text-delete px-2 py-1 rounded focus-visible:ring-2 focus-visible:ring-primary">Revoke</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
