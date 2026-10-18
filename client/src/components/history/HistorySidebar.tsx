import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useRequestStore } from '../../store/requestStore';
import { Trash2, Save, Search } from 'lucide-react';
import api from '../../api/axios';
import { ConfirmModal } from '../common/ConfirmModal';
import { customConfirm } from '../../utils/dialog';
import { SaveRequestModal } from '../request/SaveRequestModal';
import { useSettingsStore } from '../../store/settingsStore';
import { subscribeHistoryUpdated } from '../../utils/historySync';

const PAGE_SIZE = 50;

export default function HistorySidebar() {
  const { settings, updateSettings } = useSettingsStore();
  const { activeWorkspace } = useAuthStore();
  const { setActiveRequest } = useRequestStore();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // Page 1 replaces the list; later pages are appended ("Load more").
  const fetchHistory = async (pageNum = 1) => {
    if (!activeWorkspace) return;
    if (pageNum === 1) setLoading(true); else setLoadingMore(true);
    try {
      const res = await api.get(`/workspaces/${activeWorkspace._id}/history`, { params: { page: pageNum, limit: PAGE_SIZE } });
      setHistory(prev => pageNum === 1 ? res.data.items : [...prev, ...res.data.items]);
      setTotal(res.data.total ?? res.data.items.length);
      setPage(pageNum);
    } catch (err) {
      console.error('Failed to fetch history', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [activeWorkspace]);

  useEffect(() => {
    // Also fires for requests sent from another tab of the same browser.
    return subscribeHistoryUpdated(() => { fetchHistory(1); });
  }, [activeWorkspace]);

  const isFiltered = searchQuery.trim() !== '';

  // With a search active only the entries on screen are removed; with none,
  // the whole workspace history is cleared.
  const handleClearHistory = async () => {
    if (!activeWorkspace) return;
    try {
      if (isFiltered) {
        const ids = filteredHistory.map(h => h._id);
        const results = await Promise.allSettled(ids.map(id => api.delete(`/history/${id}`)));
        const removed = new Set(ids.filter((_, i) => results[i].status === 'fulfilled'));
        setHistory(prev => prev.filter(h => !removed.has(h._id)));
        setTotal(t => Math.max(0, t - removed.size));
      } else {
        await api.delete(`/workspaces/${activeWorkspace._id}/history`);
        setHistory([]);
        setTotal(0);
      }
    } catch (err) {
      console.error(err);
    }
    setShowClearConfirm(false);
  };

  // The snapshot holds the body exactly as it was sent: a string for raw /
  // urlencoded / GraphQL, an { _isFormData, items } object for form-data, or
  // nothing at all. Forcing every one of those into a raw editor put an
  // object into Monaco and turned a GET into a request with an empty body.
  const bodyFromSnapshot = (body: any) => {
    if (body && typeof body === 'object' && body._isFormData) {
      return {
        mode: 'form-data' as const,
        formData: (body.items || []).filter((i: any) => i && i.key).map((i: any) => (
          i.type === 'file'
            ? { key: i.key, value: '', enabled: true, type: 'file' as const }
            : { key: i.key, value: String(i.value ?? ''), enabled: true, type: 'text' as const }
        )),
      };
    }
    if (body == null || body === '') return { mode: 'none' as const };
    return { mode: 'raw' as const, raw: typeof body === 'string' ? body : JSON.stringify(body, null, 2) };
  };

  const requestFromHistory = (item: any) => ({
    name: item.requestSnapshot.url,
    method: item.requestSnapshot.method,
    url: item.requestSnapshot.url,
    headers: Object.entries(item.requestSnapshot.headers || {}).map(([k, v]) => ({
      key: k, value: String(v ?? ''), enabled: true, description: '',
    })),
    params: item.requestSnapshot.params || [],
    auth: { type: 'none' as const },
    body: bodyFromSnapshot(item.requestSnapshot.body),
  });

  const handleReplay = (item: any) => {
    setActiveRequest(requestFromHistory(item));
  };

  const handleSaveFromHistory = (item: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveRequest(requestFromHistory(item));
    setShowSaveModal(true);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.delete(`/history/${id}`);
      setHistory(history.filter(h => h._id !== id));
      setTotal(t => Math.max(0, t - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const getMethodColor = (method: string) => {
    switch (method?.toUpperCase()) {
      case 'GET': return 'text-green-500';
      case 'POST': return 'text-yellow-500';
      case 'PUT': return 'text-blue-400';
      case 'DELETE': return 'text-red-500';
      default: return 'text-gray-400';
    }
  };

  // Matches URL, method or response status code (e.g. "404").
  const filteredHistory = history.filter(item => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return String(item.requestSnapshot?.url ?? '').toLowerCase().includes(q)
      || String(item.requestSnapshot?.method ?? '').toLowerCase().includes(q)
      || String(item.responseSnapshot?.status ?? item.statusCode ?? '').includes(q);
  });

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0 bg-surface">
        <div className="p-3 border-b border-border flex justify-between items-center">
          <span className="text-sm font-semibold text-text">History</span>
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
            title={isFiltered ? 'Clear the filtered entries' : 'Clear All'}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {isFiltered ? 'Clear Filtered' : 'Clear All'}
          </button>
        </div>

        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-background border border-border rounded pl-7 pr-2 py-1.5 text-xs text-text outline-none focus:border-primary transition-colors"
            />
          </div>
          {settings?.saveHistory === false && (
            <p className="mt-2 text-[11px] text-yellow-500" data-testid="history-saving-off-note">
              History saving is off - new requests are not recorded.
            </p>
          )}
          <div className="flex items-center justify-between mt-3">
            <label htmlFor="saveHistoryToggle" className="text-[11px] text-text-muted flex-1 cursor-pointer">
              Save Request History
            </label>
            <input
              type="checkbox"
              id="saveHistoryToggle"
              checked={settings?.saveHistory !== false}
              onChange={async (e) => {
                const checked = e.target.checked;
                if (!checked) {
                  if (await customConfirm('Confirm Action', "Disabling this will delete all your previously saved request history. Are you sure you want to proceed?")) {
                    updateSettings({ saveHistory: false });
                    try {
                      if (activeWorkspace) await api.delete('/history', { params: { workspaceId: activeWorkspace._id } });
                      setHistory([]);
                      setTotal(0);
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

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-text-muted">Loading...</div>
          ) : filteredHistory.length === 0 ? (
            <div className="p-8 text-center text-sm text-text-muted">
              <div className="text-2xl mb-2">🕰️</div>
              No history found.
            </div>
          ) : (
            <>
            {filteredHistory.map(item => (
              <div
                key={item._id}
                data-testid="history-item"
                className="px-3 py-2.5 border-b border-border hover:bg-background cursor-pointer group"
                onClick={() => handleReplay(item)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[11px] font-bold w-10 shrink-0 ${getMethodColor(item.requestSnapshot.method)}`}>
                        {item.requestSnapshot.method}
                      </span>
                      <span
                        className={`text-xs font-medium ${item.responseSnapshot?.status >= 400 ? 'text-red-400' : 'text-green-400'}`}
                      >
                        {item.responseSnapshot?.status}
                      </span>
                    </div>
                    <div className="text-xs text-text-muted truncate pl-12">
                      {item.requestSnapshot.url}
                    </div>
                    <div className="text-[10px] text-text-muted/60 mt-0.5 pl-12">
                      {new Date(item.createdAt).toLocaleString()}
                    </div>
                  </div>
                  {/* Action buttons (visible on hover) */}
                  <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                    <button
                      className="p-1 text-text-muted hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                      onClick={(e) => handleSaveFromHistory(item, e)}
                      title="Save to Collection"
                    >
                      <Save className="w-3.5 h-3.5" />
                    </button>
                    <button
                      className="p-1 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                      onClick={(e) => handleDelete(item._id, e)}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {history.length < total && (
              <button
                data-testid="history-load-more"
                onClick={() => fetchHistory(page + 1)}
                disabled={loadingMore}
                className="w-full p-2 text-xs text-text-muted hover:text-text hover:bg-background disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : `Load more (${history.length} of ${total})`}
              </button>
            )}
            </>
          )}
        </div>
      </div>

      {/* Confirm Clear Modal */}
      {showClearConfirm && (
        <ConfirmModal
          title="Clear History"
          message={isFiltered
            ? `Delete the ${filteredHistory.length} history entries matching "${searchQuery.trim()}"? Other entries are kept. This cannot be undone.`
            : 'Are you sure you want to clear all request history? This cannot be undone.'}
          confirmLabel={isFiltered ? 'Clear Filtered' : 'Clear All'}
          onConfirm={handleClearHistory}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}

      {/* Save to Collection Modal */}
      {showSaveModal && (
        <SaveRequestModal onClose={() => setShowSaveModal(false)} />
      )}
    </>
  );
}
