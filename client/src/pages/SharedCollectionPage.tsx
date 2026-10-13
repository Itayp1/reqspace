import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/axios';
import { Play } from 'lucide-react';
import { sendRequest, EXTENSION_NOT_INSTALLED_ERROR } from '../transport';
import { useExtensionStore } from '../store/extensionStore';

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
    return <div data-testid="shared-collection-error" className="flex h-screen items-center justify-center text-red-500 font-bold text-xl">{error}</div>;
  }

  if (!data) {
    return <div className="flex h-screen items-center justify-center">Loading shared collection...</div>;
  }

  return (
    <div className="min-h-screen bg-background text-text p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 border-b border-border pb-4">
          <h1 data-testid="shared-collection-name" className="text-3xl font-bold mb-2">{data.collection.name}</h1>
          <p className="text-text-muted">Shared Collection (Expires {new Date(data.expiresAt).toLocaleString()})</p>
        </div>

        <div className="space-y-4">
          {data.requests.map((req: any, index: number) => (
            <div key={index} data-testid="shared-request-row" className="border border-border rounded bg-surface overflow-hidden">
              <div className="p-4 flex items-center justify-between border-b border-border bg-background">
                <div className="flex items-center gap-3">
                  <span className={'text-xs font-bold px-2 py-1 rounded ' + (
                    req.method === 'GET' ? 'bg-green-500/20 text-green-500' :
                    req.method === 'POST' ? 'bg-blue-500/20 text-blue-500' :
                    req.method === 'PUT' ? 'bg-orange-500/20 text-orange-500' :
                    req.method === 'DELETE' ? 'bg-red-500/20 text-red-500' : 'bg-gray-500/20 text-gray-500'
                  )}>
                    {req.method}
                  </span>
                  <span data-testid="shared-request-name" className="font-medium">{req.name}</span>
                  <span data-testid="shared-request-url" className="text-text-muted text-sm">{req.url}</span>
                </div>
                <button
                  data-testid="shared-request-run-btn"
                  aria-label={`Run ${req.name}`}
                  onClick={() => executeRequest(req, index)}
                  disabled={executing === index}
                  className="bg-primary text-white p-2 rounded hover:bg-orange-600 disabled:opacity-50"
                >
                  <Play size={16} />
                </button>
              </div>
              
              {results[index] && (
                <div className="p-4 bg-[#1e1e1e]">
                  <pre data-testid="shared-request-result" className="text-xs text-green-400 overflow-x-auto">
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
