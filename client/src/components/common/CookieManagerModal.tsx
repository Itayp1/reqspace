import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Plus, Globe, Cookie, ShieldCheck } from 'lucide-react';
import { useCookieStore } from '../../store/cookieStore';

interface CookieManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDomain?: string;
}

export const CookieManagerModal: React.FC<CookieManagerModalProps> = ({
  isOpen,
  onClose,
  initialDomain,
}) => {
  const {
    cookies,
    selectedDomain,
    setSelectedDomain,
    addDomain,
    deleteDomain,
    addCookie,
    updateCookie,
    deleteCookie,
    deleteAllCookies,
  } = useCookieStore();

  const [newDomainInput, setNewDomainInput] = useState('');
  const [showAddDomain, setShowAddDomain] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Extract unique domains
  const domains = Array.from(new Set(cookies.map((c) => c.domain)));
  if (initialDomain && !domains.includes(initialDomain)) {
    domains.unshift(initialDomain);
  }

  const activeDomain = selectedDomain || domains[0] || '';
  const domainCookies = cookies.filter((c) => c.domain === activeDomain);

  const handleAddDomainSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomainInput.trim()) return;
    addDomain(newDomainInput.trim());
    setNewDomainInput('');
    setShowAddDomain(false);
  };

  const handleCreateCookie = () => {
    if (!activeDomain) return;
    addCookie({
      domain: activeDomain,
      name: 'new_cookie',
      value: 'value_123',
      path: '/',
      httpOnly: false,
      secure: false,
    });
  };

  // Portal: an ancestor with a transform/filter made `fixed` relative to the sidebar and clipped the dialog on the left.
  return createPortal(
    <div data-testid="cookie-manager-modal" role="dialog" aria-modal="true" aria-label="Manage Cookies" className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-background border border-border rounded-lg shadow-2xl w-full max-w-5xl h-[560px] max-h-[90vh] flex flex-col overflow-hidden text-text">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-surface">
          <div className="flex items-center gap-2">
            <Cookie className="text-primary w-5 h-5" />
            <h2 className="text-base font-semibold text-text">Manage Cookies</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 hover:bg-border text-text-muted hover:text-text rounded transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body: Sidebar + Main Table */}
        <div className="flex flex-1 min-h-0">
          {/* Domains Sidebar */}
          <div className="w-56 border-r border-border bg-surface flex flex-col">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Domains</span>
              <button
                data-testid="cookie-add-domain-toggle"
                onClick={() => setShowAddDomain(!showAddDomain)}
                className="text-xs text-primary hover:text-primary flex items-center gap-1 font-medium"
              >
                <Plus size={13} />
                <span>Add</span>
              </button>
            </div>

            {/* Add domain inline form */}
            {showAddDomain && (
              <form onSubmit={handleAddDomainSubmit} className="p-2 border-b border-border bg-surface">
                <input
                  type="text"
                  data-testid="cookie-new-domain-input"
                  placeholder="e.g. example.com"
                  value={newDomainInput}
                  onChange={(e) => setNewDomainInput(e.target.value)}
                  className="w-full text-xs px-2 py-1 bg-background border border-border rounded text-text focus:border-primary focus-visible:outline-none focus-visible:border-primary mb-1.5"
                  autoFocus
                />
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setShowAddDomain(false)}
                    className="text-[11px] px-2 py-0.5 text-text-muted hover:text-text"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    data-testid="cookie-new-domain-submit"
                    className="text-[11px] px-2.5 py-0.5 bg-primary-strong hover:bg-primary/90 text-white rounded font-medium"
                  >
                    Add
                  </button>
                </div>
              </form>
            )}

            {/* Domains List */}
            <div className="flex-1 overflow-y-auto py-1">
              {domains.length === 0 ? (
                <div className="p-4 text-xs text-center text-text-muted">No domains yet.</div>
              ) : (
                domains.map((dom) => {
                  const count = cookies.filter((c) => c.domain === dom).length;
                  const isSelected = activeDomain === dom;
                  return (
                    <div
                      key={dom}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedDomain(dom); } }}
                      data-testid={`cookie-domain-${dom}`}
                      onClick={() => setSelectedDomain(dom)}
                      className={`group flex items-center justify-between px-3 py-2 text-xs cursor-pointer border-l-2 transition ${
                        isSelected
                          ? 'border-primary bg-border text-text font-medium'
                          : 'border-transparent text-text-muted hover:bg-border hover:text-text'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Globe size={13} className={isSelected ? 'text-primary' : 'text-text-muted'} />
                        <span className="truncate">{dom}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] bg-border px-1.5 py-0.2 rounded text-text-muted">
                          {count}
                        </span>
                        <button
                          data-testid={`cookie-delete-domain-${dom}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteDomain(dom);
                          }}
                          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-text-muted hover:text-red-500 p-0.5 rounded transition"
                          title="Delete domain"
                          aria-label={`Delete domain ${dom}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Cookies Details Panel */}
          <div className="flex-1 flex flex-col bg-background min-h-0">
            {/* Action Bar */}
            <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-surface">
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">Domain:</span>
                <span className="text-xs font-semibold text-text">{activeDomain || 'None'}</span>
              </div>
              <div className="flex items-center gap-2">
              <button
                data-testid="cookie-delete-all-btn"
                onClick={() => { if (cookies.length > 0) deleteAllCookies(); }}
                disabled={cookies.length === 0}
                className="flex items-center gap-1 text-xs px-3 py-1.5 border border-border hover:border-red-500 hover:text-red-500 disabled:opacity-50 text-text-muted rounded font-medium transition"
              >
                <Trash2 size={13} />
                <span>Delete All</span>
              </button>
              <button
                data-testid="cookie-add-btn"
                onClick={handleCreateCookie}
                disabled={!activeDomain}
                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-primary-strong hover:bg-primary/90 disabled:opacity-50 text-white rounded font-medium transition"
              >
                <Plus size={13} />
                <span>Add Cookie</span>
              </button>
              </div>
            </div>

            {/* Cookies Table */}
            <div className="flex-1 overflow-y-auto p-4">
              {domainCookies.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-text-muted text-xs">
                  <Cookie size={32} className="text-text-muted mb-2" />
                  <p>No cookies for {activeDomain || 'this domain'}.</p>
                  <p className="text-[11px] text-text-muted mt-1">Click "Add Cookie" above to create one.</p>
                </div>
              ) : (
                <div className="border border-border rounded-md overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface text-text-muted border-b border-border font-semibold">
                      <tr>
                        <th className="px-3 py-2 w-1/4">Name</th>
                        <th className="px-3 py-2">Value</th>
                        <th className="px-3 py-2 w-20">Path</th>
                        <th className="px-3 py-2 w-44">Expires</th>
                        <th className="px-2 py-2 text-center w-20">HttpOnly</th>
                        <th className="px-2 py-2 text-center w-16">Secure</th>
                        <th className="px-2 py-2 text-center w-12"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {domainCookies.map((cookie) => (
                        <tr key={cookie.id} data-testid="cookie-row" className="hover:bg-surface transition">
                          <td className="px-3 py-1.5">
                            <input
                              type="text"
                              data-testid="cookie-name-input"
                              value={cookie.name}
                              onChange={(e) => updateCookie(cookie.id, { name: e.target.value })}
                              aria-label="Cookie name"
                              className="w-full bg-transparent text-text outline-none border-b border-transparent focus:border-primary font-mono text-xs"
                              placeholder="Name"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              type="text"
                              data-testid="cookie-value-input"
                              value={cookie.value}
                              onChange={(e) => updateCookie(cookie.id, { value: e.target.value })}
                              title={cookie.value}
                              aria-label="Cookie value"
                              className="w-full bg-transparent text-text outline-none border-b border-transparent focus:border-primary font-mono text-xs"
                              placeholder="Value"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              type="text"
                              data-testid="cookie-path-input"
                              value={cookie.path}
                              onChange={(e) => updateCookie(cookie.id, { path: e.target.value })}
                              aria-label="Cookie path"
                              className="w-full bg-transparent text-text-muted outline-none border-b border-transparent focus:border-primary font-mono text-xs"
                              placeholder="/"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              type="text"
                              data-testid="cookie-expires-input"
                              value={cookie.expires || ''}
                              onChange={(e) => updateCookie(cookie.id, { expires: e.target.value || undefined })}
                              aria-label="Cookie expires"
                              className="w-full bg-transparent text-text-muted outline-none border-b border-transparent focus:border-primary font-mono text-xs"
                              placeholder="Session"
                              title="ISO date, e.g. 2030-01-01T00:00:00Z. Empty = session cookie"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={cookie.httpOnly}
                              onChange={(e) => updateCookie(cookie.id, { httpOnly: e.target.checked })}
                              aria-label="HttpOnly"
                              className="rounded border-border text-primary focus:ring-0 cursor-pointer"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={cookie.secure}
                              onChange={(e) => updateCookie(cookie.id, { secure: e.target.checked })}
                              aria-label="Secure"
                              className="rounded border-border text-primary focus:ring-0 cursor-pointer"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              data-testid="cookie-delete-btn"
                              onClick={() => deleteCookie(cookie.id)}
                              className="text-text-muted hover:text-red-500 p-1 rounded transition"
                              title="Delete cookie"
                              aria-label={`Delete cookie ${cookie.name}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border bg-surface flex justify-between items-center text-xs text-text-muted">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-600 dark:text-emerald-400" />
            <span>Cookies matching request hostnames are automatically attached when sent.</span>
          </div>
          <button
            data-testid="cookie-close-btn"
            onClick={onClose}
            className="px-4 py-1.5 bg-border hover:bg-border text-text rounded font-medium transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
