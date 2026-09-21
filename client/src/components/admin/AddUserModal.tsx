import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus } from 'lucide-react';
import api from '../../api/axios';

export function AddUserModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/admin/users', { name, email, password, isSuperAdmin });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md flex flex-col border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-xl font-bold flex items-center gap-2"><UserPlus size={20} /> Add New User</h2>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text rounded-md"><X size={20} /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {error && <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">{error}</div>}
          
          <div>
            <label className="block text-sm font-semibold mb-1">Name</label>
            <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full bg-surface border border-border rounded px-3 py-2" placeholder="John Doe" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-surface border border-border rounded px-3 py-2" placeholder="john@example.com" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Temporary Password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-surface border border-border rounded px-3 py-2" placeholder="Secret password" />
            <p className="text-xs text-text-muted mt-1">User will be forced to change this on first login.</p>
          </div>
          
          <div className="flex items-center gap-2 mt-2">
            <input type="checkbox" id="superAdmin" checked={isSuperAdmin} onChange={e => setIsSuperAdmin(e.target.checked)} className="rounded border-border bg-surface" />
            <label htmlFor="superAdmin" className="text-sm font-medium">Make System Admin (SuperAdmin)</label>
          </div>
          
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded font-medium hover:bg-surface border border-transparent">Cancel</button>
            <button type="submit" disabled={loading} className="bg-primary text-white px-4 py-2 rounded font-semibold hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2">
              {loading && <div className="w-4 h-4 rounded-full border-2 border-t-transparent border-white animate-spin"></div>}
              Create User
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
