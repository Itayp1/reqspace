const fs = require('fs');

const path = 'c:/projects/reqspace/client/src/components/request/RequestTabBar.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  `              {dragOverTabId?.id === tab.tabId && dragOverTabId.pos === 'after' && (
                <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-blue-500 z-10" />
              )}
            >`,
  `              {dragOverTabId?.id === tab.tabId && dragOverTabId.pos === 'after' && (
                <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-blue-500 z-10" />
              )}`
);

fs.writeFileSync(path, code, 'utf8');
