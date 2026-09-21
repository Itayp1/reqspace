const fs = require('fs');
let text = fs.readFileSync('client/src/components/collection/CollectionExplorer.tsx', 'utf-8');

const bad = `  return (
        />
      ) : (
        <span className="flex-1 truncate text-sm">{request.name}</span>
      )}
      {!isRenaming && (
        <div className="opacity-30 group-hover:opacity-100 flex items-center shrink-0">
          <ActionMenu options={menuOptions} />
        </div>
      )}
    </div>
  );`;

const good = `  return (
    <div
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
    >
      <span className={\`mr-2 text-[10px] font-bold w-8 shrink-0 \${getMethodColor(request.method || 'GET')}\`}>
        {(request.method || 'GET').toUpperCase().substring(0, 4)}
      </span>
      {isRenaming ? (
        <InlineRename
          value={request.name}
          onSave={async (name) => { await renameRequest(request._id, name); setIsRenaming(false); }}
          onCancel={() => setIsRenaming(false)}
        />
      ) : (
        <span className="flex-1 truncate text-sm">{request.name}</span>
      )}
      {!isRenaming && (
        <div className="opacity-30 group-hover:opacity-100 flex items-center shrink-0">
          <ActionMenu options={menuOptions} />
        </div>
      )}
    </div>
  );`;

text = text.replace(bad, good);
fs.writeFileSync('client/src/components/collection/CollectionExplorer.tsx', text);
console.log('Fixed');
