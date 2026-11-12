import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { Play, GitFork } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { sendRequest, EXTENSION_NOT_INSTALLED_ERROR } from '../transport';
import { useExtensionStore } from '../store/extensionStore';

const METHOD_STYLE: Record<string, string> = {
  GET: 'bg-get/15 text-get', POST: 'bg-post/15 text-post', PUT: 'bg-put/15 text-put',
  PATCH: 'bg-patch/15 text-patch dark:bg-text/15 dark:text-text', DELETE: 'bg-delete/15 text-delete',
};

export default function SharedCollectionPage() {
  const { shortId } = useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  // Keyed by list index, not by `req._id`: the share endpoint deliberately
  // projects a safe view with no internal ids, so every row's `_id` was
  // undefined. React warned about duplicate keys, and because all rows shared
  // the one `undefined` key, running a single request showed its result under
  // every row and disabled every Play button at once.
  const [executing, setExecuting] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, any>>({});
  const { setShowDownloadModal } = useExtensionStore();
  const navigate = useNavigate();
  const { isAuthenticated, activeWorkspace } = useAuthStore();
  const [forking, setForking] = useState(false);

  // A signed-in viewer can take a copy into the workspace they are working in.
  const forkToWorkspace = async () => {
    if (!activeWorkspace) return;
    setForking(true);
    try {
      await api.post('/share/' + shortId + '/fork', { workspaceId: activeWorkspace._id });
      useToastStore.getState().addToast('success', 'Collection forked to your workspace');
      navigate('/');
    } catch (err: any) {
      useToastStore.getState().addToast('error', err.response?.data?.message || 'Fork failed');
    }
    setForking(false);
  };

  useEffect(() => {
    api.get('/share/' + shortId)
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.message || 'Failed to load shared collection'));
  }, [shortId]);

  const executeRequest = async (req: any, index: number) => {
    setExecuting(index);
    try {
      const response = await sendRequest({
        method: req.method,
        url: req.url,
        // The safe view returns headers as a key/value list; the transport
        // wants a plain object.
        headers: Array.isArray(req.headers)
          ? req.headers.reduce((acc: Record<string, string>, h: any) => {
              if (h?.key && h.enabled !== false) acc[h.key] = h.value ?? '';
              return acc;
            }, {})
          : (req.headers || {}),
        body: req.body
      });
      setResults(prev => ({ ...prev, [index]: response }));
    } catch (err: any) {
      if ((err as any).code === EXTENSION_NOT_INSTALLED_ERROR) {
        setShowDownloadModal(true);
      } else {
        setResults(prev => ({ ...prev, [index]: err.response?.data || err.message }));
      }
    }
    setExecuting(null);
  };

  if (error) {
    return <div data-testid="shared-collection-error" role="alert" className="flex h-screen items-center justify-center bg-background text-delete font-semibold text-xl p-8 text-center text-balance">{error}</div>;
  }

  if (!data) {
    return <div role="status" className="flex h-screen items-center justify-center bg-background text-text-muted">Loading shared collection…</div>;
  }

  return (
    <div className="min-h-screen bg-background text-text p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 data-testid="shared-collection-name" className="text-2xl font-bold mb-1 break-words">{data.collection.name}</h1>
          <p className="text-sm text-text-muted">Shared Collection (Expires {new Date(data.expiresAt).toLocaleString()})</p>
          {isAuthenticated && activeWorkspace && (
            <button
              data-testid="share-page-fork"
              onClick={forkToWorkspace}
              disabled={forking}
              className="mt-3 inline-flex items-center gap-2 bg-primary-strong text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-primary-strong-hover disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
            >
              <GitFork size={16} aria-hidden="true" /> Fork to My Workspace
            </button>
          )}
        </div>

        <div className="space-y-4">
          {data.requests.map((req: any, index: number) => (
            <div key={index} data-testid="shared-request-row" className="border border-border rounded-lg bg-surface overflow-hidden">
              <div className="p-4 flex items-center justify-between border-b border-border bg-background">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={'text-xs font-bold px-2 py-1 rounded shrink-0 ' + (METHOD_STYLE[req.method] ?? 'bg-text-muted/20 text-text-muted')}>
                    {req.method}
                  </span>
                  <span data-testid="shared-request-name" className="font-medium truncate">{req.name}</span>
                  <span data-testid="shared-request-url" title={req.url} className="text-text-muted text-sm font-mono truncate">{req.url}</span>
                </div>
                <button
                  data-testid="shared-request-run-btn"
                  aria-label={`Run ${req.name}`}
                  onClick={() => executeRequest(req, index)}
                  disabled={executing === index}
                  className="bg-primary-strong text-white p-2 rounded hover:bg-primary-strong-hover disabled:opacity-50 shrink-0 ml-3 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
                >
                  <Play size={16} aria-hidden="true" />
                </button>
              </div>
              
              {results[index] && (
                <div className="p-4 bg-surface">
                  <pre data-testid="shared-request-result" className="text-xs font-mono text-text overflow-x-auto">
                    {JSON.stringify(results[index], null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
          {data.requests.length === 0 && (
            <div className="text-center text-text-muted p-8">This collection has no requests.</div>
          )}
        </div>
      </div>
    </div>
  );
}
