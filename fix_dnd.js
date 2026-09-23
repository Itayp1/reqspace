const fs = require('fs');
const path = 'c:/projects/reqspace/client/src/components/collection/CollectionExplorer.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add draggedItem global and helper methods
const helperCode = `
let draggedItem: { type: 'collection' | 'folder' | 'request', id: string, name: string } | null = null;

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
      // 'before' or 'after'
      if (dragType === 'collection' && targetType === 'collection') {
         const cols = [...store.collections].sort((a,b) => (a.order||0) - (b.order||0));
         const dragObj = cols.find(c => c._id === dragId);
         if (!dragObj) return;
         const filtered = cols.filter(c => c._id !== dragId);
         const tIdx = filtered.findIndex(c => c._id === targetId);
         if (tIdx === -1) return;
         filtered.splice(dropPos === 'before' ? tIdx : tIdx + 1, 0, dragObj);
         await store.reorderItems('collection', filtered.map((c, i) => ({ id: c._id, order: i })));
      } else if ((dragType === 'request' || dragType === 'folder') && (targetType === 'request' || targetType === 'folder')) {
         if (dragType === 'request') {
           await store.moveRequest(dragId, targetCollectionId, targetParentFolderId);
         } else if (dragType === 'folder') {
           await store.moveFolder(dragId, targetCollectionId, targetParentFolderId);
         }
         
         if (dragType === 'request') {
           const reqs = store.requests.filter(r => r.collectionId === targetCollectionId && r.folderId === targetParentFolderId).sort((a,b) => (a.order||0) - (b.order||0));
           const dragObj = reqs.find(r => r._id === dragId) || store.requests.find(r => r._id === dragId);
           if (!dragObj) return;
           const filtered = reqs.filter(r => r._id !== dragId);
           if (targetType === 'request') {
             const tIdx = filtered.findIndex(r => r._id === targetId);
             const insertIdx = tIdx === -1 ? filtered.length : (dropPos === 'before' ? tIdx : tIdx + 1);
             filtered.splice(insertIdx, 0, dragObj);
           } else {
             filtered.push(dragObj);
           }
           await store.reorderItems('request', filtered.map((r, i) => ({ id: r._id, order: i })));
         } else if (dragType === 'folder') {
           const fols = store.folders.filter(f => f.collectionId === targetCollectionId && f.parentFolderId === targetParentFolderId).sort((a,b) => (a.order||0) - (b.order||0));
           const dragObj = fols.find(f => f._id === dragId) || store.folders.find(f => f._id === dragId);
           if (!dragObj) return;
           const filtered = fols.filter(f => f._id !== dragId);
           if (targetType === 'folder') {
             const tIdx = filtered.findIndex(f => f._id === targetId);
             const insertIdx = tIdx === -1 ? filtered.length : (dropPos === 'before' ? tIdx : tIdx + 1);
             filtered.splice(insertIdx, 0, dragObj);
           } else {
             filtered.push(dragObj);
           }
           await store.reorderItems('folder', filtered.map((f, i) => ({ id: f._id, order: i })));
         }
      }
    }
  } catch(e) { console.error(e); }
  
  draggedItem = null;
};
`;

if (!content.includes('let draggedItem')) {
  content = content.replace('// ── Shared Types ──────────────────────────────────────────────────────────────', helperCode + '\n\n// ── Shared Types ──────────────────────────────────────────────────────────────');
}

// 2. Patch RequestNode
content = content.replace(
  /const RequestNode = \([\s\S]*?return \([\s\S]*?<div\s+draggable=\{!isRenaming\}\s+onDragStart=\{\(e\) => \{[\s\S]*?className=\{`flex items-center group px-2 py-1\.5 rounded cursor-pointer transition-opacity/m,
  (match) => {
    if (match.includes('dropPos')) return match; // already patched
    return match.replace(
      /const RequestNode = \([\s\S]*?onClick=\{handleClick\}/m,
      `const RequestNode = ({
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
  const store = useCollectionStore();
    
  
  const isActive = activeRequest?._id === request._id;

  const handleClick = async (e: React.MouseEvent) => {
    if (isRenaming) return;
    e.stopPropagation();
    
    // Fallback stub in case fetch fails or is slow
    const fullRequest = request as any;
    const fallbackReq: ActiveRequest = {
      _id: request._id,
      tabType: 'request',
      collectionId: request.collectionId,
      folderId: request.folderId,
      name: request.name,
      method: request.method || 'GET',
      url: request.url || '',
      params: fullRequest.params || [],
      headers: fullRequest.headers || [],
      auth: fullRequest.auth || { type: 'none' },
      body: fullRequest.body || { mode: 'none' },
      preRequestScript: fullRequest.preRequestScript,
      testScript: fullRequest.testScript,
    };

    // Optimistic instant load
    setActiveRequest(fallbackReq);
    navigate('/');

    try {
      const res = await api.get(\`/requests/\${request._id}\`);
      // Only apply if they haven't switched away
      if (useRequestStore.getState().activeRequest?._id === request._id) {
        setActiveRequest(res.data);
      }
    } catch (err) {
      console.error('Failed to load full request, using fallback list data');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (draggedItem?.type === 'collection') {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    const pos = getDropPosition(e, e.currentTarget as HTMLElement, ['before', 'after']);
    setDropPos(pos);
  };

  const handleDragLeave = () => setDropPos(null);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const pos = dropPos;
    setDropPos(null);
    if (!pos || !draggedItem) return;
    await handleDropAction('request', request._id, request.collectionId, request.folderId, pos, store);
  };

  const menuOptions = [
    { label: 'Rename', onClick: () => setIsRenaming(true) },
    { label: 'Duplicate', onClick: () => onDuplicate(request._id) },
    { label: 'Move to...', onClick: () => onMove(request._id, request.name) },
    { label: 'Copy to Workspace', onClick: () => {
      const event = new CustomEvent('copy-to-workspace', { detail: { type: 'request', id: request._id, name: request.name } });
      window.dispatchEvent(event);
    }},
    { label: 'Delete', onClick: () => onDelete(request._id, request.name), danger: true },
  ];

  return (
    <div
      draggable={!isRenaming}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'request', id: request._id, name: request.name }));
        e.dataTransfer.effectAllowed = 'move';
        setIsDragging(true);
        draggedItem = { type: 'request', id: request._id, name: request.name };
      }}
      onDragEnd={() => { setIsDragging(false); draggedItem = null; }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); showContextMenu({ x: e.clientX, y: e.clientY, items: menuOptions }); }}
      className={\`flex items-center relative group px-2 py-1.5 rounded cursor-pointer transition-opacity \${
        isDragging ? 'opacity-30 bg-gray-800' : ''
      } \${isActive ? 'bg-gray-700 text-white' : 'hover:bg-gray-800 text-gray-400'}\`}
      onClick={handleClick}`
    );
  }
);

content = content.replace(
  /(className=\{`flex items-center relative group px-2 py-1\.5 rounded cursor-pointer transition-opacity [\s\S]*?onClick=\{handleClick\}[\s\S]*?onDoubleClick=\{\(\) => setIsRenaming\(true\)\}\s*>)/,
  `$1\n      {dropPos === 'before' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-10" />}\n      {dropPos === 'after' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 z-10" />}`
);

// 3. Patch FolderNode
content = content.replace(
  /const FolderNode = \([\s\S]*?const childRequests = [\s\S]*?return \([\s\S]*?<div\s+draggable=\{!isRenaming\}\s+onDragStart=\{\(e\) => \{[\s\S]*?className=\{`flex items-center group px-2 py-1\.5 rounded cursor-pointer transition-all/m,
  (match) => {
    if (match.includes('dropPos')) return match;
    return match.replace(
      /const handleDragOver = \([\s\S]*?const childRequests = [\s\S]*?const menuOptions =/m,
      `const store = useCollectionStore();
  const [dropPos, setDropPos] = useState<'before' | 'after' | 'inside' | null>(null);

  const childFolders = folders.filter(f => f.parentFolderId === folder._id).sort((a, b) => (a.order || 0) - (b.order || 0));
  const childRequests = requests.filter(r => r.folderId === folder._id).sort((a, b) => (a.order || 0) - (b.order || 0));

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (draggedItem?.type === 'collection') {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    const pos = getDropPosition(e, e.currentTarget as HTMLElement, ['before', 'after', 'inside']);
    setDropPos(pos);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDropPos(null);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const pos = dropPos;
    setDropPos(null);
    if (!pos || !draggedItem) return;
    await handleDropAction('folder', folder._id, collectionId, folder.parentFolderId, pos, store);
    if (pos === 'inside' && !isOpen) setIsOpen(true);
  };

  const handleSort = async () => {
    const childFolders = folders.filter(f => f.parentFolderId === folder._id);
    const childReqs = requests.filter(r => r.folderId === folder._id);
    const reorderFolders = childFolders.sort((a, b) => a.name.localeCompare(b.name)).map((f, i) => ({ id: f._id!, order: i }));
    const reorderReqs = childReqs.sort((a, b) => a.name.localeCompare(b.name)).map((r, i) => ({ id: r._id!, order: i }));
    if (reorderFolders.length) await useCollectionStore.getState().reorderItems('folder', reorderFolders);
    if (reorderReqs.length) await useCollectionStore.getState().reorderItems('request', reorderReqs);
  };

  const menuOptions =`
    ).replace(
      /draggable=\{!isRenaming\}\s*onDragStart=\{\(e\) => \{[\s\S]*?onDrop=\{handleDrop\}\s*className=\{`flex items-center group px-2 py-1\.5 rounded cursor-pointer transition-all \$\{[\s\S]*?\}\`/m,
      `draggable={!isRenaming}
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
        className={\`flex items-center relative group px-2 py-1.5 rounded cursor-pointer transition-all \${
          dropPos === 'inside'
            ? 'bg-blue-600/20 border border-blue-500 text-blue-300'
            : isDragging
            ? 'opacity-30 bg-gray-800'
            : 'hover:bg-gray-800'
        }\``
    );
  }
);
content = content.replace(
  /(className=\{`flex items-center relative group px-2 py-1\.5 rounded cursor-pointer transition-all \$\{[\s\S]*?\}\`\s*onClick=\{\(e\) => \{ if \(!isRenaming\) \{ e\.stopPropagation\(\); setIsOpen\(!isOpen\); \} \}\}\s*onDoubleClick=\{\(\) => setIsRenaming\(true\)\}\s*>)/,
  `$1\n        {dropPos === 'before' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-10" />}\n        {dropPos === 'after' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 z-10" />}`
);

// 4. Patch CollectionNode
content = content.replace(
  /const CollectionNode = \([\s\S]*?const childRequests = [\s\S]*?return \([\s\S]*?<div\s+onDragOver=\{handleDragOver\}\s+onContextMenu=/m,
  (match) => {
    if (match.includes('dropPos')) return match;
    return match.replace(
      /const handleDragOver = \([\s\S]*?const childRequests = [\s\S]*?const menuOptions =/m,
      `const store = useCollectionStore();
  const [dropPos, setDropPos] = useState<'before' | 'after' | 'inside' | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const childFolders = folders.filter(f => f.collectionId === collection._id && !f.parentFolderId).sort((a, b) => (a.order || 0) - (b.order || 0));
  const childRequests = requests.filter(r => r.collectionId === collection._id && !r.folderId).sort((a, b) => (a.order || 0) - (b.order || 0));

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!draggedItem) return;
    const allowed = draggedItem.type === 'collection' ? ['before', 'after'] as const : ['inside'] as const;
    const pos = getDropPosition(e, e.currentTarget as HTMLElement, allowed as any);
    setDropPos(pos);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDropPos(null);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const pos = dropPos;
    setDropPos(null);
    if (!pos || !draggedItem) return;
    await handleDropAction('collection', collection._id, collection._id, null, pos, store);
    if (pos === 'inside' && !isOpen) onToggle();
  };

  const handleSort = async () => {
    const childFolders = folders.filter(f => f.collectionId === collection._id && !f.parentFolderId);
    const childReqs = requests.filter(r => r.collectionId === collection._id && !r.folderId);
    const reorderFolders = childFolders.sort((a, b) => a.name.localeCompare(b.name)).map((f, i) => ({ id: f._id!, order: i }));
    const reorderReqs = childReqs.sort((a, b) => a.name.localeCompare(b.name)).map((r, i) => ({ id: r._id!, order: i }));
    if (reorderFolders.length) await useCollectionStore.getState().reorderItems('folder', reorderFolders);
    if (reorderReqs.length) await useCollectionStore.getState().reorderItems('request', reorderReqs);
  };

  const menuOptions =`
    ).replace(
      /<div\s*onDragOver=\{handleDragOver\}\s*onContextMenu=\{\(e\) => \{[\s\S]*?className=\{`flex items-center group px-2 py-1\.5 rounded cursor-pointer transition-all \$\{[\s\S]*?\}\`/m,
      `<div
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
        className={\`flex items-center relative group px-2 py-1.5 rounded cursor-pointer transition-all \${
          dropPos === 'inside'
            ? 'bg-blue-600/20 border border-blue-500 text-blue-300'
            : isDragging
            ? 'opacity-30 bg-gray-800'
            : 'hover:bg-gray-800'
        }\``
    );
  }
);
content = content.replace(
  /(className=\{`flex items-center relative group px-2 py-1\.5 rounded cursor-pointer transition-all \$\{[\s\S]*?\}\`\s*onClick=\{\(e\) => \{ if \(!isRenaming\) \{ e\.stopPropagation\(\); onToggle\(\); \} \}\}\s*onDoubleClick=\{\(\) => setIsRenaming\(true\)\}\s*>)/,
  `$1\n        {dropPos === 'before' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-10" />}\n        {dropPos === 'after' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 z-10" />}`
);

fs.writeFileSync(path, content, 'utf8');
