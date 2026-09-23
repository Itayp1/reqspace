const fs = require('fs');
let path = 'c:/projects/reqspace/client/src/components/history/HistorySidebar.tsx';
let code = fs.readFileSync(path, 'utf8');

const target = '</div>\n          </div>\n\n          <div className="flex-1 overflow-y-auto">';
const toggleJsx = `</div>
            <div className="flex items-center justify-between mt-3">
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
          </div>

          <div className="flex-1 overflow-y-auto">`;

if (!code.includes('saveHistoryToggle')) {
  code = code.replace(target, toggleJsx);
}

fs.writeFileSync(path, code, 'utf8');
