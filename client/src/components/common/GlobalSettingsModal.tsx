import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useSettingsStore } from '../../store/settingsStore';

export default function GlobalSettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings } = useSettingsStore();

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className="bg-background rounded-lg shadow-xl w-[500px] h-[500px] flex flex-col border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border bg-surface">
          <h2 className="text-lg font-bold">Global Settings</h2>
          <button onClick={onClose} className="p-1 hover:bg-border rounded"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          <div>
            <h3 className="font-semibold mb-3">Request Configuration</h3>
            <div className="space-y-3 bg-surface p-4 rounded border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <label htmlFor="followRedirects" className="text-sm font-medium block">Follow Redirects</label>
                  <p className="text-xs text-text-muted">Automatically follow HTTP 3xx responses.</p>
                </div>
                <input
                  type="checkbox"
                  id="followRedirects"
                  checked={settings.followRedirects}
                  onChange={(e) => updateSettings({ followRedirects: e.target.checked })}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <label htmlFor="verifySsl" className="text-sm font-medium block">Verify SSL Certificates</label>
                  <p className="text-xs text-text-muted">Reject unauthorized TLS certificates.</p>
                </div>
                <input
                  type="checkbox"
                  id="verifySsl"
                  checked={settings.verifySsl}
                  onChange={(e) => updateSettings({ verifySsl: e.target.checked })}
                />
              </div>

              <div className="flex items-center justify-between">
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
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Client Certificate Path (.pem / .crt)</label>
                <input
                  type="text"
                  value={settings.clientCertPath || ''}
                  onChange={(e) => updateSettings({ clientCertPath: e.target.value })}
                  placeholder="C:\certs\client.crt"
                  className="w-full p-2 border border-border rounded bg-background text-sm"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-3">Keyboard Shortcuts</h3>
            <div className="space-y-3 bg-surface p-4 rounded border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium block">Global Search</label>
                </div>
                <input
                  type="text"
                  value={settings.shortcuts?.search || 'ctrl+k'}
                  onChange={(e) => updateSettings({ shortcuts: { ...settings.shortcuts, search: e.target.value } })}
                  className="w-24 p-1 border border-border rounded bg-background text-sm text-center"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium block">Save Request</label>
                </div>
                <input
                  type="text"
                  value={settings.shortcuts?.save || 'ctrl+s'}
                  onChange={(e) => updateSettings({ shortcuts: { ...settings.shortcuts, save: e.target.value } })}
                  className="w-24 p-1 border border-border rounded bg-background text-sm text-center"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium block">Send Request</label>
                </div>
                <input
                  type="text"
                  value={settings.shortcuts?.send || 'ctrl+enter'}
                  onChange={(e) => updateSettings({ shortcuts: { ...settings.shortcuts, send: e.target.value } })}
                  className="w-24 p-1 border border-border rounded bg-background text-sm text-center"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-3">Local Proxy Configuration</h3>
            <p className="text-xs text-text-muted mb-2">Apply these settings only to this browser session.</p>
            <div className="space-y-3 bg-surface p-4 rounded border border-border">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  id="proxyEnabled"
                  checked={settings.proxyEnabled}
                  onChange={(e) => updateSettings({ proxyEnabled: e.target.checked })}
                />
                <label htmlFor="proxyEnabled" className="text-sm font-medium">Enable Local Proxy</label>
              </div>

              {settings.proxyEnabled && (
                <>
                  <div>
                    <label className="block text-xs font-medium mb-1">Proxy URL (e.g. http://127.0.0.1:8080)</label>
                    <input
                      type="text"
                      value={settings.proxyUrl}
                      onChange={(e) => updateSettings({ proxyUrl: e.target.value })}
                      placeholder="http://127.0.0.1:8080"
                      className="w-full p-2 border border-border rounded bg-background text-sm"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="proxyAuthEnabled"
                      checked={settings.proxyAuthEnabled}
                      onChange={(e) => updateSettings({ proxyAuthEnabled: e.target.checked })}
                    />
                    <label htmlFor="proxyAuthEnabled" className="text-xs font-medium">Authentication Required</label>
                  </div>

                  {settings.proxyAuthEnabled && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <label className="block text-xs font-medium mb-1">Username</label>
                        <input
                          type="text"
                          value={settings.proxyUsername || ''}
                          onChange={(e) => updateSettings({ proxyUsername: e.target.value })}
                          className="w-full p-2 border border-border rounded bg-background text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Password</label>
                        <input
                          type="password"
                          value={settings.proxyPassword || ''}
                          onChange={(e) => updateSettings({ proxyPassword: e.target.value })}
                          className="w-full p-2 border border-border rounded bg-background text-sm"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
}
