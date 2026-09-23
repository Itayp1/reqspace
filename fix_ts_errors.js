const fs = require('fs');

// 1. Fix environmentStore.ts
let envPath = 'c:/projects/reqspace/client/src/store/environmentStore.ts';
let envCode = fs.readFileSync(envPath, 'utf8');
if (!envCode.includes('fetchEnvironments: (workspaceId: string) => Promise<void>;')) {
  envCode = envCode.replace(
    'setGlobalEnvironment: (env: Environment | null) => void;',
    'setGlobalEnvironment: (env: Environment | null) => void;\n  fetchEnvironments: (workspaceId: string) => Promise<void>;'
  );
}
// Add type to workspaceId
envCode = envCode.replace('fetchEnvironments: async (workspaceId) =>', 'fetchEnvironments: async (workspaceId: string) =>');
fs.writeFileSync(envPath, envCode, 'utf8');

// 2. Fix RequestStore
let reqPath = 'c:/projects/reqspace/client/src/store/requestStore.ts';
let reqCode = fs.readFileSync(reqPath, 'utf8');
if (!reqCode.includes('updateTab: (tabId: string')) {
  reqCode = reqCode.replace(
    'updateActiveRequest: (updates: Partial<ActiveRequest>) => void;',
    'updateActiveRequest: (updates: Partial<ActiveRequest>) => void;\n  updateTab: (tabId: string, updates: Partial<ActiveRequest>) => void;'
  );
}
if (!reqCode.includes('reorderTabs: (draggedId: string')) {
  reqCode = reqCode.replace(
    'closeOtherTabs: (tabId: string) => void;',
    "closeOtherTabs: (tabId: string) => void;\n  reorderTabs: (draggedId: string, targetId: string, pos: 'before'|'after') => void;"
  );
}
fs.writeFileSync(reqPath, reqCode, 'utf8');

// 3. Fix SocketSync
let socketPath = 'c:/projects/reqspace/client/src/components/common/SocketSync.tsx';
let socketCode = fs.readFileSync(socketPath, 'utf8');
// It has duplicate handleEnvUpdate blocks
let parts = socketCode.split('const handleEnvUpdate = () => {');
if (parts.length > 2) {
  socketCode = parts[0] + 'const handleEnvUpdate = () => {' + parts[1];
  let remaining = parts[2];
  // the first block ends at '});', skip up to that
  let nextBlockEnd = remaining.indexOf('});\n\n    // For request update');
  if (nextBlockEnd !== -1) {
    socketCode += remaining.substring(nextBlockEnd + 4);
  }
}
fs.writeFileSync(socketPath, socketCode, 'utf8');

// 4. HistorySidebar (unused vars)
let histPath = 'c:/projects/reqspace/client/src/components/history/HistorySidebar.tsx';
let histCode = fs.readFileSync(histPath, 'utf8');
histCode = histCode.replace('const { saveHistory } = useSettingsStore();', 'const saveHistory = useSettingsStore(state => state.settings?.saveHistory);');
fs.writeFileSync(histPath, histCode, 'utf8');

// 5. RequestTabBar (unused drag handlers)
let tabPath = 'c:/projects/reqspace/client/src/components/request/RequestTabBar.tsx';
let tabCode = fs.readFileSync(tabPath, 'utf8');
// They are declared but not added to the JSX! The patch_ui.js probably failed.
// Let's replace the tab rendering
tabCode = tabCode.replace(/<button\n\s+key=\{tab\.tabId\}/g, 
  '<button\n                key={tab.tabId}\n                draggable\n                onDragStart={(e) => handleDragStart(e, tab.tabId)}\n                onDragOver={(e) => handleDragOver(e, tab.tabId)}\n                onDragLeave={handleDragLeave}\n                onDrop={(e) => handleDrop(e, tab.tabId)}');
fs.writeFileSync(tabPath, tabCode, 'utf8');

