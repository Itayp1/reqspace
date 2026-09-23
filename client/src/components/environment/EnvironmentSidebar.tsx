
import { useState } from 'react';
import { useEnvironmentStore } from '../../store/environmentStore';
import { useRequestStore } from '../../store/requestStore';
import { Plus, MoreVertical } from 'lucide-react';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { useContextMenu } from '../common/ContextMenuProvider';
import { CopyToWorkspaceModal } from '../collection/CopyToWorkspaceModal';

export default function EnvironmentSidebar() {
  const { environments, globalEnvironment, setEnvironments } = useEnvironmentStore();
  const { openEnvironmentTab, closeEnvironmentTab } = useRequestStore();
  const { activeWorkspace } = useAuthStore();
  const { showContextMenu } = useContextMenu();
  const [copyEnv, setCopyEnv] = useState<{ id: string, name: string } | null>(null);

  const handleCreateEnv = async () => {
    const envName = prompt('Enter environment name:', 'New Environment');
    if (!envName) return;
    
    try {
      const res = await api.post(`/workspaces/${activeWorkspace?._id}/environments`, {
        name: envName,
        variables: [],
      });
      setEnvironments([...environments, res.data]);
      openEnvironmentTab(res.data._id, res.data.name);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDuplicate = async (env: any) => {
    try {
      const res = await api.post(`/environments/${env._id}/duplicate`);
      setEnvironments([...environments, res.data]);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete environment?')) return;
    try {
      await api.delete(`/environments/${id}`);
      setEnvironments(environments.filter(e => e._id !== id));
      closeEnvironmentTab(id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRename = async (env: any) => {
    const newName = prompt('Enter new environment name:', env.name);
    if (!newName || newName === env.name) return;
    try {
      const res = await api.put(`/environments/${env._id}`, { name: newName, variables: env.variables });
      setEnvironments(environments.map(e => e._id === env._id ? res.data : e));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface">
      <div className="p-2 flex justify-between items-center border-b border-border">
        <span className="text-xs font-semibold text-text-muted uppercase">Environments</span>
        <button
          className="p-1 hover:bg-border rounded text-text-muted hover:text-text transition-colors"
          onClick={handleCreateEnv}
          title="New Environment"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {globalEnvironment && (
          <div
            className="p-2 text-sm rounded cursor-pointer hover:bg-border transition flex items-center"
            onClick={() => openEnvironmentTab('global', 'Globals (Common)')}
          >
            <span className="truncate flex-1 font-medium text-orange-500">Globals (Common)</span>
          </div>
        )}
        
          {environments.map(env => {
            const menuOptions = [
              { label: 'Rename', onClick: () => handleRename(env) },
              { label: 'Duplicate', onClick: () => handleDuplicate(env) },
              { label: 'Copy to Workspace', onClick: () => setCopyEnv({ id: env._id, name: env.name }) },
              { label: 'Delete', onClick: () => handleDelete(env._id), danger: true },
            ];
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
                <span className="truncate flex-1">{env.name}</span>
                <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                  <button
                    className="p-1 text-text-muted hover:text-text rounded-md"
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
