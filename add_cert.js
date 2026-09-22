const fs = require('fs');
let s = fs.readFileSync('client/src/components/common/GlobalSettingsModal.tsx', 'utf8');

const importsToAdd = import { useState } from 'react';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { Trash2, Plus, Upload } from 'lucide-react';
;

const certManagerCode = 
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
      setError(err.response?.data?.message || 'Failed to add certificate');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await api.delete(\/auth/certificates/\\);
      setCerts(res.data);
      setUser({ ...user!, clientCertificates: res.data });
    } catch (err: any) {
      console.error(err);
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

;

s = s.replace("import { useSettingsStore } from '../../store/settingsStore';", importsToAdd + "import { useSettingsStore } from '../../store/settingsStore';");
s = s.replace("export default function GlobalSettingsModal", certManagerCode + "export default function GlobalSettingsModal");
fs.writeFileSync('client/src/components/common/GlobalSettingsModal.tsx', s);
