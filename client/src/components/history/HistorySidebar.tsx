import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useRequestStore } from '../../store/requestStore';
import { Trash2, Save, Search } from 'lucide-react';
import api from '../../api/axios';
import { ConfirmModal } from '../common/ConfirmModal';
import { SaveRequestModal } from '../request/SaveRequestModal';

export default function HistorySidebar() {
  const { activeWorkspace } = useAuthStore();
  const { setActiveRequest } = useRequestStore();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchHistory = async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const res = await api.get(`/workspaces/${activeWorkspace._id}/history`);
      setHistory(res.data.items);
    } catch (err) {
      console.error('Failed to fetch history', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [activeWorkspace]);

  const handleClearHistory = async () => {
    if (!activeWorkspace) return;
    try {
      await api.delete(`/workspaces/${activeWorkspace._id}/history`);
      setHistory([]);
    } catch (err) {
      console.error(err);
    }
    setShowClearConfirm(false);
  };

  const handleReplay = (item: any) => {
    setActiveRequest({
      name: item.requestSnapshot.url,
      method: item.requestSnapshot.method,
      url: item.requestSnapshot.url,
      headers: Object.entries(item.requestSnapshot.headers || {}).map(([k, v]) => ({
        key: k, value: v as string, enabled: true, description: '',
      })),
      params: item.requestSnapshot.params || [],
      auth: { type: 'none' },
      body: { mode: 'raw', raw: item.requestSnapshot.body || '' },
    });
  };

  const handleSaveFromHistory = (item: any, e: React.MouseEvent) => {
    e.stopPropagation();
    // Set the active request from history item
    setActiveRequest({
      name: item.requestSnapshot.url,
      method: item.requestSnapshot.method,
      url: item.requestSnapshot.url,
      headers: Object.entries(item.requestSnapshot.headers || {}).map(([k, v]) => ({
        key: k, value: v as string, enabled: true, description: '',
      })),
      params: item.requestSnapshot.params || [],
      auth: { type: 'none' },
      body: { mode: 'raw', raw: item.requestSnapshot.body || '' },
    });
    setShowSaveModal(true);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.delete(`/history/${id}`);
      setHistory(history.filter(h => h._id !== id));
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

  const filteredHistory = history.filter(item => 
    item.requestSnapshot.url.toLowerCase().includes(searchQuery.toLowerCase()) || 
    item.requestSnapshot.method.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0 bg-surface">
        <div className="p-3 border-b border-border flex justify-between items-center">
          <span className="text-sm font-semibold text-text">History</span>
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
            title="Clear All"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear All
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
            filteredHistory.map(item => (
              <div
                key={item._id}
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
                      {new Date(item.executedAt).toLocaleString()}
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
            ))
          )}
        </div>
      </div>

      {/* Confirm Clear Modal */}
      {showClearConfirm && (
        <ConfirmModal
          title="Clear History"
          message="Are you sure you want to clear all request history? This cannot be undone."
          confirmLabel="Clear All"
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
