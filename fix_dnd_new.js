const fs = require('fs');

const path = 'c:/projects/reqspace/client/src/components/collection/CollectionExplorer.tsx';
let content = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

function replaceOrThrow(search, replace, name) { search = search.replace(/\r\n/g, '\n'); replace = replace.replace(/\r\n/g, '\n');
  if (!content.includes(search)) {
    console.error(`Failed to find ${name} search string!`);
    console.log("--- Expected ---\n" + search + "\n--- Actual snippet ---\n" + content.substring(content.indexOf(search.substring(0, 50)), content.indexOf(search.substring(0, 50)) + 200));
    process.exit(1);
  }
  content = content.replace(search, replace);
}

const req_search = `const RequestNode = ({
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
  const { showContextMenu } = useContextMenu();`;

const req_replace = `const RequestNode = ({
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
  const store = useCollectionStore();`;

replaceOrThrow(req_search, req_replace, 'req_start');

const req_div_search = `    <div
      draggable={!isRenaming}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'request', id: request._id, name: request.name }));
        e.dataTransfer.effectAllowed = 'move';
        setIsDragging(true);
      }}
      onDragEnd={() => setIsDragging(false)}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); showContextMenu({ x: e.clientX, y: e.clientY, items: menuOptions }); }}
      className={\`flex items-center group px-2 py-1.5 rounded cursor-pointer transition-opacity \${
        isDragging ? 'opacity-30 bg-gray-800' : ''
      } \${isActive ? 'bg-gray-700 text-white' : 'hover:bg-gray-800 text-gray-400'}\`}
      onClick={handleClick}
      onDoubleClick={() => setIsRenaming(true)}
    >`;

const req_div_replace = `    <div
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
      className={\`flex items-center relative group px-2 py-1.5 rounded cursor-pointer transition-opacity \${
        isDragging ? 'opacity-30 bg-gray-800' : ''
      } \${isActive ? 'bg-gray-700 text-white' : 'hover:bg-gray-800 text-gray-400'}\`}
      onClick={handleClick}
      onDoubleClick={() => setIsRenaming(true)}
    >
      {dropPos === 'before' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-10" />}
      {dropPos === 'after' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 z-10" />}`;

replaceOrThrow(req_div_search, req_div_replace, 'req_div');

const fol_search = `const FolderNode = ({
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
  const { folders, requests, createFolder, createRequest, renameFolder, duplicateRequest, moveRequest, moveFolder } = useCollectionStore();`;

const fol_replace = `const FolderNode = ({
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
  const store = useCollectionStore();`;

replaceOrThrow(fol_search, fol_replace, 'fol_start');

const fol_handlers_search = `  const handleDragOver = (e: React.DragEvent) => {
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
  };`;

const fol_handlers_replace = `  const handleDragOver = (e: React.DragEvent) => {
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
  };`;

replaceOrThrow(fol_handlers_search, fol_handlers_replace, 'fol_handlers');

const fol_div_search = `      <div
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
        className={\`flex items-center group px-2 py-1.5 rounded cursor-pointer transition-all \${
          isDragOver
            ? 'bg-blue-600/20 border border-blue-500 text-blue-300'
            : isDragging
            ? 'opacity-30 bg-gray-800'
            : 'hover:bg-gray-800'
        }\`}
        onClick={(e) => { if (!isRenaming) { e.stopPropagation(); setIsOpen(!isOpen); } }}
        onDoubleClick={() => setIsRenaming(true)}
      >`;

const fol_div_replace = `      <div
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
        className={\`flex items-center relative group px-2 py-1.5 rounded cursor-pointer transition-all \${
          dropPos === 'inside'
            ? 'bg-blue-600/20 border border-blue-500 text-blue-300'
            : isDragging
            ? 'opacity-30 bg-gray-800'
            : 'hover:bg-gray-800'
        }\`}
        onClick={(e) => { if (!isRenaming) { e.stopPropagation(); setIsOpen(!isOpen); } }}
        onDoubleClick={() => setIsRenaming(true)}
      >
        {dropPos === 'before' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-10" />}
        {dropPos === 'after' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 z-10" />}`;

replaceOrThrow(fol_div_search, fol_div_replace, 'fol_div');

const col_search = `const CollectionNode = ({
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
  const { folders, requests, createFolder, createRequest, renameCollection, duplicateRequest, duplicateFolder, moveRequest, moveFolder } = useCollectionStore();`;

const col_replace = `const CollectionNode = ({
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
  const store = useCollectionStore();`;

replaceOrThrow(col_search, col_replace, 'col_start');

const col_handlers_search = `  const handleDragOver = (e: React.DragEvent) => {
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
  };`;

const col_handlers_replace = `  const handleDragOver = (e: React.DragEvent) => {
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
  };`;

replaceOrThrow(col_handlers_search, col_handlers_replace, 'col_handlers');

const col_div_search = `      <div
        onDragOver={handleDragOver}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); showContextMenu({ x: e.clientX, y: e.clientY, items: menuOptions }); }}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        className={\`flex items-center group px-2 py-1.5 rounded cursor-pointer transition-all \${
          isDragOver
            ? 'bg-blue-600/20 border border-blue-500 text-blue-300'
            : 'hover:bg-gray-800'
        }\`}
        onClick={(e) => { if (!isRenaming) { e.stopPropagation(); onToggle(); } }}
        onDoubleClick={() => setIsRenaming(true)}
      >`;

const col_div_replace = `      <div
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
        }\`}
        onClick={(e) => { if (!isRenaming) { e.stopPropagation(); onToggle(); } }}
        onDoubleClick={() => setIsRenaming(true)}
      >
        {dropPos === 'before' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-10" />}
        {dropPos === 'after' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 z-10" />}`;

replaceOrThrow(col_div_search, col_div_replace, 'col_div');

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully patched CollectionExplorer.tsx');
