const fs = require('fs');
const path = 'client/src/components/collection/CollectionExplorer.tsx';
let text = fs.readFileSync(path, 'utf-8');

// For FolderNode
text = text.replace(
  /onDragEnd=\{\(\) => setIsDragging\(false\)\}\n\s*onDragOver=\{handleDragOver\}/,
  `onDragEnd={() => setIsDragging(false)}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); showContextMenu({ x: e.clientX, y: e.clientY, items: menuOptions }); }}
          onDragOver={handleDragOver}`
);

// For CollectionNode
text = text.replace(
  /onDragOver=\{handleDragOver\}\n\s*onDragLeave=\{handleDragLeave\}\n\s*onDrop=\{handleDrop\}/,
  `onDragOver={handleDragOver}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); showContextMenu({ x: e.clientX, y: e.clientY, items: menuOptions }); }}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}`
);

fs.writeFileSync(path, text);
