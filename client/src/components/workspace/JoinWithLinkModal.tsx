import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

/** The token from a pasted invite link, or a bare token; null if it is neither. */
export function parseInviteToken(raw: string): string | null {
  const v = raw.trim();
  const at = v.indexOf('/invite/');
  if (at !== -1) return v.slice(at + 8).split(/[?#/]/)[0] || null;
  return /^[A-Za-z0-9_-]{20,}$/.test(v) ? v : null;
}

export function JoinWithLinkModal({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) { setError('Paste an invite link or code.'); return; }
    const token = parseInviteToken(value);
    if (!token) { setError('That does not look like an invite link. Paste the whole link or the code at the end of it.'); return; }
    onClose();
    navigate('/invite/' + token);
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[9999]" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form role="dialog" aria-modal="true" aria-labelledby="join-link-title" onSubmit={submit} noValidate
        className="bg-background rounded-lg shadow-xl w-full max-w-sm p-6 border border-border">
        <h2 id="join-link-title" className="text-lg font-bold mb-1">Join with Invite Link</h2>
        <p className="text-sm text-text-muted mb-4">Paste the link you received, or just the code at the end of it.</p>
        <label htmlFor="join-link-input" className="block text-sm font-medium mb-1">Invite link or code</label>
        <input
          id="join-link-input" data-testid="join-link-input" autoFocus autoComplete="off" spellCheck={false}
          value={value} onChange={e => { setValue(e.target.value); setError(''); }}
          placeholder="https://…/invite/abc123…"
          aria-invalid={error ? true : undefined} aria-describedby={error ? 'join-link-error' : undefined}
          className="w-full p-2 border border-border rounded bg-surface text-text font-mono text-sm focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
        />
        {error && <p id="join-link-error" data-testid="join-link-error" role="alert" className="text-xs text-delete mt-1">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" data-testid="join-link-cancel-btn" onClick={onClose} className="border border-border px-4 py-2 rounded hover:bg-border focus-visible:ring-2 focus-visible:ring-primary">Cancel</button>
          <button type="submit" data-testid="join-link-submit-btn" className="bg-primary text-white px-4 py-2 rounded hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2">Continue</button>
        </div>
      </form>
    </div>,
    document.body
  );
}
