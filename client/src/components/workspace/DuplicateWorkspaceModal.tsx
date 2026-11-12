import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';

const OPTIONS = [
  { key: 'includeCollections', label: 'Collections & requests' },
  { key: 'includeEnvironments', label: 'Environments & global variables' },
  { key: 'includeSecretValues', label: 'Secret variable values', hint: 'Unchecked: secret variables are copied with empty values.' },
  { key: 'includeMembers', label: 'Members & roles', hint: 'Everyone with access today gets the same access to the copy.' },
] as const;

export function DuplicateWorkspaceModal({ workspace, onClose, onDone }: {
  workspace: { _id: string; name: string; isPersonal?: boolean };
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(`${workspace.name} (Copy)`);
  const [include, setInclude] = useState<Record<string, boolean>>({
    includeCollections: true, includeEnvironments: true, includeSecretValues: true, includeMembers: !workspace.isPersonal,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/workspaces/${workspace._id}/duplicate`, { name: name.trim(), ...include });
      const auth = useAuthStore.getState();
      const created = { ...data, myRole: 'owner' };
      auth.setWorkspaces([...auth.workspaces.filter(w => w._id !== created._id), created]);
      auth.setActiveWorkspace(created);
      useToastStore.getState().addToast('success', `Duplicated "${workspace.name}" as "${created.name}"`);
      onDone();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not duplicate the workspace. Nothing was changed on your side; try again.');
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[10000]">
      <form role="dialog" aria-modal="true" aria-labelledby="dup-ws-title" onSubmit={submit}
        className="bg-background rounded-lg shadow-xl w-full max-w-[460px] border border-border flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 id="dup-ws-title" className="text-lg font-bold">Duplicate Workspace</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="p-1 hover:bg-border rounded focus-visible:ring-2 focus-visible:ring-primary"><X className="w-5 h-5" aria-hidden="true" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label htmlFor="dup-ws-name" className="block text-sm font-medium mb-1">New Workspace Name</label>
            <input id="dup-ws-name" data-testid="duplicate-workspace-name" autoFocus autoComplete="off" value={name} disabled={busy}
              onChange={e => setName(e.target.value)} onFocus={e => e.target.select()}
              className="w-full p-2 border border-border rounded bg-surface focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 outline-none" />
          </div>
          <fieldset disabled={busy} className="space-y-2">
            <legend className="text-sm font-medium mb-1">What to include</legend>
            {OPTIONS.map(o => {
              const off = o.key === 'includeMembers' && workspace.isPersonal;
              return (
                <label key={o.key} className={`flex items-start gap-2 text-sm ${off ? 'opacity-60' : ''}`}>
                  <input type="checkbox" className="mt-0.5" data-testid={`duplicate-${o.key}`} checked={include[o.key] && !off} disabled={off}
                    onChange={e => setInclude(p => ({ ...p, [o.key]: e.target.checked }))} />
                  <span>{o.label}
                    <span className="block text-xs text-text-muted">{off ? 'Personal workspaces have no other members.' : 'hint' in o ? o.hint : ''}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <p className="text-xs text-text-muted">You will be the owner of the copy. Profile variables are personal and are not copied.</p>
          {error && <div role="alert" className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 p-2 rounded text-sm">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded hover:bg-border">Cancel</button>
          <button type="submit" data-testid="duplicate-workspace-submit" disabled={busy} className="bg-primary text-white px-4 py-2 rounded hover:bg-primary/90 disabled:opacity-60">
            {busy ? 'Duplicating…' : 'Duplicate Workspace'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
