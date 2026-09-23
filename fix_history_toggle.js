const fs = require('fs');

const path = 'c:/projects/reqspace/client/src/components/history/HistorySidebar.tsx';
let code = fs.readFileSync(path, 'utf8');

// Ensure useSettingsStore is imported and used
if (!code.includes('import { useSettingsStore }')) {
  code = code.replace(
    "import { SaveRequestModal } from '../request/SaveRequestModal';",
    "import { SaveRequestModal } from '../request/SaveRequestModal';\nimport { useSettingsStore } from '../../store/settingsStore';"
  );
}

if (!code.includes('const { settings, updateSettings } = useSettingsStore();')) {
  code = code.replace(
    "export default function HistorySidebar() {",
    "export default function HistorySidebar() {\n  const { settings, updateSettings } = useSettingsStore();"
  );
}

// Find the search input div
const toggleJsx = `
          <div className="flex items-center justify-between mt-2">
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
  code = code.replace(
    '</label>\n            <input',
    '</label><input'
  ); // just in case
  code = code.replace(
    '</div>\n        </div>\n\n        <div className="flex-1 overflow-y-auto">',
    '</div>\n' + toggleJsx + '        </div>\n\n        <div className="flex-1 overflow-y-auto">'
  );
}

fs.writeFileSync(path, code, 'utf8');
