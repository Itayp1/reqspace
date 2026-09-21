import React, { useState } from 'react';
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
  } = useCookieStore();

  const [newDomainInput, setNewDomainInput] = useState('');
  const [showAddDomain, setShowAddDomain] = useState(false);

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

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-4xl h-[560px] flex flex-col overflow-hidden text-gray-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800 bg-gray-850">
          <div className="flex items-center gap-2">
            <Cookie className="text-orange-500 w-5 h-5" />
            <h2 className="text-base font-semibold text-gray-100">Manage Cookies</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-750 text-gray-400 hover:text-gray-200 rounded transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body: Sidebar + Main Table */}
        <div className="flex flex-1 min-h-0">
          {/* Domains Sidebar */}
          <div className="w-56 border-r border-gray-800 bg-gray-900/60 flex flex-col">
            <div className="p-3 border-b border-gray-800 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Domains</span>
              <button
                onClick={() => setShowAddDomain(!showAddDomain)}
                className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1 font-medium"
              >
                <Plus size={13} />
                <span>Add</span>
              </button>
            </div>

            {/* Add domain inline form */}
            {showAddDomain && (
              <form onSubmit={handleAddDomainSubmit} className="p-2 border-b border-gray-800 bg-gray-850">
                <input
                  type="text"
                  placeholder="e.g. example.com"
                  value={newDomainInput}
                  onChange={(e) => setNewDomainInput(e.target.value)}
                  className="w-full text-xs px-2 py-1 bg-gray-900 border border-gray-700 rounded text-gray-100 outline-none focus:border-orange-500 mb-1.5"
                  autoFocus
                />
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setShowAddDomain(false)}
                    className="text-[11px] px-2 py-0.5 text-gray-400 hover:text-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="text-[11px] px-2.5 py-0.5 bg-orange-600 hover:bg-orange-500 text-white rounded font-medium"
                  >
                    Add
                  </button>
                </div>
              </form>
            )}

            {/* Domains List */}
            <div className="flex-1 overflow-y-auto py-1">
              {domains.length === 0 ? (
                <div className="p-4 text-xs text-center text-gray-500">No domains yet.</div>
              ) : (
                domains.map((dom) => {
                  const count = cookies.filter((c) => c.domain === dom).length;
                  const isSelected = activeDomain === dom;
                  return (
                    <div
                      key={dom}
                      onClick={() => setSelectedDomain(dom)}
                      className={`group flex items-center justify-between px-3 py-2 text-xs cursor-pointer border-l-2 transition ${
                        isSelected
                          ? 'border-orange-500 bg-gray-800 text-white font-medium'
                          : 'border-transparent text-gray-400 hover:bg-gray-850 hover:text-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Globe size={13} className={isSelected ? 'text-orange-400' : 'text-gray-500'} />
                        <span className="truncate">{dom}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] bg-gray-750 px-1.5 py-0.2 rounded text-gray-400">
                          {count}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteDomain(dom);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 p-0.5 rounded transition"
                          title="Delete domain"
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
          <div className="flex-1 flex flex-col bg-gray-900 min-h-0">
            {/* Action Bar */}
            <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between bg-gray-850/40">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Domain:</span>
                <span className="text-xs font-semibold text-gray-200">{activeDomain || 'None'}</span>
              </div>
              <button
                onClick={handleCreateCookie}
                disabled={!activeDomain}
                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded font-medium transition"
              >
                <Plus size={13} />
                <span>Add Cookie</span>
              </button>
            </div>

            {/* Cookies Table */}
            <div className="flex-1 overflow-y-auto p-4">
              {domainCookies.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 text-xs">
                  <Cookie size={32} className="text-gray-600 mb-2" />
                  <p>No cookies for {activeDomain || 'this domain'}.</p>
                  <p className="text-[11px] text-gray-600 mt-1">Click "Add Cookie" above to create one.</p>
                </div>
              ) : (
                <div className="border border-gray-800 rounded-md overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-800/80 text-gray-400 border-b border-gray-700/60 font-semibold">
                      <tr>
                        <th className="px-3 py-2 w-1/4">Name</th>
                        <th className="px-3 py-2 w-1/3">Value</th>
                        <th className="px-3 py-2 w-20">Path</th>
                        <th className="px-2 py-2 text-center w-16">HttpOnly</th>
                        <th className="px-2 py-2 text-center w-16">Secure</th>
                        <th className="px-2 py-2 text-center w-12">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60">
                      {domainCookies.map((cookie) => (
                        <tr key={cookie.id} className="hover:bg-gray-800/30 transition">
                          <td className="px-3 py-1.5">
                            <input
                              type="text"
                              value={cookie.name}
                              onChange={(e) => updateCookie(cookie.id, { name: e.target.value })}
                              className="w-full bg-transparent text-gray-200 outline-none border-b border-transparent focus:border-orange-500 font-mono text-xs"
                              placeholder="Name"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              type="text"
                              value={cookie.value}
                              onChange={(e) => updateCookie(cookie.id, { value: e.target.value })}
                              className="w-full bg-transparent text-gray-200 outline-none border-b border-transparent focus:border-orange-500 font-mono text-xs"
                              placeholder="Value"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              type="text"
                              value={cookie.path}
                              onChange={(e) => updateCookie(cookie.id, { path: e.target.value })}
                              className="w-full bg-transparent text-gray-300 outline-none border-b border-transparent focus:border-orange-500 font-mono text-xs"
                              placeholder="/"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={cookie.httpOnly}
                              onChange={(e) => updateCookie(cookie.id, { httpOnly: e.target.checked })}
                              className="rounded border-gray-700 text-orange-600 focus:ring-0 cursor-pointer"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={cookie.secure}
                              onChange={(e) => updateCookie(cookie.id, { secure: e.target.checked })}
                              className="rounded border-gray-700 text-orange-600 focus:ring-0 cursor-pointer"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              onClick={() => deleteCookie(cookie.id)}
                              className="text-gray-500 hover:text-red-400 p-1 rounded transition"
                              title="Delete cookie"
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
        <div className="px-5 py-3 border-t border-gray-800 bg-gray-850 flex justify-between items-center text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-500" />
            <span>Cookies matching request hostnames are automatically attached when sent.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded font-medium transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
