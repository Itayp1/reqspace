import { useEffect, useRef, useState } from 'react';
import { useEnvironmentStore } from '../../store/environmentStore';
import { useToastStore } from '../../store/toastStore';
import { resolveWithSource, type VarScope } from '../../utils/variables';
import { saveVariable } from '../../utils/saveVariable';
import { apiErrorMessage } from '../../utils/apiError';

const LABEL: Record<VarScope, string> = { profile: 'Profile', environment: 'Environment', global: 'Global' };

/** Right-click popover for a {{variable}}: where its value comes from, the values it overrides, and an editor for the winning scope. */
export function VariablePopover({ name, canWrite, onClose }: { name: string; canWrite: boolean; onClose: () => void }) {
  const activeEnvironmentId = useEnvironmentStore(s => s.activeEnvironmentId);
  const hits = resolveWithSource(name);
  const [winner, ...shadowed] = hits;
  // Profile is per-user, so it is the only scope a viewer may change.
  const writable = (s: VarScope) => s === 'profile' || (canWrite && (s !== 'environment' || !!activeEnvironmentId));
  const createScope: VarScope = writable('environment') ? 'environment' : 'profile';
  const target = winner?.scope ?? createScope;
  const [scope, setScope] = useState<VarScope>(target);
  const [value, setValue] = useState(winner?.value ?? '');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [onClose]);

  const save = async () => {
    setBusy(true);
    try {
      await saveVariable(scope, name, value);
      useToastStore.getState().addToast('success', `${name} saved in ${LABEL[scope]}`);
      onClose();
    } catch (e) {
      useToastStore.getState().addToast('error', apiErrorMessage(e, `Couldn't save ${name}`));
      setBusy(false);
    }
  };

  const canEdit = writable(scope);
  return (
    <div ref={ref} data-testid="variable-popover" role="dialog" aria-label={`Variable ${name}`}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      className="absolute left-0 top-full mt-1 z-50 w-72 bg-background text-text border border-border rounded-lg shadow-2xl p-3 text-xs flex flex-col gap-2">
      <div className="font-mono font-semibold break-all">{name}</div>
      <div data-testid="variable-popover-source" className="text-text-muted">
        {winner ? <>Source: <b>{LABEL[winner.scope]}</b>{shadowed.length > 0 && ` · overrides ${shadowed.map(h => LABEL[h.scope]).join(', ')}`}</> : 'Not defined in any scope'}
      </div>
      {!winner && (
        <label className="flex items-center gap-2">Create in
          <select aria-label="Scope" value={scope} onChange={e => setScope(e.target.value as VarScope)} className="p-1 border border-border rounded bg-surface text-text">
            {(['environment', 'profile', 'global'] as VarScope[]).map(s => <option key={s} value={s} disabled={!writable(s)}>{LABEL[s]}</option>)}
          </select>
        </label>
      )}
      <input data-testid="variable-popover-input" aria-label={`Value of ${name}`} autoFocus autoComplete="off" spellCheck={false}
        type={winner?.secret ? 'password' : 'text'} value={value} readOnly={!canEdit || busy}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && canEdit) { e.preventDefault(); save(); } }}
        className="w-full p-1 border border-border rounded bg-surface font-mono" />
      {!canEdit && <div className="text-text-muted">View-only access: you can't change this scope.</div>}
      {shadowed.length > 0 && (
        <div data-testid="variable-popover-shadowed" className="text-text-muted">
          {shadowed.map(h => (
            <div key={h.scope} className="line-through break-all">{LABEL[h.scope]}: {h.secret ? '••••' : h.value}</div>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-2 py-1 rounded hover:bg-border">Close</button>
        <button type="button" data-testid="variable-popover-save" onClick={save} disabled={busy || !canEdit}
          className="px-2 py-1 rounded bg-primary text-white disabled:opacity-60">Save</button>
      </div>
    </div>
  );
}
