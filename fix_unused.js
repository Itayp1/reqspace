const fs = require('fs');

let histPath = 'c:/projects/reqspace/client/src/components/history/HistorySidebar.tsx';
let histCode = fs.readFileSync(histPath, 'utf8');
histCode = histCode.replace('const {} = useSettingsStore();', '');
histCode = histCode.replace('const { } = useSettingsStore();', '');
histCode = histCode.replace('const {  } = useSettingsStore();', '');
fs.writeFileSync(histPath, histCode, 'utf8');

let tabPath = 'c:/projects/reqspace/client/src/components/request/RequestTabBar.tsx';
let tabCode = fs.readFileSync(tabPath, 'utf8');
tabCode = tabCode.replace(/<button\n\s+key=\{tab\.tabId\}/g, 
  '<button\n                draggable\n                onDragStart={(e) => handleDragStart(e, tab.tabId)}\n                onDragOver={(e) => handleDragOver(e, tab.tabId)}\n                onDragLeave={handleDragLeave}\n                onDrop={(e) => handleDrop(e, tab.tabId)}\n                key={tab.tabId}');
fs.writeFileSync(tabPath, tabCode, 'utf8');
