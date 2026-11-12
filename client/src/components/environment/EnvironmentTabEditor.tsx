import { useState, useEffect, useRef } from 'react';
import { useEnvironmentStore } from '../../store/environmentStore';
import { useRequestStore } from '../../store/requestStore';
import { useAuthStore } from '../../store/authStore';
import { Lock, Unlock, Eye, EyeOff, Trash2, Download, Save, Plus } from 'lucide-react';
import { useToastStore } from '../../store/toastStore';
import api from '../../api/axios';
import type { EnvironmentVariable } from '../../store/environmentStore';

export function EnvironmentTabEditor() {
  const { activeRequest, updateActiveRequest, markSaved } = useRequestStore();
  const { environments, globalEnvironment, setEnvironments, setGlobalEnvironment } = useEnvironmentStore();
  const { workspaces, activeWorkspace } = useAuthStore();
  
  const envId = activeRequest?.environmentId;
  const isGlobal = envId === 'global';
  
  const env = isGlobal 
    ? globalEnvironment 
    : environments.find(e => e._id === envId);

  const [localVars, setLocalVars] = useState<EnvironmentVariable[]>(env?.variables || []);
  const [name, setName] = useState(env?.name || '');
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set());
  const [targetWorkspaceId, setTargetWorkspaceId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const focusNewVar = useRef(false);
  // Move focus into the key input of a row that was just added.
  useEffect(() => {
    if (!focusNewVar.current) return;
    focusNewVar.current = false;
    document.querySelector<HTMLInputElement>(`[data-testid="env-var-key-${localVars.length - 1}"]`)?.focus();
  }, [localVars.length]);

  useEffect(() => {
    if (env) {
      setLocalVars(env.variables);
      // Globals have no name, and an undefined value would make the input uncontrolled.
      setName(env.name ?? '');
      setRevealedIndices(new Set());
    }
    // env.variables / env.name by reference: a store replacement (socket or
    // reload) refreshes the buffer; keystrokes only touch localVars.
  }, [envId, env?.variables, env?.name]);

  // Dirty = differs from the saved env; a blank row or a reverted edit is not a change.
  const markDirty = (vars: EnvironmentVariable[], nm: string) => {
    const norm = (v: EnvironmentVariable[]) => JSON.stringify(v.filter(x => x.key || x.initialValue || x.currentValue));
    updateActiveRequest({ isDirty: norm(vars) !== norm(env?.variables || []) || nm !== (env?.name ?? '') });
  };

  const handleAddVar = () => {
    focusNewVar.current = true;
    const newVars = [...localVars, { key: '', initialValue: '', currentValue: '', isSecret: false, enabled: true }];
    setLocalVars(newVars);
    markDirty(newVars, name);
  };

  const handleUpdateVar = (index: number, field: keyof EnvironmentVariable, value: any) => {
    const newVars = [...localVars];
    newVars[index] = { ...newVars[index], [field]: value };
    setLocalVars(newVars);
    markDirty(newVars, name);
  };

  const handleRemoveVar = (index: number) => {
    const newVars = localVars.filter((_, i) => i !== index);
    setLocalVars(newVars);
    markDirty(newVars, name);
  };

  const toggleRevealSecret = (index: number) => {
    const newSet = new Set(revealedIndices);
    if (newSet.has(index)) newSet.delete(index);
    else newSet.add(index);
    setRevealedIndices(newSet);
  };

  const handleSave = async () => {
    if (!env) return;
    setSaving(true);
    try {
      if (isGlobal) {
        // The global env is a separate table/endpoint keyed by workspace,
        // not a row in the regular environments table — PUT /environments/:id
        // would 404 since that id never exists there.
        if (!activeWorkspace) return;
        const res = await api.put(`/workspaces/${activeWorkspace._id}/global-environment`, { variables: localVars });
        const saved = { ...res.data, isGlobal: true };
        setGlobalEnvironment(saved);
        setLocalVars(saved.variables || localVars);
        import('../../db').then(({ db }) => db.environments.put({ ...saved, workspaceId: activeWorkspace._id })).catch(() => {});
      } else {
        const res = await api.put(`/environments/${env._id}`, { name, variables: localVars });
        setEnvironments(environments.map(e => e._id === env._id ? res.data : e));
      }
      // Update tab name first — updateActiveRequest marks the tab dirty by default
      if (!isGlobal) {
        updateActiveRequest({ name, isDirty: false });
      }
      markSaved();
      useToastStore.getState().addToast('success', 'Environment saved');
    } catch (e) {
      console.error(e);
      useToastStore.getState().addToast('error', 'Failed to save environment');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    if (!env) return;
    // Postman's environment format, so the file opens there and comes back
    // through Import > File here.
    const exportable = {
      name: env.name || 'Globals',
      values: (localVars || []).filter(v => v.key).map(v => ({
        key: v.key,
        // Same precedence as resolution: an empty current value falls back to the initial one.
        value: v.currentValue || v.initialValue || v.value || '',
        type: v.isSecret ? 'secret' : 'default',
        enabled: v.enabled !== false,
      })),
      _postman_variable_scope: 'environment',
      _reqSpace_variable_scope: 'environment',
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportable, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${env.name}.reqspace_environment.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleCopyToWorkspace = async () => {
    if (!env || isGlobal || !targetWorkspaceId) return;
    try {
      await api.post(`/workspaces/${targetWorkspaceId}/environments`, {
        name: `${env.name} (Copy)`,
        variables: localVars
      });
      const { useToastStore } = await import('../../store/toastStore');
      useToastStore.getState().addToast('success', 'Environment copied to workspace successfully!');
      setTargetWorkspaceId('');
    } catch (e) {
      console.error(e);
      const { useToastStore } = await import('../../store/toastStore');
      useToastStore.getState().addToast('error', 'Failed to copy environment');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key ?? "").toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [handleSave]);

  if (!env) return <div className="p-4 text-text-muted">Environment not found</div>;

  return (
    <div className="flex-1 flex flex-col p-4 bg-background min-h-0">
      <div className="flex justify-between items-center gap-4 mb-4">
        <input
          type="text"
          value={name}
          onChange={e => { setName(e.target.value); markDirty(localVars, e.target.value); }}
          className="min-w-0 text-xl font-bold bg-transparent border-b border-transparent focus:border-primary focus-visible:outline-none"
          aria-label="Environment name"
          readOnly={isGlobal}
        />
        <div className="flex items-center gap-2 shrink-0">
          {!isGlobal && workspaces.length > 1 && (
            <div className="flex items-center gap-2 border-r border-border pr-3">
              <select
                data-testid="env-copy-target"
                value={targetWorkspaceId}
                onChange={e => setTargetWorkspaceId(e.target.value)}
                aria-label="Copy environment to workspace"
                className="px-2 py-1.5 border border-border rounded bg-surface text-sm"
              >
                <option value="">Copy to Workspace…</option>
                {workspaces.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
              </select>
              <button
                data-testid="env-copy-btn"
                onClick={handleCopyToWorkspace}
                disabled={!targetWorkspaceId}
                className="border border-border text-text-muted hover:text-text hover:bg-surface px-3 py-1.5 rounded transition text-sm disabled:opacity-50"
              >
                Copy
              </button>
            </div>
          )}

          <button
            data-testid="env-export-btn"
            onClick={handleExport}
            className="border border-border hover:bg-surface text-text-muted hover:text-text px-3 py-1.5 rounded transition text-sm flex items-center gap-1.5"
            title="Export Environment JSON"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Export
          </button>
          <button
            data-testid="env-save-btn"
            onClick={handleSave}
            disabled={saving || !activeRequest?.isDirty}
            className="flex items-center gap-2 bg-primary-strong text-white px-3 py-1.5 rounded hover:bg-primary/90 transition text-sm font-medium disabled:opacity-50"
          >
            <Save className="w-4 h-4" aria-hidden="true" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto border border-border rounded">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-surface border-b border-border sticky top-0 z-10 text-xs font-semibold uppercase text-text-muted">
              <th className="p-2 w-8"></th>
              <th className="p-2 border-l border-border">VARIABLE</th>
              <th className="p-2 border-l border-border w-24">TYPE</th>
              <th className="p-2 border-l border-border">INITIAL VALUE</th>
              <th className="p-2 border-l border-border">CURRENT VALUE</th>
              <th className="p-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {localVars.map((v, i) => {
              const isRevealed = revealedIndices.has(i);
              return (
                <tr key={i} className="border-b border-border hover:bg-surface group">
                  <td className="p-2 text-center">
                    <input type="checkbox" aria-label={`Enable ${v.key || 'variable'}`} checked={v.enabled} onChange={e => handleUpdateVar(i, 'enabled', e.target.checked)} />
                  </td>
                  <td className="p-0 border-l border-border relative">
                    <input type="text" data-testid={`env-var-key-${i}`} value={v.key} onChange={e => handleUpdateVar(i, 'key', e.target.value)} className="w-full p-2 bg-transparent font-mono focus:bg-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary" placeholder="New key" aria-label="Variable name" />
                  </td>
                  <td className="p-1 border-l border-border text-center">
                    <button
                      type="button"
                      onClick={() => handleUpdateVar(i, 'isSecret', !v.isSecret)}
                      className={`px-2 py-0.5 text-xs rounded border flex items-center justify-center gap-1 w-full ${v.isSecret ? 'border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10' : 'border-border text-text-muted hover:bg-surface'}`}
                      title={v.isSecret ? 'Secret (Masked)' : 'Default (Plain text)'}
                    >
                      {v.isSecret ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3 text-text-muted" />}
                      {v.isSecret ? 'secret' : 'default'}
                    </button>
                  </td>
                  <td className="p-0 border-l border-border relative">
                    <input
                      data-testid={`env-var-initial-${i}`}
                      type={v.isSecret && !isRevealed ? 'password' : 'text'}
                      value={v.initialValue}
                      onChange={e => handleUpdateVar(i, 'initialValue', e.target.value)}
                      className="w-full p-2 bg-transparent font-mono focus:bg-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
                      placeholder="Initial value"
                      aria-label="Initial value"
                    />
                  </td>
                  <td className="p-0 border-l border-border relative">
                    <input
                      data-testid={`env-var-current-${i}`}
                      type={v.isSecret && !isRevealed ? 'password' : 'text'}
                      value={v.currentValue}
                      onChange={e => handleUpdateVar(i, 'currentValue', e.target.value)}
                      className="w-full p-2 bg-transparent font-mono focus:bg-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
                      placeholder="Current value"
                      aria-label="Current value"
                    />
                  </td>
                  <td className="p-2 text-center flex items-center justify-center gap-1">
                    {v.isSecret && (
                      <button
                        type="button"
                        onClick={() => toggleRevealSecret(i)}
                        className="text-text-muted hover:text-text p-0.5"
                        title={isRevealed ? 'Hide value' : 'Show value'}
                        aria-label={isRevealed ? 'Hide value' : 'Show value'}
                      >
                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <button onClick={() => handleRemoveVar(i)} aria-label="Remove variable" title="Remove variable" className="text-text-muted hover:text-red-500 p-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {localVars.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-text-muted">
                  No variables yet. Add one, then use it in requests as <code className="font-mono">{'{{name}}'}</code>.
                </td>
              </tr>
            )}
            <tr data-testid="add-env-var-btn" className="hover:bg-surface cursor-pointer" onClick={handleAddVar}>
              <td className="p-2"></td>
              <td className="p-2 border-l border-border text-text-muted" colSpan={5}>
                <span className="inline-flex items-center gap-1"><Plus className="w-4 h-4" aria-hidden="true" />Add Variable</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
