import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useEscape } from '../../hooks/useEscape';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { useCollectionStore } from '../../store/collectionStore';
import { useEnvironmentStore } from '../../store/environmentStore';
import type { MissingVariable } from '../../utils/missingVariables';

type Scope = 'profile' | 'environment' | 'global' | 'collection';
interface Row { scope: Scope; value: string; secret: boolean }

const SCOPE_LABEL: Record<Scope, string> = { profile: 'Profile', environment: 'Environment', global: 'Global', collection: 'Collection' };
const SCOPES: Scope[] = ['environment', 'collection', 'global', 'profile'];

export function MissingVariablesModal({ missing, collectionId, onCreated, onRunAnyway, onCancel }: {
  missing: MissingVariable[];
  collectionId: string;
  onCreated: () => void;
  onRunAnyway: () => void;
  onCancel: () => void;
}) {
  const canWrite = ['editor', 'owner'].includes(useAuthStore(s => s.activeWorkspace?.myRole) || '');
  const activeEnvironmentId = useEnvironmentStore(s => s.activeEnvironmentId);
  // Profile is per-user, so it is the only scope a viewer may change.
  const disabledReason = (s: Scope): string | null => {
    if (s === 'profile') return null;
    if (!canWrite) return 'view-only access';
    if (s === 'environment' && !activeEnvironmentId) return 'no environment selected';
    return null;
  };
  const defaultScope = SCOPES.find(s => !disabledReason(s)) as Scope;

  const [rows, setRows] = useState<Record<string, Row>>(() => Object.fromEntries(missing.map(m => [
    m.name, { scope: defaultScope, value: '', secret: /key|token|secret|password|auth/i.test(m.name) },
  ])));
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const done = useRef(new Set<string>()); // saved on an earlier attempt; a retry must not add them twice

  useEscape(busy ? undefined : onCancel);

  const patch = (name: string, p: Partial<Row>) => setRows(r => ({ ...r, [name]: { ...r[name], ...p } }));

  const saveScope = async (scope: Scope, items: [string, Row][]) => {
    const env = useEnvironmentStore.getState();
    const envVar = ([k, r]: [string, Row]) => ({ key: k, initialValue: r.value, currentValue: r.value, type: r.secret ? 'secret' : 'default', enabled: true });
    if (scope === 'profile') {
      const vars = [...env.userProfileVariables, ...items.map(([k, r]) => ({ key: k, value: r.value, type: r.secret ? 'secret' as const : 'default' as const, enabled: true }))];
      const res = await api.put('/user-profile-variables', { variables: vars });
      env.setUserProfileVariables(res.data.variables || vars);
    } else if (scope === 'environment') {
      const cur = env.environments.find(e => e._id === activeEnvironmentId)!;
      const res = await api.put(`/environments/${cur._id}`, { name: cur.name, variables: [...cur.variables, ...items.map(envVar)] });
      env.applyEnvironmentUpserted(res.data);
    } else if (scope === 'global') {
      const workspaceId = useAuthStore.getState().activeWorkspace!._id;
      const res = await api.put(`/workspaces/${workspaceId}/global-environment`, { variables: [...(env.globalEnvironment?.variables || []), ...items.map(envVar)] });
      env.setGlobalEnvironment({ ...res.data, isGlobal: true });
    } else {
      const { collections, setCollections } = useCollectionStore.getState();
      const cur = collections.find(c => c._id === collectionId)!;
      const res = await api.put(`/collections/${collectionId}`, { variables: [...(cur.variables || []), ...items.map(([k, r]) => ({ key: k, value: r.value, enabled: true }))] });
      setCollections(collections.map(c => (c._id === collectionId ? { ...c, variables: res.data.variables } : c)));
    }
  };

  const create = async () => {
    setBusy(true);
    setError('');
    const bad = new Set<string>();
    for (const scope of SCOPES) {
      const items = Object.entries(rows).filter(([k, r]) => r.scope === scope && !done.current.has(k));
      if (!items.length) continue;
      try { await saveScope(scope, items); items.forEach(([k]) => done.current.add(k)); }
      catch { items.forEach(([k]) => bad.add(k)); }
    }
    setBusy(false);
    if (!bad.size) { onCreated(); return; }
    setFailed(bad);
    setError(`Couldn't create ${bad.size} variable${bad.size > 1 ? 's' : ''}. They weren't saved and the run didn't start. Try again or choose another scope.`);
  };

  const setAll = (scope: Scope) => setRows(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { ...v, scope }])));

  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[210]">
      <div role="dialog" aria-modal="true" aria-labelledby="missing-vars-title" aria-describedby="missing-vars-sub" data-testid="missing-variables-modal"
        className="bg-background rounded-lg shadow-xl w-full max-w-[720px] max-h-full flex flex-col border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 id="missing-vars-title" className="text-lg font-bold">Missing Variables</h2>
            <p id="missing-vars-sub" className="text-sm text-text-muted">{missing.length} variable{missing.length > 1 ? 's' : ''} used in this run {missing.length > 1 ? "aren't" : "isn't"} defined in any scope.</p>
          </div>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Close" className="p-1 hover:bg-border rounded focus-visible:ring-2 focus-visible:ring-primary"><X className="w-5 h-5" aria-hidden="true" /></button>
        </div>
        <div className="p-4 overflow-y-auto space-y-3">
          {!canWrite && <p className="text-sm text-text-muted">You have view-only access, so these are saved to your Profile only (visible only to you, in all workspaces).</p>}
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="mv-all">Set scope for all</label>
            <select id="mv-all" defaultValue="" onChange={e => e.target.value && setAll(e.target.value as Scope)} disabled={busy} className="p-1 border border-border rounded bg-surface text-text">
              <option value="" disabled>Choose…</option>
              {SCOPES.map(s => <option key={s} value={s} disabled={!!disabledReason(s)}>{SCOPE_LABEL[s]}{disabledReason(s) ? ` (${disabledReason(s)})` : ''}</option>)}
            </select>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-text-muted"><th className="py-1 pr-2">Variable</th><th className="pr-2">Used in</th><th className="pr-2">Scope</th><th>Value</th></tr></thead>
            <tbody>
              {missing.map(m => {
                const r = rows[m.name];
                return (
                  <tr key={m.name} className="border-t border-border align-top" data-testid={`missing-var-${m.name}`}>
                    <td className="py-2 pr-2 font-mono" translate="no">{m.name}</td>
                    <td className="py-2 pr-2 text-text-muted" title={m.usedIn.join('\n')}>{m.usedIn[0]}{m.usedIn.length > 1 && ` +${m.usedIn.length - 1} more`}</td>
                    <td className="py-2 pr-2">
                      <select aria-label={`Scope for ${m.name}`} value={r.scope} disabled={busy} onChange={e => patch(m.name, { scope: e.target.value as Scope })} className="p-1 border border-border rounded bg-surface text-text">
                        {SCOPES.map(s => <option key={s} value={s} disabled={!!disabledReason(s)}>{SCOPE_LABEL[s]}{disabledReason(s) ? ` (${disabledReason(s)})` : ''}</option>)}
                      </select>
                    </td>
                    <td className="py-2">
                      <input aria-label={`Value for ${m.name}`} data-testid={`missing-var-value-${m.name}`} type={r.secret && !show[m.name] ? 'password' : 'text'} autoComplete="off" spellCheck={false}
                        value={r.value} disabled={busy} onChange={e => patch(m.name, { value: e.target.value })}
                        className="w-full p-1 border border-border rounded bg-surface font-mono" />
                      <div className="flex gap-3 mt-1 text-xs text-text-muted">
                        <label className="flex items-center gap-1"><input type="checkbox" aria-label={`Mark ${m.name} as secret`} checked={r.secret} disabled={busy} onChange={e => patch(m.name, { secret: e.target.checked })} />Secret</label>
                        {r.secret && <button type="button" aria-label={`${show[m.name] ? 'Hide' : 'Show'} value of ${m.name}`} onClick={() => setShow(s => ({ ...s, [m.name]: !s[m.name] }))} className="underline">{show[m.name] ? 'Hide' : 'Show'}</button>}
                        {failed.has(m.name) && <span role="alert" className="text-red-600 dark:text-red-400">Couldn't save</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-text-muted">Leaving a value empty creates the variable with an empty string.</p>
          <div aria-live="polite">{error && <div role="alert" className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 p-2 rounded text-sm">{error}</div>}</div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 rounded hover:bg-border">Cancel</button>
          <button type="button" onClick={onRunAnyway} disabled={busy} title="Requests that use these variables will send the text as written, for example {{apiKey}}." className="px-4 py-2 rounded border border-border hover:bg-border">Run Anyway</button>
          <button type="button" data-testid="missing-variables-create" onClick={create} disabled={busy} className="bg-primary text-white px-4 py-2 rounded hover:bg-primary/90 disabled:opacity-60">
            {busy ? 'Creating…' : `Create & Run (${missing.length})`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
