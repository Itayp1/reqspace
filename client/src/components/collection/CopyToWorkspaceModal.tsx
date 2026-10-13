import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useCollectionStore } from '../../store/collectionStore';
import api from '../../api/axios';
import { useToastStore } from '../../store/toastStore';

interface Props {
  type: 'collection' | 'request' | 'environment';
  sourceId: string;
  sourceName: string;
  onClose: () => void;
}

export function CopyToWorkspaceModal({ type, sourceId, sourceName, onClose }: Props) {
  const { workspaces, activeWorkspace } = useAuthStore();
  const { duplicateCollection } = useCollectionStore();
  
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(activeWorkspace?._id || '');
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
        await api.post(`/environments/${sourceId}/duplicate`, { workspaceId: selectedWorkspaceId });
        // Optional: you can trigger a refresh if the target is the active workspace, but typically it will just appear when they visit it.
        if (selectedWorkspaceId === activeWorkspace?._id) {
          // We would fetch environments here if there was a fetchEnvironments function.
        }
      } else {
        if (!selectedCollectionId) {
          throw new Error('Please select a target collection');
        }
        // Fetch the source, then post only the fields createRequestSchema
        // accepts. Spreading the whole fetched request sent server-owned
        // fields (id, collectionId, order, comments, createdBy, createdAt,
        // updatedAt) too, and the strict schema rejected the lot with a 400 —
        // so copying a request never actually worked.
        const { data: sourceReq } = await api.get(`/requests/${sourceId}`);
        await api.post(`/collections/${selectedCollectionId}/requests`, {
          name: `${sourceReq.name} (Copy)`,
          method: sourceReq.method || 'GET',
          url: sourceReq.url || '',
          params: sourceReq.params || [],
          headers: sourceReq.headers || [],
          auth: sourceReq.auth || { type: 'none' },
          body: sourceReq.body || { mode: 'none' },
          preRequestScript: sourceReq.preRequestScript || '',
          testScript: sourceReq.testScript || '',
          description: sourceReq.description || '',
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
          <h2 className="text-lg font-bold text-text">Copy {type === 'collection' ? 'Collection' : 'Request'}</h2>
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

          {type === 'request' && (
            <div>
              <label className="block text-sm font-medium mb-1 text-text">Target Collection</label>
              <select
                data-testid="copy-target-collection-select"
                value={selectedCollectionId}
                onChange={(e) => setSelectedCollectionId(e.target.value)}
                className="w-full p-2 text-sm border border-border rounded bg-surface text-text outline-none focus:border-primary"
                disabled={targetCollections.length === 0}
              >
                {targetCollections.length === 0 && <option value="">No collections found</option>}
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
            disabled={isLoading || (type === 'request' && !selectedCollectionId)}
          >
            {isLoading ? 'Copying...' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
