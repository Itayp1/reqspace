import { createPortal } from 'react-dom';
import { X, Trash2, Plus, Upload } from 'lucide-react';
import { useSettingsStore } from '../../store/settingsStore';
import { useState } from 'react';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';

function ClientCertificatesManager() {
  const user = useAuthStore(state => state.user);
  const setUser = useAuthStore(state => state.setUser);
  const [certs, setCerts] = useState<any[]>(user?.clientCertificates || []);
  const [isAdding, setIsAdding] = useState(false);
  const [hostname, setHostname] = useState('');
  const [cert, setCert] = useState('');
  const [key, setKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');

  const handleAdd = async () => {
    if (!hostname || !cert || !key) {
      setError('Hostname, Cert, and Key are required');
      return;
    }
    setError('');
    try {
      const res = await api.post('/auth/certificates', { hostname, cert, key, passphrase });
      setCerts(res.data);
      setUser({ ...user!, clientCertificates: res.data });
      setIsAdding(false);
      setHostname(''); setCert(''); setKey(''); setPassphrase('');
    } catch (err: any) {
      const message = err.response?.data?.message || 'Failed to add certificate';
      setError(message);
      useToastStore.getState().addToast('error', message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await api.delete(`/auth/certificates/${id}`);
      setCerts(res.data);
      setUser({ ...user!, clientCertificates: res.data });
    } catch (err: any) {
      useToastStore.getState().addToast('error', err.response?.data?.message || 'Failed to delete certificate');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setter(ev.target?.result as string);
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      {certs.map(c => (
        <div key={c._id} className="flex items-center justify-between bg-surface p-3 border border-border rounded">
          <div>
            <div className="font-mono text-sm text-blue-400">{c.hostname}</div>
            <div className="text-xs text-text-muted mt-1">Added: {new Date(c.createdAt).toLocaleDateString()}</div>
          </div>
          <button onClick={() => handleDelete(c._id)} className="p-2 text-red-400 hover:bg-red-400/10 rounded" title="Delete Certificate">
            <Trash2 size={16} />
          </button>
        </div>
      ))}

      {certs.length === 0 && !isAdding && (
        <div className="text-xs text-text-muted italic">No client certificates configured.</div>
      )}

      {isAdding ? (
        <div className="bg-background border border-border p-4 rounded space-y-3">
          {error && <div className="text-red-400 text-xs">{error}</div>}
          <div>
            <label className="block text-xs mb-1">Hostname (Supports Wildcards e.g. *.example.com)</label>
            <input type="text" value={hostname} onChange={e => setHostname(e.target.value)} placeholder="api.company.local" className="w-full bg-surface border border-border p-1.5 rounded text-sm font-mono" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="flex items-center justify-between text-xs mb-1">
                <span>Certificate (.pem / .crt)</span>
                <label className="text-orange-400 cursor-pointer hover:underline flex items-center gap-1"><Upload size={10}/> Upload File <input type="file" className="hidden" accept=".pem,.crt" onChange={e => handleFileUpload(e, setCert)} /></label>
              </label>
              <textarea value={cert} onChange={e => setCert(e.target.value)} placeholder="-----BEGIN CERTIFICATE-----..." className="w-full h-20 bg-surface border border-border p-1.5 rounded text-[10px] font-mono resize-none" />
            </div>
            <div className="flex-1">
              <label className="flex items-center justify-between text-xs mb-1">
                <span>Private Key (.key)</span>
                <label className="text-orange-400 cursor-pointer hover:underline flex items-center gap-1"><Upload size={10}/> Upload File <input type="file" className="hidden" accept=".pem,.key" onChange={e => handleFileUpload(e, setKey)} /></label>
              </label>
              <textarea value={key} onChange={e => setKey(e.target.value)} placeholder="-----BEGIN PRIVATE KEY-----..." className="w-full h-20 bg-surface border border-border p-1.5 rounded text-[10px] font-mono resize-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs mb-1">Passphrase (Optional)</label>
            <input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} className="w-full bg-surface border border-border p-1.5 rounded text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setIsAdding(false)} className="px-3 py-1 text-xs hover:bg-border rounded">Cancel</button>
            <button onClick={handleAdd} className="px-3 py-1 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded font-medium">Save Certificate</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setIsAdding(true)} className="flex items-center gap-1 text-sm text-orange-500 hover:text-orange-400 font-medium">
          <Plus size={16} /> Add Certificate
        </button>
      )}
    </div>
  );
}

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

              

              <div className="pt-4 mt-4 border-t border-border">
                <h3 className="font-semibold mb-3">Client Certificates (mTLS)</h3>
                <p className="text-xs text-text-muted mb-4">Upload client certificates to authenticate against specific hostnames.</p>
                <ClientCertificatesManager />
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
                  data-testid="proxy-enable-checkbox"
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
                      data-testid="proxy-url-input"
                      type="text"
                      value={settings.proxyUrl}
                      onChange={(e) => updateSettings({ proxyUrl: e.target.value })}
                      placeholder="http://127.0.0.1:8080"
                      className="w-full p-2 border border-border rounded bg-background text-sm"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      data-testid="proxy-auth-checkbox"
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
                          data-testid="proxy-username-input"
                          type="text"
                          value={settings.proxyUsername || ''}
                          onChange={(e) => updateSettings({ proxyUsername: e.target.value })}
                          className="w-full p-2 border border-border rounded bg-background text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Password</label>
                        <input
                          data-testid="proxy-password-input"
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
