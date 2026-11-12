import React, { useState, useEffect } from 'react';
import { X, Folder as FolderIcon, ChevronRight, ChevronDown } from 'lucide-react';
import { useCollectionStore, useLoadedTree } from '../../store/collectionStore';
import type { Folder } from '../../store/collectionStore';

interface MoveRequestModalProps {
  requestId: string;
  requestName: string;
  onClose: () => void;
}

const FolderTreeNode = ({
  folder,
  collectionId,
  selectedId,
  selectedType,
  onSelect,
}: {
  folder: Folder;
  collectionId: string;
  selectedId: string;
  selectedType: 'collection' | 'folder';
  onSelect: (id: string, type: 'collection' | 'folder') => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { folders } = useLoadedTree();
  const childFolders = folders.filter(f => f.parentFolderId === folder._id);

  const isSelected = selectedId === folder._id && selectedType === 'folder';

  return (
    <div>
      <div className={`flex items-center gap-1 rounded text-sm ${isSelected ? 'bg-primary text-white' : 'hover:bg-border text-text'}`}>
        {childFolders.length > 0 ? (
          <button type="button" aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${folder.name}`} aria-expanded={isOpen} onClick={() => setIsOpen(!isOpen)} className="pl-2 py-1.5 opacity-70 focus-visible:ring-2 focus-visible:ring-primary rounded">
            {isOpen ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
          </button>
        ) : <span className="w-3 ml-2 inline-block" />}
        <button type="button" aria-pressed={isSelected} onClick={() => onSelect(folder._id, 'folder')} className="flex flex-1 min-w-0 items-center gap-1.5 py-1.5 pr-2 text-left rounded focus-visible:ring-2 focus-visible:ring-primary">
          <FolderIcon size={13} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{folder.name}</span>
        </button>
      </div>
      {isOpen && childFolders.length > 0 && (
        <div className="ml-4 border-l border-border pl-2">
          {childFolders.map(f => (
            <FolderTreeNode key={f._id} folder={f} collectionId={collectionId} selectedId={selectedId} selectedType={selectedType} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
};

export const MoveRequestModal: React.FC<MoveRequestModalProps> = ({ requestId, requestName, onClose }) => {
  const { collections, moveRequest, toggleCollectionOpen, loadCollectionChildren } = useCollectionStore();
  const { folders } = useLoadedTree();

  // Lazy-loaded tree: make sure every collection's folders are available to pick from.
  useEffect(() => { collections.forEach(c => loadCollectionChildren(c._id)); }, [collections, loadCollectionChildren]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedType, setSelectedType] = useState<'collection' | 'folder'>('collection');
  const [openCollIds, setOpenCollIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const handleSelect = (id: string, type: 'collection' | 'folder') => {
    setSelectedId(id);
    setSelectedType(type);
  };

  const toggleColl = (id: string) => {
    setOpenCollIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleMove = async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const newCollectionId = selectedType === 'collection'
        ? selectedId
        : folders.find(f => f._id === selectedId)?.collectionId || '';
      const newFolderId = selectedType === 'folder' ? selectedId : null;
      await moveRequest(requestId, newCollectionId, newFolderId);
      if (newCollectionId) toggleCollectionOpen(newCollectionId);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="move-req-title" className="bg-surface border border-border rounded-lg shadow-xl w-full max-w-sm overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 p-4 border-b border-border">
          <h2 id="move-req-title" className="text-sm font-semibold text-text truncate">Move “{requestName}”</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text rounded focus-visible:ring-2 focus-visible:ring-primary"><X size={16} aria-hidden="true" /></button>
        </div>

        <div className="p-3 flex-1 overflow-y-auto space-y-1">
          {collections.map(col => {
            const isOpen = openCollIds.has(col._id);
            const isSelected = selectedId === col._id && selectedType === 'collection';
            const childFolders = folders.filter(f => f.collectionId === col._id && !f.parentFolderId);
            return (
              <div key={col._id}>
                <div className={`flex items-center gap-1 rounded text-sm ${isSelected ? 'bg-primary text-white' : 'hover:bg-border text-text'}`}>
                  {childFolders.length > 0 ? (
                    <button type="button" aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${col.name}`} aria-expanded={isOpen} onClick={() => toggleColl(col._id)} className="pl-2 py-1.5 opacity-70 focus-visible:ring-2 focus-visible:ring-primary rounded">
                      {isOpen ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
                    </button>
                  ) : <span className="w-3 ml-2 inline-block" />}
                  <button type="button" aria-pressed={isSelected} onClick={() => handleSelect(col._id, 'collection')} className="flex flex-1 min-w-0 items-center gap-1.5 py-1.5 pr-2 text-left rounded focus-visible:ring-2 focus-visible:ring-primary">
                    <FolderIcon size={13} className="shrink-0" aria-hidden="true" />
                    <span className="truncate font-medium">{col.name}</span>
                  </button>
                </div>
                {isOpen && (
                  <div className="ml-4 border-l border-border pl-2">
                    {childFolders.map(f => (
                      <FolderTreeNode key={f._id} folder={f} collectionId={col._id} selectedId={selectedId} selectedType={selectedType} onSelect={handleSelect} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-3 border-t border-border flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded border border-border text-text hover:bg-border">Cancel</button>
          <button
            onClick={handleMove}
            disabled={!selectedId || loading}
            className="px-4 py-1.5 text-sm rounded bg-primary hover:bg-primary/90 text-white font-medium disabled:opacity-50"
          >
            {loading ? 'Moving…' : 'Move Here'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MoveRequestModal;
