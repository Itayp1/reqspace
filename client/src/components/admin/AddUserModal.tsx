import { useEscape } from '../../hooks/useEscape';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus } from 'lucide-react';
import api from '../../api/axios';
import { apiErrorMessage } from '../../utils/apiError';
import { useToastStore } from '../../store/toastStore';

export function AddUserModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
  useEscape(onClose);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const open = useRef(true);
  useEffect(() => { open.current = true; return () => { open.current = false; }; }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !email.trim() || !password) { setError('Name, email and password are required.'); return; }
    setLoading(true);
    try {
      await api.post('/admin/users', { name, email, password, isSuperAdmin });
      onSuccess();
      onClose();
    } catch (err: any) {
      const message = apiErrorMessage(err, 'Failed to create user');
      // Inline while the form is open (a toast would repeat it); a toast if it was closed meanwhile.
      if (open.current) setError(message); else useToastStore.getState().addToast('error', message);
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div data-testid="add-user-modal" role="dialog" aria-modal="true" aria-label="Add New User" onKeyDown={e => { if (e.key === 'Escape') onClose(); }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md flex flex-col border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-xl font-bold flex items-center gap-2"><UserPlus size={20} /> Add New User</h2>
          <button data-testid="add-user-close-btn" onClick={onClose} aria-label="Close" className="p-1 text-text-muted hover:text-text rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X size={20} aria-hidden="true" /></button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {error && <div role="alert" className="p-3 bg-red-100 text-red-700 rounded-md text-sm">{error}</div>}

          <div>
            <label htmlFor="add-user-name" className="block text-sm font-semibold mb-1">Name</label>
            <input id="add-user-name" data-testid="add-user-name" type="text" required autoFocus autoComplete="off" value={name} onChange={e => setName(e.target.value)} className="w-full bg-surface border border-border rounded px-3 py-2" placeholder="John Doe" />
          </div>
          <div>
            <label htmlFor="add-user-email" className="block text-sm font-semibold mb-1">Email</label>
            <input id="add-user-email" data-testid="add-user-email" type="email" required autoComplete="off" spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-surface border border-border rounded px-3 py-2" placeholder="john@example.com" />
          </div>
          <div>
            <label htmlFor="add-user-password" className="block text-sm font-semibold mb-1">Temporary Password</label>
            <input id="add-user-password" data-testid="add-user-password" type="password" required autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-surface border border-border rounded px-3 py-2" placeholder="Choose a password…" />
            <p className="text-xs text-text-muted mt-1">The user must change this password at first login.</p>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <input type="checkbox" id="superAdmin" checked={isSuperAdmin} onChange={e => setIsSuperAdmin(e.target.checked)} className="rounded border-border bg-surface" />
            <label htmlFor="superAdmin" className="text-sm font-medium">Make super admin (full access to this dashboard)</label>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded font-medium hover:bg-surface border border-transparent">Cancel</button>
            <button data-testid="add-user-submit-btn" type="submit" disabled={loading} className="bg-primary-strong text-white px-4 py-2 rounded font-semibold hover:bg-primary-strong-hover disabled:opacity-50 flex items-center gap-2">
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
