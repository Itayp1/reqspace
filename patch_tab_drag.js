const fs = require('fs');

const path = 'c:/projects/reqspace/client/src/components/request/RequestTabBar.tsx';
let code = fs.readFileSync(path, 'utf8');

// Add drag state
code = code.replace(
  "const [contextMenu, setContextMenu] = useState<{ x: number, y: number, tabId: string } | null>(null);",
  "const [contextMenu, setContextMenu] = useState<{ x: number, y: number, tabId: string } | null>(null);\n  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);\n  const [dragOverTabId, setDragOverTabId] = useState<{ id: string, pos: 'before'|'after' } | null>(null);"
);

// Get reorderTabs
code = code.replace(
  "closeAllToLeft, closeOtherTabs } = useRequestStore();",
  "closeAllToLeft, closeOtherTabs, reorderTabs } = useRequestStore();"
);

// Drop handles
const dropLogic = `
  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    e.dataTransfer.setData('text/plain', tabId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedTabId(tabId);
  };

  const handleDragOver = (e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    if (tabId === draggedTabId) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pos = x < rect.width / 2 ? 'before' : 'after';
    
    setDragOverTabId({ id: tabId, pos });
  };

  const handleDragLeave = () => {
    setDragOverTabId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedTabId || draggedTabId === targetId || !dragOverTabId) {
      setDraggedTabId(null);
      setDragOverTabId(null);
      return;
    }
    
    reorderTabs(draggedTabId, targetId, dragOverTabId.pos);
    setDraggedTabId(null);
    setDragOverTabId(null);
  };
`;

code = code.replace(
  "const handleClose = (e: React.MouseEvent, tab: any) => {",
  dropLogic + "\n  const handleClose = (e: React.MouseEvent, tab: any) => {"
);

// Tab JSX
const tabJsxSearch = `            <div
              key={tab.tabId}
              onAuxClick={(e) => {
                 if (e.button === 1) handleClose(e, tab);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.tabId! });
              }}
              onClick={() => selectTab(tab.tabId!)}
              className={\`group relative flex items-center gap-2 px-3 py-1 text-xs rounded-t cursor-pointer border-t-2 transition-colors max-w-[180px] shrink-0 \${
                isActive
                  ? 'bg-white dark:bg-gray-900 border-blue-500 text-gray-900 dark:text-gray-100 font-medium shadow-xs'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-gray-900/50'
              }\`}`;

const tabJsxReplace = `            <div
              key={tab.tabId}
              draggable
              onDragStart={(e) => handleDragStart(e, tab.tabId!)}
              onDragOver={(e) => handleDragOver(e, tab.tabId!)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, tab.tabId!)}
              onDragEnd={() => { setDraggedTabId(null); setDragOverTabId(null); }}
              onAuxClick={(e) => {
                 if (e.button === 1) handleClose(e, tab);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.tabId! });
              }}
              onClick={() => selectTab(tab.tabId!)}
              className={\`group relative flex items-center gap-2 px-3 py-1 text-xs rounded-t cursor-pointer border-t-2 transition-colors max-w-[180px] shrink-0 \${
                isActive
                  ? 'bg-white dark:bg-gray-900 border-blue-500 text-gray-900 dark:text-gray-100 font-medium shadow-xs'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-gray-900/50'
              } \${draggedTabId === tab.tabId ? 'opacity-50' : ''}\`}
            >
              {dragOverTabId?.id === tab.tabId && dragOverTabId.pos === 'before' && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500 z-10" />
              )}
              {dragOverTabId?.id === tab.tabId && dragOverTabId.pos === 'after' && (
                <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-blue-500 z-10" />
              )}`;

code = code.replace(tabJsxSearch, tabJsxReplace);

fs.writeFileSync(path, code, 'utf8');
