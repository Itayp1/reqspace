import { useState, useEffect } from 'react';
import { useEnvironmentStore } from '../../store/environmentStore';
import { useRequestStore } from '../../store/requestStore';
import { useAuthStore } from '../../store/authStore';
import { Lock, Unlock, Eye, EyeOff, Trash2, Download } from 'lucide-react';
import api from '../../api/axios';
import type { EnvironmentVariable } from '../../store/environmentStore';

export function EnvironmentTabEditor() {
  const { activeRequest, updateActiveRequest, markSaved } = useRequestStore();
  const { environments, globalEnvironment, setEnvironments, setGlobalEnvironment } = useEnvironmentStore();
  const { workspaces } = useAuthStore();
  
  const envId = activeRequest?.environmentId;
  const isGlobal = envId === 'global';
  
  const env = isGlobal 
    ? globalEnvironment 
    : environments.find(e => e._id === envId);

  const [localVars, setLocalVars] = useState<EnvironmentVariable[]>(env?.variables || []);
  const [name, setName] = useState(env?.name || '');
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set());
  const [targetWorkspaceId, setTargetWorkspaceId] = useState<string>('');

  useEffect(() => {
    if (env) {
      setLocalVars(env.variables);
      setName(env.name);
      setRevealedIndices(new Set());
    }
  }, [envId]); // Only reset when switching tabs

  const handleAddVar = () => {
    setLocalVars([...localVars, { key: '', initialValue: '', currentValue: '', isSecret: false, enabled: true }]);
    updateActiveRequest({ isDirty: true });
  };

  const handleUpdateVar = (index: number, field: keyof EnvironmentVariable, value: any) => {
    const newVars = [...localVars];
    newVars[index] = { ...newVars[index], [field]: value };
    setLocalVars(newVars);
    updateActiveRequest({ isDirty: true });
  };

  const handleRemoveVar = (index: number) => {
    const newVars = localVars.filter((_, i) => i !== index);
    setLocalVars(newVars);
    updateActiveRequest({ isDirty: true });
  };

  const toggleRevealSecret = (index: number) => {
    const newSet = new Set(revealedIndices);
    if (newSet.has(index)) newSet.delete(index);
    else newSet.add(index);
    setRevealedIndices(newSet);
  };

  const handleSave = async () => {
    if (!env) return;
    try {
      if (isGlobal) {
        const res = await api.put(`/environments/${env._id}`, { variables: localVars });
        setGlobalEnvironment(res.data);
      } else {
        const res = await api.put(`/environments/${env._id}`, { name, variables: localVars });
        setEnvironments(environments.map(e => e._id === env._id ? res.data : e));
      }
      markSaved();
      // Update tab name
      if (!isGlobal) {
        updateActiveRequest({ name });
      }
    } catch (e) {
      console.error(e);
      alert('Failed to save environment');
    }
  };

  const handleExport = () => {
    if (!env) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(env, null, 2));
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
      alert('Environment copied to workspace successfully!');
      setTargetWorkspaceId('');
    } catch (e) {
      console.error(e);
      alert('Failed to copy environment');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
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
      <div className="flex justify-between items-center mb-4">
        <input
          type="text"
          value={name}
          onChange={e => { setName(e.target.value); updateActiveRequest({ isDirty: true }); }}
          className="text-xl font-bold bg-transparent outline-none border-b border-transparent focus:border-primary"
          readOnly={isGlobal}
        />
        <div className="flex items-center gap-4">
          {!isGlobal && workspaces.length > 1 && (
            <div className="flex items-center gap-2 border-r border-border pr-4">
              <select 
                value={targetWorkspaceId}
                onChange={e => setTargetWorkspaceId(e.target.value)}
                className="p-2 border border-border rounded bg-surface text-sm"
              >
                <option value="">Copy to Workspace...</option>
                {workspaces.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
              </select>
              <button
                onClick={handleCopyToWorkspace}
                disabled={!targetWorkspaceId}
                className="bg-surface border border-border text-text hover:bg-border px-3 py-2 rounded transition text-sm disabled:opacity-50"
              >
                Copy
              </button>
            </div>
          )}

          <button
            onClick={handleExport}
            className="border border-border hover:bg-surface text-text-muted hover:text-text px-3 py-2 rounded transition text-sm flex items-center gap-1.5"
            title="Export Environment JSON"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={handleSave}
            className="bg-primary text-white px-4 py-2 rounded hover:bg-orange-600 transition text-sm font-medium"
          >
            Save
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto border border-border rounded">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-surface border-b border-border sticky top-0 z-10">
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
                    <input type="checkbox" checked={v.enabled} onChange={e => handleUpdateVar(i, 'enabled', e.target.checked)} />
                  </td>
                  <td className="p-0 border-l border-border relative">
                    <input type="text" value={v.key} onChange={e => handleUpdateVar(i, 'key', e.target.value)} className="w-full p-2 bg-transparent outline-none font-mono focus:bg-surface" placeholder="New key" />
                  </td>
                  <td className="p-1 border-l border-border text-center">
                    <button
                      type="button"
                      onClick={() => handleUpdateVar(i, 'isSecret', !v.isSecret)}
                      className={`px-2 py-0.5 text-xs rounded border flex items-center justify-center gap-1 w-full ${v.isSecret ? 'border-amber-500/40 text-amber-400 bg-amber-500/10' : 'border-border text-text-muted hover:bg-surface'}`}
                      title={v.isSecret ? 'Secret (Masked)' : 'Default (Plain text)'}
                    >
                      {v.isSecret ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3 text-text-muted" />}
                      {v.isSecret ? 'secret' : 'default'}
                    </button>
                  </td>
                  <td className="p-0 border-l border-border relative">
                    <input
                      type={v.isSecret && !isRevealed ? 'password' : 'text'}
                      value={v.initialValue}
                      onChange={e => handleUpdateVar(i, 'initialValue', e.target.value)}
                      className="w-full p-2 bg-transparent outline-none font-mono focus:bg-surface"
                      placeholder="Initial value"
                    />
                  </td>
                  <td className="p-0 border-l border-border relative">
                    <input
                      type={v.isSecret && !isRevealed ? 'password' : 'text'}
                      value={v.currentValue}
                      onChange={e => handleUpdateVar(i, 'currentValue', e.target.value)}
                      className="w-full p-2 bg-transparent outline-none font-mono focus:bg-surface"
                      placeholder="Current value"
                    />
                  </td>
                  <td className="p-2 text-center flex items-center justify-center gap-1">
                    {v.isSecret && (
                      <button
                        type="button"
                        onClick={() => toggleRevealSecret(i)}
                        className="text-text-muted hover:text-text p-0.5"
                        title={isRevealed ? 'Hide value' : 'Show value'}
                      >
                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <button onClick={() => handleRemoveVar(i)} className="text-text-muted hover:text-red-500 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr className="hover:bg-surface cursor-pointer" onClick={handleAddVar}>
              <td className="p-2"></td>
              <td className="p-2 border-l border-border text-text-muted" colSpan={5}>+ Add a new variable</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
