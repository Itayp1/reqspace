const fs = require('fs');
let path = 'c:/projects/reqspace/client/src/components/history/HistorySidebar.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Add import
if (!code.includes('useSettingsStore')) {
  code = code.replace(
    "import { SaveRequestModal } from '../request/SaveRequestModal';",
    "import { SaveRequestModal } from '../request/SaveRequestModal';\nimport { useSettingsStore } from '../../store/settingsStore';"
  );
}

// 2. Add hook
if (!code.includes('updateSettings')) {
  code = code.replace(
    'export default function HistorySidebar() {',
    'export default function HistorySidebar() {\n  const { settings, updateSettings } = useSettingsStore();'
  );
}

// 3. Add toggle
const toggleHTML = `</div>
          <div className="flex items-center justify-between mt-3">
            <label htmlFor="saveHistoryToggle" className="text-[11px] text-text-muted flex-1 cursor-pointer">
              Save Request History
            </label>
            <input
              type="checkbox"
              id="saveHistoryToggle"
              checked={settings?.saveHistory !== false}
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
        </div>

        <div className="flex-1 overflow-y-auto">`;

if (!code.includes('saveHistoryToggle')) {
  code = code.replace(/<\/div>\s*<\/div>\s*<div className="flex-1 overflow-y-auto">/, toggleHTML);
}

fs.writeFileSync(path, code, 'utf8');
