import re

with open('c:/projects/reqspace/client/src/components/collection/CollectionExplorer.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

helper = """let draggedItem: { type: 'collection' | 'folder' | 'request', id: string, name: string } | null = null;

const getDropPosition = (e: React.DragEvent, element: HTMLElement, allowedTypes: ('before' | 'after' | 'inside')[]) => {
  if (allowedTypes.length === 1) return allowedTypes[0];
  const rect = element.getBoundingClientRect();
  const y = e.clientY - rect.top;
  
  if (!allowedTypes.includes('inside')) {
    return y < rect.height / 2 ? 'before' : 'after';
  }
  
  if (y < rect.height * 0.25 && allowedTypes.includes('before')) return 'before';
  if (y > rect.height * 0.75 && allowedTypes.includes('after')) return 'after';
  return 'inside';
};

const handleDropAction = async (
  targetType: 'collection' | 'folder' | 'request',
  targetId: string,
  targetCollectionId: string,
  targetParentFolderId: string | null,
  dropPos: 'before' | 'after' | 'inside',
  store: any
) => {
  if (!draggedItem) return;
  const { type: dragType, id: dragId } = draggedItem;
  if (dragId === targetId) return;

  try {
    if (dropPos === 'inside') {
      if (dragType === 'request') {
        const newFolderId = targetType === 'folder' ? targetId : null;
        await store.moveRequest(dragId, targetCollectionId, newFolderId);
      } else if (dragType === 'folder') {
        const newFolderId = targetType === 'folder' ? targetId : null;
        await store.moveFolder(dragId, targetCollectionId, newFolderId);
      }
    } else {
      if (dragType === 'collection' && targetType === 'collection') {
         const cols = [...store.collections].sort((a: any,b: any) => (a.order||0) - (b.order||0));
         const dragObj = cols.find((c: any) => c._id === dragId);
         if (!dragObj) return;
         const filtered = cols.filter((c: any) => c._id !== dragId);
         const tIdx = filtered.findIndex((c: any) => c._id === targetId);
         if (tIdx === -1) return;
         filtered.splice(dropPos === 'before' ? tIdx : tIdx + 1, 0, dragObj);
         await store.reorderItems('collection', filtered.map((c: any, i: number) => ({ id: c._id, order: i })));
      } else if ((dragType === 'request' || dragType === 'folder') && (targetType === 'request' || targetType === 'folder')) {
         if (dragType === 'request') {
           await store.moveRequest(dragId, targetCollectionId, targetParentFolderId);
         } else if (dragType === 'folder') {
           await store.moveFolder(dragId, targetCollectionId, targetParentFolderId);
         }
         
         if (dragType === 'request') {
           const reqs = store.requests.filter((r: any) => r.collectionId === targetCollectionId && r.folderId === targetParentFolderId).sort((a: any,b: any) => (a.order||0) - (b.order||0));
           const dragObj = reqs.find((r: any) => r._id === dragId) || store.requests.find((r: any) => r._id === dragId);
           if (!dragObj) return;
           const filtered = reqs.filter((r: any) => r._id !== dragId);
           if (targetType === 'request') {
             const tIdx = filtered.findIndex((r: any) => r._id === targetId);
             const insertIdx = tIdx === -1 ? filtered.length : (dropPos === 'before' ? tIdx : tIdx + 1);
             filtered.splice(insertIdx, 0, dragObj);
           } else {
             filtered.push(dragObj);
           }
           await store.reorderItems('request', filtered.map((r: any, i: number) => ({ id: r._id, order: i })));
         } else if (dragType === 'folder') {
           const fols = store.folders.filter((f: any) => f.collectionId === targetCollectionId && f.parentFolderId === targetParentFolderId).sort((a: any,b: any) => (a.order||0) - (b.order||0));
           const dragObj = fols.find((f: any) => f._id === dragId) || store.folders.find((f: any) => f._id === dragId);
           if (!dragObj) return;
           const filtered = fols.filter((f: any) => f._id !== dragId);
           if (targetType === 'folder') {
             const tIdx = filtered.findIndex((f: any) => f._id === targetId);
             const insertIdx = tIdx === -1 ? filtered.length : (dropPos === 'before' ? tIdx : tIdx + 1);
             filtered.splice(insertIdx, 0, dragObj);
           } else {
             filtered.push(dragObj);
           }
           await store.reorderItems('folder', filtered.map((f: any, i: number) => ({ id: f._id, order: i })));
         }
      }
    }
  } catch(e) { console.error(e); }
  
  draggedItem = null;
};
"""

content = content.replace('// ── Shared Types ──────────────────────────────────────────────────────────────', helper + '\n// ── Shared Types ──────────────────────────────────────────────────────────────')

# RequestNode
req_search = """const RequestNode = ({
  request,
  onDelete,
  onDuplicate,
  onMove,
}: {
  request: ApiRequest;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onMove: (id: string, name: string) => void;
}) => {
  const navigate = useNavigate();
  const { setActiveRequest, activeRequest } = useRequestStore();
  const { renameRequest } = useCollectionStore();
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { showContextMenu } = useContextMenu();"""

req_replace = """const RequestNode = ({
  request,
  onDelete,
  onDuplicate,
  onMove,
}: {
  request: ApiRequest;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onMove: (id: string, name: string) => void;
}) => {
  const navigate = useNavigate();
  const { setActiveRequest, activeRequest } = useRequestStore();
  const { renameRequest } = useCollectionStore();
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dropPos, setDropPos] = useState<'before' | 'after' | 'inside' | null>(null);
  const { showContextMenu } = useContextMenu();
  const store = useCollectionStore();"""
content = content.replace(req_search, req_replace)

req_div_search = """    <div
      draggable={!isRenaming}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'request', id: request._id, name: request.name }));
        e.dataTransfer.effectAllowed = 'move';
        setIsDragging(true);
      }}
      onDragEnd={() => setIsDragging(false)}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); showContextMenu({ x: e.clientX, y: e.clientY, items: menuOptions }); }}
      className={`flex items-center group px-2 py-1.5 rounded cursor-pointer transition-opacity ${
        isDragging ? 'opacity-30 bg-gray-800' : ''
      } ${isActive ? 'bg-gray-700 text-white' : 'hover:bg-gray-800 text-gray-400'}`}
      onClick={handleClick}
      onDoubleClick={() => setIsRenaming(true)}
    >"""

req_div_replace = """    <div
      draggable={!isRenaming}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'request', id: request._id, name: request.name }));
        e.dataTransfer.effectAllowed = 'move';
        setIsDragging(true);
        draggedItem = { type: 'request', id: request._id, name: request.name };
      }}
      onDragEnd={() => { setIsDragging(false); draggedItem = null; }}
      onDragOver={(e) => {
        e.preventDefault(); e.stopPropagation();
        if (draggedItem?.type === 'collection') { e.dataTransfer.dropEffect = 'none'; return; }
        setDropPos(getDropPosition(e, e.currentTarget as HTMLElement, ['before', 'after']));
      }}
      onDragLeave={() => setDropPos(null)}
      onDrop={async (e) => {
        e.preventDefault(); e.stopPropagation();
        const pos = dropPos; setDropPos(null);
        if (!pos || !draggedItem) return;
        await handleDropAction('request', request._id, request.collectionId, request.folderId, pos, store);
      }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); showContextMenu({ x: e.clientX, y: e.clientY, items: menuOptions }); }}
      className={`flex items-center relative group px-2 py-1.5 rounded cursor-pointer transition-opacity ${
        isDragging ? 'opacity-30 bg-gray-800' : ''
      } ${isActive ? 'bg-gray-700 text-white' : 'hover:bg-gray-800 text-gray-400'}`}
      onClick={handleClick}
      onDoubleClick={() => setIsRenaming(true)}
    >
      {dropPos === 'before' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-10" />}
      {dropPos === 'after' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 z-10" />}"""
content = content.replace(req_div_search, req_div_replace)


# FolderNode
fol_search = """const FolderNode = ({
  folder,
  collectionId,
  onPrompt,
  onDelete,
  onDuplicate,
  onMoveRequest,
}: {
  folder: Folder;
  collectionId: string;
  onPrompt: (config: Omit<PromptConfig, 'isOpen'>) => void;
  onDelete: (type: 'folder', id: string, name: string) => void;
  onDuplicate: (type: 'folder', id: string) => void;
  onMoveRequest: (id: string, name: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { showContextMenu } = useContextMenu();
  const { folders, requests, createFolder, createRequest, renameFolder, duplicateRequest, moveRequest, moveFolder } = useCollectionStore();"""

fol_replace = """const FolderNode = ({
  folder,
  collectionId,
  onPrompt,
  onDelete,
  onDuplicate,
  onMoveRequest,
}: {
  folder: Folder;
  collectionId: string;
  onPrompt: (config: Omit<PromptConfig, 'isOpen'>) => void;
  onDelete: (type: 'folder', id: string, name: string) => void;
  onDuplicate: (type: 'folder', id: string) => void;
  onMoveRequest: (id: string, name: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [dropPos, setDropPos] = useState<'before' | 'after' | 'inside' | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { showContextMenu } = useContextMenu();
  const { folders, requests, createFolder, createRequest, renameFolder, duplicateRequest, moveRequest, moveFolder } = useCollectionStore();
  const store = useCollectionStore();"""
content = content.replace(fol_search, fol_replace)

fol_handlers_search = """  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.type === 'request') {
        await moveRequest(data.id, collectionId, folder._id);
        if (!isOpen) setIsOpen(true);
      } else if (data.type === 'folder' && data.id !== folder._id) {
        await moveFolder(data.id, collectionId, folder._id);
        if (!isOpen) setIsOpen(true);
      }
    } catch (err) {
      console.error('Drop failed', err);
    }
  };"""

fol_handlers_replace = """  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (draggedItem?.type === 'collection') { e.dataTransfer.dropEffect = 'none'; return; }
    setDropPos(getDropPosition(e, e.currentTarget as HTMLElement, ['before', 'after', 'inside']));
  };

  const handleDragLeave = () => setDropPos(null);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const pos = dropPos; setDropPos(null);
    if (!pos || !draggedItem) return;
    await handleDropAction('folder', folder._id, collectionId, folder.parentFolderId, pos, store);
    if (pos === 'inside' && !isOpen) setIsOpen(true);
  };"""
content = content.replace(fol_handlers_search, fol_handlers_replace)

fol_div_search = """      <div
        draggable={!isRenaming}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.setData('application/json', JSON.stringify({ type: 'folder', id: folder._id, name: folder.name }));
          e.dataTransfer.effectAllowed = 'move';
          setIsDragging(true);
        }}
        onDragEnd={() => setIsDragging(false)}
        onDragOver={handleDragOver}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); showContextMenu({ x: e.clientX, y: e.clientY, items: menuOptions }); }}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex items-center group px-2 py-1.5 rounded cursor-pointer transition-all ${
          isDragOver
            ? 'bg-blue-600/20 border border-blue-500 text-blue-300'
            : isDragging
            ? 'opacity-30 bg-gray-800'
            : 'hover:bg-gray-800'
        }`}
        onClick={(e) => { if (!isRenaming) { e.stopPropagation(); setIsOpen(!isOpen); } }}
        onDoubleClick={() => setIsRenaming(true)}
      >"""

fol_div_replace = """      <div
        draggable={!isRenaming}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.setData('application/json', JSON.stringify({ type: 'folder', id: folder._id, name: folder.name }));
          e.dataTransfer.effectAllowed = 'move';
          setIsDragging(true);
          draggedItem = { type: 'folder', id: folder._id, name: folder.name };
        }}
        onDragEnd={() => { setIsDragging(false); draggedItem = null; }}
        onDragOver={handleDragOver}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); showContextMenu({ x: e.clientX, y: e.clientY, items: menuOptions }); }}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex items-center relative group px-2 py-1.5 rounded cursor-pointer transition-all ${
          dropPos === 'inside'
            ? 'bg-blue-600/20 border border-blue-500 text-blue-300'
            : isDragging
            ? 'opacity-30 bg-gray-800'
            : 'hover:bg-gray-800'
        }`}
        onClick={(e) => { if (!isRenaming) { e.stopPropagation(); setIsOpen(!isOpen); } }}
        onDoubleClick={() => setIsRenaming(true)}
      >
        {dropPos === 'before' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-10" />}
        {dropPos === 'after' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 z-10" />}"""
content = content.replace(fol_div_search, fol_div_replace)


# CollectionNode
col_search = """const CollectionNode = ({
  collection,
  isOpen,
  onToggle,
  onPrompt,
  onDelete,
  onDuplicate,
  onMoveRequest,
}: {
  collection: Collection;
  isOpen: boolean;
  onToggle: () => void;
  onPrompt: (config: Omit<PromptConfig, 'isOpen'>) => void;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (type: 'collection', id: string) => void;
  onMoveRequest: (id: string, name: string) => void;
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const { showContextMenu } = useContextMenu();
  const { folders, requests, createFolder, createRequest, renameCollection, duplicateRequest, duplicateFolder, moveRequest, moveFolder } = useCollectionStore();"""

col_replace = """const CollectionNode = ({
  collection,
  isOpen,
  onToggle,
  onPrompt,
  onDelete,
  onDuplicate,
  onMoveRequest,
}: {
  collection: Collection;
  isOpen: boolean;
  onToggle: () => void;
  onPrompt: (config: Omit<PromptConfig, 'isOpen'>) => void;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (type: 'collection', id: string) => void;
  onMoveRequest: (id: string, name: string) => void;
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [dropPos, setDropPos] = useState<'before' | 'after' | 'inside' | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { showContextMenu } = useContextMenu();
  const { folders, requests, createFolder, createRequest, renameCollection, duplicateRequest, duplicateFolder, moveRequest, moveFolder } = useCollectionStore();
  const store = useCollectionStore();"""
content = content.replace(col_search, col_replace)

col_handlers_search = """  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.type === 'request') {
        await moveRequest(data.id, collection._id, null);
        if (!isOpen) onToggle();
      } else if (data.type === 'folder') {
        await moveFolder(data.id, collection._id, null);
        if (!isOpen) onToggle();
      }
    } catch (err) {
      console.error(err);
    }
  };"""

col_handlers_replace = """  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!draggedItem) return;
    const allowed = draggedItem.type === 'collection' ? (['before', 'after'] as any) : (['inside'] as any);
    setDropPos(getDropPosition(e, e.currentTarget as HTMLElement, allowed));
  };

  const handleDragLeave = () => setDropPos(null);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const pos = dropPos; setDropPos(null);
    if (!pos || !draggedItem) return;
    await handleDropAction('collection', collection._id, collection._id, null, pos, store);
    if (pos === 'inside' && !isOpen) onToggle();
  };"""
content = content.replace(col_handlers_search, col_handlers_replace)

col_div_search = """      <div
        onDragOver={handleDragOver}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); showContextMenu({ x: e.clientX, y: e.clientY, items: menuOptions }); }}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        className={`flex items-center group px-2 py-1.5 rounded cursor-pointer transition-all ${
          isDragOver
            ? 'bg-blue-600/20 border border-blue-500 text-blue-300'
            : 'hover:bg-gray-800'
        }`}
        onClick={(e) => { if (!isRenaming) { e.stopPropagation(); onToggle(); } }}
        onDoubleClick={() => setIsRenaming(true)}
      >"""

col_div_replace = """      <div
        draggable={!isRenaming}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.setData('application/json', JSON.stringify({ type: 'collection', id: collection._id, name: collection.name }));
          e.dataTransfer.effectAllowed = 'move';
          setIsDragging(true);
          draggedItem = { type: 'collection', id: collection._id, name: collection.name };
        }}
        onDragEnd={() => { setIsDragging(false); draggedItem = null; }}
        onDragOver={handleDragOver}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); showContextMenu({ x: e.clientX, y: e.clientY, items: menuOptions }); }}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex items-center relative group px-2 py-1.5 rounded cursor-pointer transition-all ${
          dropPos === 'inside'
            ? 'bg-blue-600/20 border border-blue-500 text-blue-300'
            : isDragging
            ? 'opacity-30 bg-gray-800'
            : 'hover:bg-gray-800'
        }`}
        onClick={(e) => { if (!isRenaming) { e.stopPropagation(); onToggle(); } }}
        onDoubleClick={() => setIsRenaming(true)}
      >
        {dropPos === 'before' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-10" />}
        {dropPos === 'after' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 z-10" />}"""
content = content.replace(col_div_search, col_div_replace)


with open('c:/projects/reqspace/client/src/components/collection/CollectionExplorer.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
