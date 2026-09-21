import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useCollectionStore } from '../../store/collectionStore';
import api from '../../api/axios';

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
        // To duplicate a request to another collection, we can just fetch it and post it
        const { data: sourceReq } = await api.get(`/requests/${sourceId}`);
        await api.post(`/collections/${selectedCollectionId}/requests`, {
          ...sourceReq,
          _id: undefined,
          collectionId: selectedCollectionId,
          folderId: null, // Copy to root of target collection
          name: `${sourceReq.name} (Copy)`
        });
        
        // If we copied to the currently active workspace, we should refresh the collections
        if (selectedWorkspaceId === activeWorkspace?._id) {
          useCollectionStore.getState().fetchCollectionsData(selectedWorkspaceId);
        }
      }
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to copy item');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
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
