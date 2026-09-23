const fs = require('fs');

const path = 'c:/projects/reqspace/client/src/components/request/RequestTabBar.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  `{dragOverTabId?.id === tab.tabId && dragOverTabId.pos === 'before' && (`,
  `{dragOverTabId?.id === tab.tabId && dragOverTabId?.pos === 'before' && (`
);

code = code.replace(
  `{dragOverTabId?.id === tab.tabId && dragOverTabId.pos === 'after' && (`,
  `{dragOverTabId?.id === tab.tabId && dragOverTabId?.pos === 'after' && (`
);

fs.writeFileSync(path, code, 'utf8');
