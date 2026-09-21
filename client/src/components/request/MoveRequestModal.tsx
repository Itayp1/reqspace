import React, { useState } from 'react';
import { X, Folder as FolderIcon, ChevronRight, ChevronDown } from 'lucide-react';
import { useCollectionStore } from '../../store/collectionStore';
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
  const { folders } = useCollectionStore();
  const childFolders = folders.filter(f => f.parentFolderId === folder._id);

  const isSelected = selectedId === folder._id && selectedType === 'folder';

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer text-sm ${isSelected ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-300'}`}
        onClick={() => onSelect(folder._id, 'folder')}
      >
        <span
          className="text-gray-500 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        >
          {childFolders.length > 0 ? (isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span className="w-3 inline-block" />}
        </span>
        <FolderIcon size={13} />
        <span className="truncate">{folder.name}</span>
      </div>
      {isOpen && childFolders.length > 0 && (
        <div className="ml-4 border-l border-gray-800 pl-2">
          {childFolders.map(f => (
            <FolderTreeNode key={f._id} folder={f} collectionId={collectionId} selectedId={selectedId} selectedType={selectedType} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
};

export const MoveRequestModal: React.FC<MoveRequestModalProps> = ({ requestId, requestName, onClose }) => {
  const { collections, folders, moveRequest, toggleCollectionOpen } = useCollectionStore();
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-gray-100">Move "{requestName}"</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={16} /></button>
        </div>

        <div className="p-3 flex-1 overflow-y-auto space-y-1">
          {collections.map(col => {
            const isOpen = openCollIds.has(col._id);
            const isSelected = selectedId === col._id && selectedType === 'collection';
            const childFolders = folders.filter(f => f.collectionId === col._id && !f.parentFolderId);
            return (
              <div key={col._id}>
                <div
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer text-sm ${isSelected ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-200'}`}
                  onClick={() => handleSelect(col._id, 'collection')}
                >
                  <span onClick={e => { e.stopPropagation(); toggleColl(col._id); }} className="text-gray-400">
                    {childFolders.length > 0 ? (isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span className="w-3 inline-block" />}
                  </span>
                  <FolderIcon size={13} />
                  <span className="truncate font-medium">{col.name}</span>
                </div>
                {isOpen && (
                  <div className="ml-4 border-l border-gray-800 pl-2">
                    {childFolders.map(f => (
                      <FolderTreeNode key={f._id} folder={f} collectionId={col._id} selectedId={selectedId} selectedType={selectedType} onSelect={handleSelect} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-3 border-t border-gray-700 flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded border border-gray-700 text-gray-300 hover:bg-gray-800">Cancel</button>
          <button
            onClick={handleMove}
            disabled={!selectedId || loading}
            className="px-4 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50"
          >
            {loading ? 'Moving...' : 'Move Here'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MoveRequestModal;
