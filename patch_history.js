const fs = require('fs');

const path = 'c:/projects/reqspace/client/src/components/history/HistorySidebar.tsx';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('useSettingsStore')) {
  code = code.replace(
    "import { SaveRequestModal } from '../request/SaveRequestModal';",
    "import { SaveRequestModal } from '../request/SaveRequestModal';\nimport { useSettingsStore } from '../../store/settingsStore';"
  );
}

code = code.replace(
  "export default function HistorySidebar() {",
  "export default function HistorySidebar() {\n  const { settings, updateSettings } = useSettingsStore();"
);

const searchJsx = `        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-background border border-border rounded pl-7 pr-2 py-1.5 text-xs text-text outline-none focus:border-primary transition-colors"
            />
          </div>
        </div>`;

const searchJsxWithToggle = `        <div className="px-3 py-2 border-b border-border flex flex-col gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-background border border-border rounded pl-7 pr-2 py-1.5 text-xs text-text outline-none focus:border-primary transition-colors"
            />
          </div>
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
        </div>`;

code = code.replace(searchJsx, searchJsxWithToggle);

fs.writeFileSync(path, code, 'utf8');
