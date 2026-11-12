import { useEffect, useRef, useState } from 'react';
import { useEnvironmentStore } from '../../store/environmentStore';
import type { EnvironmentVariable } from '../../store/environmentStore';
import { Save, Plus, Trash2, Eye, EyeOff, Lock, Unlock, Download } from 'lucide-react';
import api from '../../api/axios';
import { v4 as uuidv4 } from 'uuid';
import { useToastStore } from '../../store/toastStore';

// Shared variable table component for the profile variables
function VariableTable({
  vars,
  onUpdate,
  onAdd,
  onRemove,
  showSecret,
  onToggleSecret,
}: {
  vars: (EnvironmentVariable & { id: string })[];
  onUpdate: (id: string, field: keyof EnvironmentVariable, val: any) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  showSecret: Record<string, boolean>;
  onToggleSecret: (id: string) => void;
}) {
  const tableRef = useRef<HTMLDivElement>(null);
  const focusNew = useRef(false);
  // Move focus into the key input of a row that was just added.
  useEffect(() => {
    if (!focusNew.current) return;
    focusNew.current = false;
    const keys = tableRef.current?.querySelectorAll<HTMLInputElement>('input[placeholder="New variable"]');
    keys?.[keys.length - 1]?.focus();
  }, [vars.length]);

  return (
    <div ref={tableRef} className="flex-1 overflow-y-auto border border-border rounded">
      <table className="w-full text-left border-collapse text-sm">
        <thead>
          <tr className="bg-surface border-b border-border sticky top-0 z-10 text-xs font-semibold uppercase text-text-muted">
            <th className="p-2 w-8"></th>
            <th className="p-2 border-l border-border">VARIABLE</th>
            <th className="p-2 border-l border-border w-24">TYPE</th>
            <th className="p-2 border-l border-border">VALUE</th>
            <th className="p-2 w-16"></th>
          </tr>
        </thead>
        <tbody>
          {vars.map((v) => (
            <tr key={v.id} className="border-b border-border hover:bg-surface group">
              <td className="p-2 text-center">
                <input
                  type="checkbox"
                  aria-label={`Enable ${v.key || 'variable'}`}
                  checked={v.enabled}
                  onChange={(e) => onUpdate(v.id, 'enabled', e.target.checked)}
                />
              </td>
              <td className="p-0 border-l border-border">
                <input
                  className="w-full p-2 bg-transparent font-mono focus:bg-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
                  value={v.key}
                  placeholder="New variable"
                  aria-label="Variable name"
                  onChange={(e) => onUpdate(v.id, 'key', e.target.value)}
                />
              </td>
              <td className="p-1 border-l border-border text-center">
                <button
                  type="button"
                  onClick={() => onUpdate(v.id, 'type', v.type === 'secret' ? 'default' : 'secret')}
                  className={`px-2 py-0.5 text-xs rounded border flex items-center justify-center gap-1 w-full ${v.type === 'secret' ? 'border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10' : 'border-border text-text-muted hover:bg-surface'}`}
                  title={v.type === 'secret' ? 'Secret (Masked)' : 'Default (Plain text)'}
                >
                  {v.type === 'secret' ? <Lock className="w-3 h-3" aria-hidden="true" /> : <Unlock className="w-3 h-3" aria-hidden="true" />}
                  {v.type === 'secret' ? 'secret' : 'default'}
                </button>
              </td>
              <td className="p-0 border-l border-border">
                <input
                  className="w-full p-2 bg-transparent font-mono focus:bg-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
                  value={v.value || ''}
                  type={v.type === 'secret' && !showSecret[v.id] ? 'password' : 'text'}
                  placeholder="Value"
                  aria-label="Value"
                  onChange={(e) => onUpdate(v.id, 'value', e.target.value)}
                />
              </td>
              <td className="p-2">
                <div className="flex items-center justify-center gap-1">
                  {v.type === 'secret' && (
                    <button
                      type="button"
                      className="text-text-muted hover:text-text p-0.5"
                      onClick={() => onToggleSecret(v.id)}
                      title={showSecret[v.id] ? 'Hide value' : 'Show value'}
                      aria-label={showSecret[v.id] ? 'Hide value' : 'Show value'}
                    >
                      {showSecret[v.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-text-muted hover:text-red-500 p-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                    onClick={() => onRemove(v.id)}
                    title="Remove variable"
                    aria-label="Remove variable"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {vars.length === 0 && (
            <tr>
              <td colSpan={5} className="p-4 text-center text-text-muted">
                No variables yet. Add one, then use it in requests as <code className="font-mono">{'{{name}}'}</code>.
              </td>
            </tr>
          )}
          <tr className="hover:bg-surface">
            <td className="p-2"></td>
            <td className="p-2 border-l border-border" colSpan={4}>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
                onClick={() => { focusNew.current = true; onAdd(); }}
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Add Variable
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function ProfileVariablesEditor() {
  const { userProfileVariables, setUserProfileVariables } = useEnvironmentStore();

  const [vars, setVars] = useState<(EnvironmentVariable & { id: string })[]>(
    userProfileVariables.map(v => ({ ...v, id: uuidv4() }))
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});

  // The initialiser above only runs on mount, but the list is fetched
  // asynchronously (TopBar kicks that off), so opening this tab before the
  // fetch lands — or straight after a reload — used to leave the table empty.
  // Resync whenever the store's array identity changes: that happens on
  // fetch and after a save, and not while editing.
  useEffect(() => {
    setVars(userProfileVariables.map(v => ({ ...v, id: uuidv4() })));
    setDirty(false);
  }, [userProfileVariables]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = vars.filter(v => v.key.trim() !== '').map(({ id, ...rest }) => rest);
      const res = await api.put('/user-profile-variables', { variables: payload });
      setUserProfileVariables(res.data.variables || []);
      setVars((res.data.variables || []).map((v: any) => ({ ...v, id: uuidv4() })));
      setDirty(false);
      useToastStore.getState().addToast('success', 'Profile variables saved');
    } catch (e: any) {
      useToastStore.getState().addToast('error', e?.response?.data?.message || 'Failed to save profile variables');
    } finally {
      setSaving(false);
    }
  };

  const updateVar = (id: string, field: keyof EnvironmentVariable, val: any) => {
    setDirty(true);
    setVars(prev => prev.map(v => v.id === id ? { ...v, [field]: val } : v));
  };

  const addVar = () => {
    setDirty(true);
    setVars(prev => [...prev, { id: uuidv4(), key: '', value: '', enabled: true, type: 'default' }]);
  };

  const removeVar = (id: string) => {
    setDirty(true);
    setVars(prev => prev.filter(v => v.id !== id));
  };

  // Same Postman-compatible file as the environment editor's Export.
  const handleExport = () => {
    const exportable = {
      name: 'Profile Variables',
      values: vars.filter(v => v.key).map(v => ({
        key: v.key,
        value: v.value || '',
        type: v.type === 'secret' ? 'secret' : 'default',
        enabled: v.enabled !== false,
      })),
      _postman_variable_scope: 'environment',
      _reqSpace_variable_scope: 'environment',
    };
    const a = document.createElement('a');
    a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportable, null, 2));
    a.download = `${exportable.name}.reqspace_environment.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const toggleSecret = (id: string) =>
    setShowSecret(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background p-4" data-testid="profile-variables-editor">
      {/* Header: same layout as the environment editor (title left; Export and Save right) */}
      <div className="flex justify-between items-center gap-4 mb-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold">Profile Variables</h2>
          <p className="text-sm text-text-muted">
            Available across <strong>all workspaces</strong>. Use for personal values like phone, email, or API keys.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="env-export-btn"
            onClick={handleExport}
            className="border border-border hover:bg-surface text-text-muted hover:text-text px-3 py-1.5 rounded transition text-sm flex items-center gap-1.5"
            title="Export Variables JSON"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Export
          </button>
          <button
            data-testid="env-save-btn"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-2 bg-primary-strong text-white px-3 py-1.5 rounded hover:bg-primary/90 transition text-sm font-medium disabled:opacity-50"
          >
            <Save className="w-4 h-4" aria-hidden="true" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <VariableTable
        vars={vars}
        onUpdate={updateVar}
        onAdd={addVar}
        onRemove={removeVar}
        showSecret={showSecret}
        onToggleSecret={toggleSecret}
      />
    </div>
  );
}
