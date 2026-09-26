import { useState } from 'react';
import { useEnvironmentStore } from '../../store/environmentStore';
import type { EnvironmentVariable } from '../../store/environmentStore';
import { useAuthStore } from '../../store/authStore';
import { Save, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import api from '../../api/axios';
import { v4 as uuidv4 } from 'uuid';

type Tab = 'local' | 'profile';

// Shared variable table component used by both Local and Profile tabs
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
  return (
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
                  onChange={(e) => onUpdate(v.id, 'enabled', e.target.checked)}
                  className="rounded border-border bg-surface text-primary focus:ring-primary focus:ring-offset-surface"
                />
              </td>
              <td className="p-2">
                <input
                  className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded outline-none"
                  value={v.key}
                  placeholder="New variable"
                  onChange={(e) => onUpdate(v.id, 'key', e.target.value)}
                />
              </td>
              <td className="p-2">
                <select
                  className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded outline-none"
                  value={v.type || 'default'}
                  onChange={(e) => onUpdate(v.id, 'type', e.target.value)}
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
                    onChange={(e) => onUpdate(v.id, 'value', e.target.value)}
                  />
                  {v.type === 'secret' && (
                    <button
                      className="text-text-muted hover:text-text p-1 absolute right-2"
                      onClick={() => onToggleSecret(v.id)}
                    >
                      {showSecret[v.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </td>
              <td className="p-2">
                <button
                  className="text-text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => onRemove(v.id)}
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
                onClick={onAdd}
              >
                <Plus className="w-4 h-4" />
                Add Variable
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function LocalVariablesEditor() {
  const { localVariables, setLocalVariables, userProfileVariables, setUserProfileVariables } = useEnvironmentStore();
  const { activeWorkspace } = useAuthStore();

  const [activeTab, setActiveTab] = useState<Tab>('local');

  // Local variables state
  const [localVars, setLocalVars] = useState<(EnvironmentVariable & { id: string })[]>(
    localVariables.map(v => ({ ...v, id: uuidv4() }))
  );
  const [localSaving, setLocalSaving] = useState(false);

  // Profile variables state
  const [profileVars, setProfileVars] = useState<(EnvironmentVariable & { id: string })[]>(
    userProfileVariables.map(v => ({ ...v, id: uuidv4() }))
  );
  const [profileSaving, setProfileSaving] = useState(false);

  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});

  // ── Local handlers ──────────────────────────────────────────────────────────

  const handleLocalSave = async () => {
    if (!activeWorkspace) return;
    setLocalSaving(true);
    try {
      const payload = localVars.filter(v => v.key.trim() !== '').map(({ id, ...rest }) => rest);
      const res = await api.put(`/local-variables/${activeWorkspace._id}`, { variables: payload });
      setLocalVariables(res.data.variables || []);
      setLocalVars((res.data.variables || []).map((v: any) => ({ ...v, id: uuidv4() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLocalSaving(false);
    }
  };

  // ── Profile handlers ────────────────────────────────────────────────────────

  const handleProfileSave = async () => {
    setProfileSaving(true);
    try {
      const payload = profileVars.filter(v => v.key.trim() !== '').map(({ id, ...rest }) => rest);
      const res = await api.put('/user-profile-variables', { variables: payload });
      setUserProfileVariables(res.data.variables || []);
      setProfileVars((res.data.variables || []).map((v: any) => ({ ...v, id: uuidv4() })));
    } catch (e) {
      console.error(e);
    } finally {
      setProfileSaving(false);
    }
  };

  // ── Generic helpers ─────────────────────────────────────────────────────────

  const updateVar = (
    setter: React.Dispatch<React.SetStateAction<(EnvironmentVariable & { id: string })[]>>,
    id: string,
    field: keyof EnvironmentVariable,
    val: any
  ) => setter(prev => prev.map(v => v.id === id ? { ...v, [field]: val } : v));

  const addVar = (setter: React.Dispatch<React.SetStateAction<(EnvironmentVariable & { id: string })[]>>) =>
    setter(prev => [...prev, { id: uuidv4(), key: '', value: '', enabled: true, type: 'default' }]);

  const removeVar = (setter: React.Dispatch<React.SetStateAction<(EnvironmentVariable & { id: string })[]>>, id: string) =>
    setter(prev => prev.filter(v => v.id !== id));

  const toggleSecret = (id: string) =>
    setShowSecret(prev => ({ ...prev, [id]: !prev[id] }));

  // ── Render ──────────────────────────────────────────────────────────────────

  const isLocal = activeTab === 'local';
  const vars = isLocal ? localVars : profileVars;
  const varSetter = isLocal ? setLocalVars : setProfileVars;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface p-4" data-testid="local-variables-editor">
      {/* Tab bar */}
      <div className="flex gap-0 mb-4 border-b border-border">
        <button
          onClick={() => setActiveTab('local')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'local'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-text'
          }`}
        >
          Local Variables
        </button>
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'profile'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-text'
          }`}
        >
          👤 Profile Variables
        </button>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <div>
          {isLocal ? (
            <p className="text-sm text-text-muted">
              Specific to you in this workspace. Not synced to other users.
            </p>
          ) : (
            <p className="text-sm text-text-muted">
              Available across <strong>all workspaces</strong>. Use for personal values like phone, email, or API keys.
            </p>
          )}
        </div>
        <button
          onClick={isLocal ? handleLocalSave : handleProfileSave}
          disabled={isLocal ? localSaving : profileSaving}
          className="flex items-center gap-2 bg-primary text-primary-content px-3 py-1.5 rounded text-sm hover:bg-primary/90 disabled:opacity-50 shrink-0 ml-4"
        >
          <Save className="w-4 h-4" />
          {(isLocal ? localSaving : profileSaving) ? 'Saving...' : 'Save'}
        </button>
      </div>

      <VariableTable
        vars={vars}
        onUpdate={(id, field, val) => updateVar(varSetter, id, field, val)}
        onAdd={() => addVar(varSetter)}
        onRemove={(id) => removeVar(varSetter, id)}
        showSecret={showSecret}
        onToggleSecret={toggleSecret}
      />
    </div>
  );
}
