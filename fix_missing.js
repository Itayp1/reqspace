const fs = require('fs');

let path = 'c:/projects/reqspace/client/src/components/history/HistorySidebar.tsx';
let code = fs.readFileSync(path, 'utf8');

// Insert toggle
const toggleHTML = `
          <div className="flex items-center justify-between mt-1">
            <label htmlFor="saveHistoryToggle" className="text-[11px] text-text-muted flex-1 cursor-pointer">
              Save Request History
            </label>
            <input
              type="checkbox"
              id="saveHistoryToggle"
              checked={settings.saveHistory !== false}
              onChange={async (e) => {
                const checked = e.target.checked;
                if (!checked) {
                  if (window.confirm("Disabling this will delete all your previously saved request history. Are you sure you want to proceed?")) {
                    updateSettings({ saveHistory: false });
                    try {
                      await api.delete('/history');
                      setHistory([]);
                    } catch(err) {
                      console.error(err);
                    }
                  }
                } else {
                  updateSettings({ saveHistory: true });
                }
              }}
              className="cursor-pointer"
            />
          </div>
`;

if (!code.includes('saveHistoryToggle')) {
  // Find </input> or /> in the search div
  code = code.replace(
    'placeholder="Search history..."\n              value={searchQuery}\n              onChange={(e) => setSearchQuery(e.target.value)}\n              className="w-full bg-background border border-border rounded pl-7 pr-2 py-1.5 text-xs text-text outline-none focus:border-primary transition-colors"\n            />\n          </div>',
    'placeholder="Search history..."\n              value={searchQuery}\n              onChange={(e) => setSearchQuery(e.target.value)}\n              className="w-full bg-background border border-border rounded pl-7 pr-2 py-1.5 text-xs text-text outline-none focus:border-primary transition-colors"\n            />\n          </div>' + toggleHTML
  );
}

fs.writeFileSync(path, code, 'utf8');

let tabPath = 'c:/projects/reqspace/client/src/components/request/RequestTabBar.tsx';
let tabCode = fs.readFileSync(tabPath, 'utf8');
if (!tabCode.includes('onDragStart=')) {
  tabCode = tabCode.replace(
    'key={tab.tabId}',
    'key={tab.tabId}\n                draggable\n                onDragStart={(e) => handleDragStart(e, tab.tabId)}\n                onDragOver={(e) => handleDragOver(e, tab.tabId)}\n                onDragLeave={handleDragLeave}\n                onDrop={(e) => handleDrop(e, tab.tabId)}'
  );
}
fs.writeFileSync(tabPath, tabCode, 'utf8');
