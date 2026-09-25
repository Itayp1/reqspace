import { useState } from 'react';
import { useEnvironmentStore } from '../../store/environmentStore';
import type { EnvironmentVariable } from '../../store/environmentStore';
import { useAuthStore } from '../../store/authStore';
import { Save, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import api from '../../api/axios';
import { v4 as uuidv4 } from 'uuid';

export default function LocalVariablesEditor() {
  const { localVariables, setLocalVariables } = useEnvironmentStore();
  const { activeWorkspace } = useAuthStore();
  
  const [vars, setVars] = useState<(EnvironmentVariable & { id: string })[]>(
    localVariables.map(v => ({ ...v, id: uuidv4() }))
  );

  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});

  const handleSave = async () => {
    if (!activeWorkspace) return;
    setSaving(true);
    try {
      const payload = vars.filter(v => v.key.trim() !== '').map(({ id, ...rest }) => rest);
      const res = await api.put(`/local-variables/${activeWorkspace._id}`, { variables: payload });
      setLocalVariables(res.data.variables || []);
      setVars((res.data.variables || []).map((v: any) => ({ ...v, id: uuidv4() })));
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const updateVar = (id: string, field: keyof EnvironmentVariable, val: any) => {
    setVars(vars.map(v => v.id === id ? { ...v, [field]: val } : v));
  };

  const addVar = () => {
    setVars([...vars, { id: uuidv4(), key: '', value: '', enabled: true, type: 'default' }]);
  };

  const removeVar = (id: string) => {
    setVars(vars.filter(v => v.id !== id));
  };

  const toggleSecret = (id: string) => {
    setShowSecret(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface p-4" data-testid="local-variables-editor">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Local Variables</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-primary text-primary-content px-3 py-1.5 rounded text-sm hover:bg-primary/90 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      <p className="text-sm text-text-muted mb-4">
        These variables are specific to you in this workspace. They override environment and collection variables, but are not synced to other users.
      </p>

      <div className="border border-border rounded overflow-hidden flex-1 overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-highlight text-sm border-b border-border">
              <th className="p-2 w-8"></th>
              <th className="p-2 w-1/4">Variable</th>
              <th className="p-2 w-1/4">Type</th>
              <th className="p-2">Value</th>
              <th className="p-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {vars.map((v) => (
              <tr key={v.id} className="border-b border-border text-sm group">
                <td className="p-2 text-center">
                  <input
                    type="checkbox"
                    checked={v.enabled}
                    onChange={(e) => updateVar(v.id, 'enabled', e.target.checked)}
                    className="rounded border-border bg-surface text-primary focus:ring-primary focus:ring-offset-surface"
                  />
                </td>
                <td className="p-2">
                  <input
                    className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded outline-none"
                    value={v.key}
                    placeholder="New variable"
                    onChange={(e) => updateVar(v.id, 'key', e.target.value)}
                  />
                </td>
                <td className="p-2">
                  <select
                    className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded outline-none"
                    value={v.type || 'default'}
                    onChange={(e) => updateVar(v.id, 'type', e.target.value)}
                  >
                    <option value="default">default</option>
                    <option value="secret">secret</option>
                  </select>
                </td>
                <td className="p-2 relative">
                  <div className="flex items-center gap-1">
                    <input
                      className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded outline-none pr-8"
                      value={v.value || ''}
                      type={v.type === 'secret' && !showSecret[v.id] ? 'password' : 'text'}
                      placeholder="Value"
                      onChange={(e) => updateVar(v.id, 'value', e.target.value)}
                    />
                    {v.type === 'secret' && (
                      <button
                        className="text-text-muted hover:text-text p-1 absolute right-2"
                        onClick={() => toggleSecret(v.id)}
                      >
                        {showSecret[v.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </td>
                <td className="p-2">
                  <button
                    className="text-text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeVar(v.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={5} className="p-2">
                <button
                  className="flex items-center gap-1 text-sm text-text-muted hover:text-text transition"
                  onClick={addVar}
                >
                  <Plus className="w-4 h-4" />
                  Add Variable
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
