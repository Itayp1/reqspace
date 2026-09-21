const fs = require('fs');
let text = fs.readFileSync('client/src/components/collection/CollectionExplorer.tsx', 'utf-8');

const folderStart = text.indexOf('const FolderNode =');
const collectionStart = text.indexOf('const CollectionNode =');

if (folderStart === -1 || collectionStart === -1) {
  console.log('Error: Could not find markers');
  process.exit(1);
}

const newFolderNode = `const FolderNode = ({
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
  const { folders, requests, createFolder, createRequest, renameFolder, duplicateRequest, moveRequest, moveFolder } = useCollectionStore();

  const childFolders = folders.filter(f => f.parentFolderId === folder._id).sort((a, b) => (a.order || 0) - (b.order || 0));
  const childRequests = requests.filter(r => r.folderId === folder._id).sort((a, b) => (a.order || 0) - (b.order || 0));

  const handleDragOver = (e: React.DragEvent) => {
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
  };

  const menuOptions = [
    { label: 'New Request', onClick: () => onPrompt({ title: 'Request name:', placeholder: 'Request name:', onSubmit: async (name) => await createRequest(collectionId, name, folder._id) }) },
    { label: 'New Folder', onClick: () => onPrompt({ title: 'Folder name:', placeholder: 'Folder name:', onSubmit: async (name) => await createFolder(collectionId, name, folder._id) }) },
    { label: 'Rename', onClick: () => setIsRenaming(true) },
    { label: 'Edit', onClick: () => {
      const event = new CustomEvent('edit-group', { detail: { type: 'folder', id: folder._id, name: folder.name } });
      window.dispatchEvent(event);
    }},
    { label: 'Duplicate', onClick: () => onDuplicate('folder', folder._id) },
    { label: 'Delete', onClick: () => onDelete('folder', folder._id, folder.name), danger: true },
  ];

  return (
    <div className="select-none">
      <div
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
      >
        <span className="mr-1 text-gray-400 shrink-0">
          {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <FolderIcon size={13} className="mr-2 text-gray-300 shrink-0" />
        {isRenaming ? (
          <InlineRename
            value={folder.name}
            onSave={async (name) => { await renameFolder(folder._id, name); setIsRenaming(false); }}
            onCancel={() => setIsRenaming(false)}
          />
        ) : (
          <span className="flex-1 truncate text-sm">{folder.name}</span>
        )}
        {!isRenaming && (
          <div className="opacity-30 group-hover:opacity-100 flex items-center shrink-0">
            <ActionMenu options={menuOptions} />
          </div>
        )}
      </div>

      {isOpen && (
        <div className="pl-3 ml-2 border-l border-gray-800/50 mt-0.5">
          {childFolders.map(childFolder => (
            <FolderNode
              key={childFolder._id}
              folder={childFolder}
              collectionId={collectionId}
              onPrompt={onPrompt}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onMoveRequest={onMoveRequest}
            />
          ))}
          {childRequests.map(req => (
            <RequestNode
              key={req._id}
              request={req}
              onDelete={(_id, name) => onDelete('folder', _id, name)}
              onDuplicate={() => duplicateRequest(req._id)}
              onMove={onMoveRequest}
            />
          ))}
          {/* Quick Add Request */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-600 hover:text-gray-400 cursor-pointer rounded hover:bg-gray-800 mt-0.5"
            onClick={() => onPrompt({ title: 'Request name:', placeholder: 'My Request', onSubmit: async (name) => await createRequest(collectionId, name, folder._id) })}
          >
            <FilePlus size={11} />
            <span>Add Request</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ──────── Collection Node ────────

`;

text = text.substring(0, folderStart) + newFolderNode + text.substring(collectionStart + 28);
fs.writeFileSync('client/src/components/collection/CollectionExplorer.tsx', text);
console.log('Fixed FolderNode for real!');
