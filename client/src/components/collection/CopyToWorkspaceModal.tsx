import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useCollectionStore, uniqueName } from '../../store/collectionStore';
import api from '../../api/axios';
import { useToastStore } from '../../store/toastStore';
import { toRequestPayload } from '../../utils/requestPayload';

interface Props {
  type: 'collection' | 'request' | 'environment';
  sourceId: string;
  sourceName: string;
  onClose: () => void;
}

export function CopyToWorkspaceModal({ type, sourceId, sourceName, onClose }: Props) {
  const { workspaces, activeWorkspace } = useAuthStore();
  const { duplicateCollection } = useCollectionStore();
  
  // A viewer cannot write to the active workspace; default to a workspace the user can write to.
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(() => {
    const writable = (w?: { myRole?: string } | null) => !!w && ['editor', 'owner'].includes(w.myRole || '');
    if (writable(activeWorkspace)) return activeWorkspace!._id;
    return (workspaces.find(w => w.isPersonal && writable(w)) || workspaces.find(w => writable(w)) || activeWorkspace)?._id || '';
  });
  const [targetCollections, setTargetCollections] = useState<any[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (type === 'request' && selectedWorkspaceId) {
      api.get(`/workspaces/${selectedWorkspaceId}/collections`)
        .then(res => {
          setTargetCollections(res.data);
          if (res.data.length > 0) {
            setSelectedCollectionId(res.data[0]._id);
          } else {
            setSelectedCollectionId('');
          }
        })
        .catch(() => setError('Failed to load collections'));
    }
  }, [selectedWorkspaceId, type]);

  const handleCopy = async () => {
    setIsLoading(true);
    setError('');
    try {
      if (type === 'collection') {
        await duplicateCollection(sourceId, selectedWorkspaceId);
      } else if (type === 'environment') {
        const { data: copied } = await api.post(`/environments/${sourceId}/duplicate`, { workspaceId: selectedWorkspaceId });
        if (selectedWorkspaceId === activeWorkspace?._id) {
          const { useEnvironmentStore } = await import('../../store/environmentStore');
          useEnvironmentStore.getState().applyEnvironmentUpserted(copied);
        }
        useToastStore.getState().addToast('success', `Copied "${sourceName}"`);
      } else {
        let targetCollectionId = selectedCollectionId;
        if (!targetCollectionId) {
          // The target workspace has no collection yet: create one to hold the copy.
          const { data: created } = await api.post(`/workspaces/${selectedWorkspaceId}/collections`, { name: 'Copied requests' });
          targetCollectionId = created._id;
        }
        // Fetch the source, then post only the fields createRequestSchema
        // accepts. Spreading the whole fetched request sent server-owned
        // fields (id, collectionId, order, comments, createdBy, createdAt,
        // updatedAt) too, and the strict schema rejected the lot with a 400 —
        // so copying a request never actually worked.
        const { data: sourceReq } = await api.get(`/requests/${sourceId}`);
        // Pick a name that is free among the target collection's root requests.
        const { data: existing } = await api.get(`/collections/${targetCollectionId}/requests`, { params: { folderId: 'null' } });
        const taken = Array.isArray(existing) ? existing.map((r: any) => r.name) : [];
        await api.post(`/collections/${targetCollectionId}/requests`, {
          ...toRequestPayload({ ...sourceReq, name: uniqueName(`${sourceReq.name} (Copy)`, taken) }),
          folderId: null, // Copy to root of target collection
        });
        
        // If we copied to the currently active workspace, we should refresh the collections
        if (selectedWorkspaceId === activeWorkspace?._id) {
          useCollectionStore.getState().loadWorkspace(selectedWorkspaceId);
        }
      }
      onClose();
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Failed to copy item';
      setError(message);
      useToastStore.getState().addToast('error', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div data-testid="copy-to-workspace-modal" className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg shadow-xl w-[400px] border border-border flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border bg-gray-50 dark:bg-gray-800">
          <h2 className="text-lg font-bold text-text">Copy {type === 'collection' ? 'Collection' : type === 'environment' ? 'Environment' : 'Request'}</h2>
          <p className="text-xs text-text-muted mt-1 truncate">Copying: {sourceName}</p>
        </div>
        
        <div className="p-4 flex flex-col gap-4 bg-background">
          {error && <div className="text-xs text-red-500 bg-red-100 dark:bg-red-900/30 p-2 rounded">{error}</div>}
          
          <div>
            <label className="block text-sm font-medium mb-1 text-text">Target Workspace</label>
            <select
              data-testid="copy-target-workspace-select"
              value={selectedWorkspaceId}
              onChange={(e) => setSelectedWorkspaceId(e.target.value)}
              className="w-full p-2 text-sm border border-border rounded bg-surface text-text outline-none focus:border-primary"
            >
              {workspaces.map(ws => (
                <option key={ws._id} value={ws._id}>{ws.name}</option>
              ))}
            </select>
          </div>

          {type !== 'environment' && (
            <p data-testid="copy-variables-note" className="text-xs text-text-muted">
              {type === 'collection' ? 'Collection variables are copied. ' : ''}
              Environments and global variables are not copied: define them in the target workspace, or requests that use <code>{'{{variables}}'}</code> may fail there.
            </p>
          )}

          {type === 'request' && (
            <div>
              <label className="block text-sm font-medium mb-1 text-text">Target Collection</label>
              <select
                data-testid="copy-target-collection-select"
                value={selectedCollectionId}
                onChange={(e) => setSelectedCollectionId(e.target.value)}
                className="w-full p-2 text-sm border border-border rounded bg-surface text-text outline-none focus:border-primary"
                disabled={targetCollections.length === 0}
                title={targetCollections.length === 0 ? 'This workspace has no collections; one will be created for the copy' : undefined}
              >
                {targetCollections.length === 0 && <option value="">New collection "Copied requests" will be created</option>}
                {targetCollections.map(c => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border bg-gray-50 dark:bg-gray-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            data-testid="copy-submit-btn"
            onClick={handleCopy}
            className="px-4 py-2 text-sm font-medium bg-primary text-white rounded hover:bg-orange-600 disabled:opacity-50"
            disabled={isLoading || !selectedWorkspaceId}
          >
            {isLoading ? 'Copying...' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
