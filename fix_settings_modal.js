const fs = require('fs');
let code = fs.readFileSync('c:/projects/reqspace/client/src/components/common/GlobalSettingsModal.tsx', 'utf8');

const search = `<div className="flex items-center justify-between">
                <div>
                  <label htmlFor="saveHistory" className="text-sm font-medium block">Save Request History</label>
                  <p className="text-xs text-text-muted">Save executed requests to history (max 500KB total size).</p>
                </div>
                <input
                  type="checkbox"
                  id="saveHistory"
                  checked={settings.saveHistory}
                  onChange={(e) => updateSettings({ saveHistory: e.target.checked })}
                />
              </div>`;

const replace = `<div className="flex items-center justify-between">
                <div>
                  <label htmlFor="saveHistory" className="text-sm font-medium block">Save Request History</label>
                  <p className="text-xs text-text-muted">Save executed requests to history (max 5MB total size, up to 300KB per request).</p>
                </div>
                <input
                  type="checkbox"
                  id="saveHistory"
                  checked={settings.saveHistory}
                  onChange={async (e) => {
                    const checked = e.target.checked;
                    if (!checked) {
                      if (window.confirm("Disabling this will delete all your previously saved request history. Are you sure you want to proceed?")) {
                        updateSettings({ saveHistory: false });
                        try {
                          await api.delete('/history');
                        } catch(err) {
                          console.error(err);
                        }
                      }
                    } else {
                      updateSettings({ saveHistory: true });
                    }
                  }}
                />
              </div>`;

code = code.replace(search, replace);
fs.writeFileSync('c:/projects/reqspace/client/src/components/common/GlobalSettingsModal.tsx', code, 'utf8');
