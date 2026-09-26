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
  const [executing, setExecuting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, any>>({});
  const { setShowDownloadModal } = useExtensionStore();

  useEffect(() => {
    api.get('/share/' + shortId)
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.message || 'Failed to load shared collection'));
  }, [shortId]);

  const executeRequest = async (req: any) => {
    setExecuting(req._id);
    try {
      const response = await sendRequest({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body
      });
      setResults(prev => ({ ...prev, [req._id]: response }));
    } catch (err: any) {
      if ((err as any).code === EXTENSION_NOT_INSTALLED_ERROR) {
        setShowDownloadModal(true);
      } else {
        setResults(prev => ({ ...prev, [req._id]: err.response?.data || err.message }));
      }
    }
    setExecuting(null);
  };

  if (error) {
    return <div className="flex h-screen items-center justify-center text-red-500 font-bold text-xl">{error}</div>;
  }

  if (!data) {
    return <div className="flex h-screen items-center justify-center">Loading shared collection...</div>;
  }

  return (
    <div className="min-h-screen bg-background text-text p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 border-b border-border pb-4">
          <h1 className="text-3xl font-bold mb-2">{data.collection.name}</h1>
          <p className="text-text-muted">Shared Collection (Expires {new Date(data.expiresAt).toLocaleString()})</p>
        </div>

        <div className="space-y-4">
          {data.requests.map((req: any) => (
            <div key={req._id} className="border border-border rounded bg-surface overflow-hidden">
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
                  <span className="font-medium">{req.name}</span>
                  <span className="text-text-muted text-sm">{req.url}</span>
                </div>
                <button
                  onClick={() => executeRequest(req)}
                  disabled={executing === req._id}
                  className="bg-primary text-white p-2 rounded hover:bg-orange-600 disabled:opacity-50"
                >
                  <Play size={16} />
                </button>
              </div>
              
              {results[req._id] && (
                <div className="p-4 bg-[#1e1e1e]">
                  <pre className="text-xs text-green-400 overflow-x-auto">
                    {JSON.stringify(results[req._id], null, 2)}
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
