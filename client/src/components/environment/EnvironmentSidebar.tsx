
import { useState } from 'react';
import { useEnvironmentStore } from '../../store/environmentStore';
import { useRequestStore } from '../../store/requestStore';
import { Plus, MoreVertical, Globe, Braces, Layers } from 'lucide-react';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { useContextMenu } from '../common/ContextMenuProvider';
import { InlineNameInput } from '../common/InlineNameInput';
import { CopyToWorkspaceModal } from '../collection/CopyToWorkspaceModal';

export default function EnvironmentSidebar() {
  const { environments } = useEnvironmentStore();
  // Apply results to the *current* list: the closure's `environments` is from before the awaited prompt/confirm/request, so writing it back dropped envs added meanwhile (QA-73).
  const { applyEnvironmentUpserted, applyEnvironmentDeleted } = useEnvironmentStore.getState();
  const { openEnvironmentTab, closeEnvironmentTab } = useRequestStore();
  const { activeWorkspace } = useAuthStore();
  const { showContextMenu } = useContextMenu();
  const [copyEnv, setCopyEnv] = useState<{ id: string, name: string } | null>(null);

  const [creating, setCreating] = useState(false);

  const handleCreateEnv = async (envName: string) => {
    try {
      const res = await api.post(`/workspaces/${activeWorkspace?._id}/environments`, {
        name: envName,
        variables: [],
      });
      applyEnvironmentUpserted(res.data);
      openEnvironmentTab(res.data._id, res.data.name);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDuplicate = async (env: any) => {
    try {
      const res = await api.post(`/environments/${env._id}/duplicate`);
      applyEnvironmentUpserted(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    const { customConfirm } = await import('../../utils/dialog');
    if (!(await customConfirm('Confirm Deletion', 'Delete environment?', 'Delete'))) return;
    try {
      await api.delete(`/environments/${id}`);
      applyEnvironmentDeleted(id);
      closeEnvironmentTab(id);
    } catch (e) {
      console.error(e);
    }
  };

  const [renamingId, setRenamingId] = useState<string | null>(null);

  const handleRename = async (env: any, newName: string) => {
    setRenamingId(null);
    if (newName === env.name) return;
    try {
      const res = await api.put(`/environments/${env._id}`, { name: newName, variables: env.variables });
      applyEnvironmentUpserted(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface">
      <div className="p-2 flex justify-between items-center border-b border-border">
        <span className="text-xs font-semibold text-text-muted uppercase">Environments</span>
        <button
          data-testid="new-env-btn"
          className="p-1 hover:bg-border rounded text-text-muted hover:text-text transition-colors"
          onClick={() => setCreating(true)}
          aria-label="New Environment"
          title="New Environment"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {(
          <div
            data-testid="env-globals-btn"
            className="p-2 text-sm rounded cursor-pointer hover:bg-border transition flex items-center"
            onClick={() => openEnvironmentTab('global', 'Globals (Common)')}
          >
            <Globe size={14} className="mr-2 shrink-0 text-text-muted" aria-hidden="true" />
            <span className="truncate flex-1 font-medium">Globals (Common)</span>
          </div>
        )}
        
        <div
          data-testid="env-profile-variables-btn"
          className="p-2 text-sm rounded cursor-pointer hover:bg-border transition flex items-center"
          onClick={() => openEnvironmentTab('profile-variables', 'Profile Variables')}
        >
          <Braces size={14} className="mr-2 shrink-0 text-text-muted" aria-hidden="true" />
          <span className="truncate flex-1 font-medium">Profile Variables</span>
        </div>
        
          {environments.map(env => {
            const menuOptions = [
              { label: 'Rename', onClick: () => setRenamingId(env._id) },
              { label: 'Duplicate', onClick: () => handleDuplicate(env) },
              { label: 'Copy to Workspace', onClick: () => setCopyEnv({ id: env._id, name: env.name }) },
              { label: 'Delete', onClick: () => handleDelete(env._id), danger: true, separator: true },
            ];
            if (renamingId === env._id) {
              return (
                <div key={env._id} className="p-2 rounded bg-border flex items-center">
                  <InlineNameInput
                    testId="prompt-input"
                    label="Environment name"
                    value={env.name}
                    onCancel={() => setRenamingId(null)}
                    onSave={(name) => void handleRename(env, name)}
                  />
                </div>
              );
            }
            return (
              <div
                key={env._id}
                className="group p-2 text-sm rounded cursor-pointer hover:bg-border transition flex justify-between items-center"
                onClick={() => openEnvironmentTab(env._id, env.name)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  showContextMenu({ x: e.clientX, y: e.clientY, items: menuOptions });
                }}
              >
                <Layers size={14} className="mr-2 shrink-0 text-text-muted" aria-hidden="true" />
                <span data-testid={`env-node-${env.name}`} title={env.name} className="truncate flex-1">{env.name}</span>
                <div className="flex opacity-60 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100 items-center gap-1 shrink-0">
                  <button
                    aria-label={`Actions for ${env.name}`}
                    aria-haspopup="menu"
                    className="p-1 text-text-muted hover:text-text rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      showContextMenu({ x: e.clientX, y: e.clientY, items: menuOptions });
                    }}
                  >
                    <MoreVertical size={16} />
                  </button>
                </div>
              </div>
            );
          })}
          {creating && (
            <div className="p-2 rounded bg-border flex items-center">
              <InlineNameInput
                testId="prompt-input"
                label="Environment name"
                placeholder="Environment name"
                onCancel={() => setCreating(false)}
                onSave={(name) => { setCreating(false); void handleCreateEnv(name); }}
              />
            </div>
          )}
        </div>
        
        {copyEnv && (
          <CopyToWorkspaceModal
            type="environment"
            sourceId={copyEnv.id}
            sourceName={copyEnv.name}
            onClose={() => setCopyEnv(null)}
          />
        )}
      </div>
    );
}
