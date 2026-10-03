import React, { useState, useEffect } from 'react';
import { X, Folder as FolderIcon, FolderPlus, Plus } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import { useCollectionStore } from '../../store/collectionStore';
import { useRequestStore } from '../../store/requestStore';

export const SaveRequestModal = ({ onClose }: { onClose: () => void }) => {
  const { collections, foldersByCollection, openCollection, loadCollectionChildren, loadFolderChildren, createCollection, createFolder, applyRequestUpserted } = useCollectionStore();
  const { activeWorkspace } = useAuthStore();
  const [creating, setCreating] = useState<null | 'collection' | 'folder'>(null);
  const [newName, setNewName] = useState('');
  const { activeRequest, setActiveRequest, markSaved } = useRequestStore();

  const [name, setName] = useState(activeRequest?.name || 'New Request');
  const [selectedLocation, setSelectedLocation] = useState<{ type: 'collection' | 'folder', id: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Select first collection by default if available
    if (collections.length > 0 && !selectedLocation) {
      setSelectedLocation({ type: 'collection', id: collections[0]._id });
    }
  }, [collections]);

  useEffect(() => {
    collections.forEach(c => { loadCollectionChildren(c._id); });
  }, [collections]);

  const findCollectionOfFolder = (folderId: string) => {
    for (const fols of Object.values(foldersByCollection)) {
      if (Array.isArray(fols)) {
        const found = fols.find(f => f._id === folderId);
        if (found) return found.collectionId;
      }
    }
    return '';
  };

  const handleCreate = async () => {
    const n = newName.trim();
    if (!n || !creating) return;
    try {
      if (creating === 'collection') {
        if (!activeWorkspace) { useToastStore.getState().addToast('error', 'No workspace selected'); return; }
        const col = await createCollection(activeWorkspace._id, n);
        setSelectedLocation({ type: 'collection', id: col._id });
      } else if (selectedLocation) {
        const colId = selectedLocation.type === 'collection' ? selectedLocation.id : findCollectionOfFolder(selectedLocation.id);
        const parent = selectedLocation.type === 'folder' ? selectedLocation.id : undefined;
        const folder = await createFolder(colId, n, parent);
        setSelectedLocation({ type: 'folder', id: folder._id });
      }
      setCreating(null);
      setNewName('');
    } catch (err) {
      console.error(err);
      useToastStore.getState().addToast('error', 'Failed to create ' + creating);
    }
  };

  // Recursively build tree for rendering
  const renderTree = (collectionId: string, parentFolderId: string | null = null, depth = 0) => {
    const folders = foldersByCollection[parentFolderId || collectionId];
    const currentFolders = Array.isArray(folders) ? folders : [];

    return currentFolders.map(folder => (
      <React.Fragment key={folder._id}>
        <div 
          className={`flex items-center px-2 py-1.5 cursor-pointer text-sm ${selectedLocation?.type === 'folder' && selectedLocation.id === folder._id ? 'bg-primary/20 text-primary' : 'text-gray-300 hover:bg-gray-800'}`}
          style={{ paddingLeft: `${(depth + 1) * 1.5}rem` }}
          onClick={() => { setSelectedLocation({ type: 'folder', id: folder._id }); if (folder.collectionId) loadFolderChildren(folder.collectionId, folder._id); }}
        >
          <FolderIcon size={14} className="mr-2" />
          {folder.name}
        </div>
        {renderTree(collectionId, folder._id, depth + 1)}
      </React.Fragment>
    ));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !selectedLocation || !activeRequest) return;
    
    setLoading(true);
    try {
      let collectionId = '';
      let folderId: string | undefined = undefined;

      if (selectedLocation.type === 'collection') {
        collectionId = selectedLocation.id;
      } else {
        folderId = selectedLocation.id;
        collectionId = findCollectionOfFolder(folderId);
      }
      
      const { default: api } = await import('../../api/axios');
      
      // Build a clean payload (not spreading activeRequest directly to avoid TS issues with delete)
      const payload: Record<string, any> = {
        name,
        method: activeRequest.method || 'GET',
        url: activeRequest.url || '',
        params: activeRequest.params || [],
        headers: activeRequest.headers || [],
        auth: activeRequest.auth || { type: 'none' },
        body: activeRequest.body || { mode: 'none' },
        folderId: folderId || null
      };

      const res = await api.post(`/collections/${collectionId}/requests`, payload);
      const savedRequest = res.data;
      
      // Update active request with the saved version. Keeping the original
      // tabId is what makes this an in-place update — setActiveRequest falls
      // back to matching by _id when tabId is missing, and this request had
      // no _id yet (it was unsaved), so omitting it opened a second,
      // duplicate tab and left the original tab behind still marked dirty.
      setActiveRequest({
        tabId: activeRequest.tabId,
        _id: savedRequest._id,
        collectionId: savedRequest.collectionId,
        folderId: savedRequest.folderId || null,
        name: savedRequest.name,
        method: savedRequest.method || 'GET',
        url: activeRequest.url || '',
        params: activeRequest.params || [],
        headers: activeRequest.headers || [],
        auth: activeRequest.auth || { type: 'none' },
        body: activeRequest.body || { mode: 'none' },
        preRequestScript: activeRequest.preRequestScript,
        testScript: activeRequest.testScript,
        updatedAt: savedRequest.updatedAt,
      });
      
      applyRequestUpserted(savedRequest);
      openCollection(collectionId);

      // The server's own 'request:created' broadcast (sent to every socket in
      // the workspace, including this one) lands in requestsByFolder via
      // applyRequestUpserted — no need to duplicate that here.
      markSaved();
      onClose();
    } catch (err) {
      console.error('Failed to save request', err);
      useToastStore.getState().addToast('error', 'Failed to save request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="bg-surface border border-border rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col h-[500px]">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text">Save Request</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-4 border-b border-border">
            <label className="block text-sm font-medium text-gray-400 mb-1">Request Name</label>
            <input
              type="text"
              data-testid="save-req-name-input"
              className="w-full p-2 border border-border rounded bg-transparent text-text focus:border-primary outline-none"
              placeholder="Request Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          
          <div className="p-4 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-400">Save to...</label>
              <div className="flex gap-1">
                <button type="button" data-testid="save-req-new-collection" onClick={() => { setCreating('collection'); setNewName(''); }} className="flex items-center gap-1 px-2 py-1 text-xs border border-border rounded text-text hover:bg-border"><Plus size={12} /> New Collection</button>
                <button type="button" data-testid="save-req-new-folder" disabled={!selectedLocation} onClick={() => { setCreating('folder'); setNewName(''); }} className="flex items-center gap-1 px-2 py-1 text-xs border border-border rounded text-text hover:bg-border disabled:opacity-50"><FolderPlus size={12} /> New Folder</button>
              </div>
            </div>
            {creating && (
              <div className="flex gap-2 mb-2">
                <input
                  autoFocus
                  data-testid="save-req-new-name"
                  className="flex-1 p-1.5 border border-border rounded bg-transparent text-text text-sm outline-none focus:border-primary"
                  placeholder={creating === 'collection' ? 'Collection name' : 'Folder name'}
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } else if (e.key === 'Escape') { e.preventDefault(); setCreating(null); } }}
                />
                <button type="button" onClick={handleCreate} className="px-3 py-1 bg-primary text-white rounded text-sm">Create</button>
                <button type="button" onClick={() => setCreating(null)} className="px-3 py-1 border border-border rounded text-sm text-text">Cancel</button>
              </div>
            )}
            <div className="border border-border rounded-md overflow-hidden">
              {collections.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">No collections found.</div>
              ) : (
                collections.map(collection => (
                  <div key={collection._id} className="border-b border-border last:border-b-0">
                    <div 
                      className={`flex items-center px-2 py-2 cursor-pointer text-sm font-medium ${selectedLocation?.type === 'collection' && selectedLocation.id === collection._id ? 'bg-primary/20 text-primary' : 'text-gray-200 hover:bg-gray-800'}`}
                      onClick={() => setSelectedLocation({ type: 'collection', id: collection._id })}
                    >
                      <FolderIcon size={14} className="mr-2" />
                      {collection.name}
                    </div>
                    {renderTree(collection._id)}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="p-4 border-t border-border flex justify-end gap-2 bg-gray-900/50">
            <button 
              type="button"
              onClick={onClose} 
              className="px-4 py-2 border border-border rounded hover:bg-border text-sm text-text transition"
            >
              Cancel
            </button>
            <button 
              type="submit"
              data-testid="save-req-submit-btn"
              disabled={!name.trim() || !selectedLocation || loading}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-orange-600 disabled:opacity-50 text-sm transition"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
