import { useState } from 'react';
import { X, Play } from 'lucide-react';
import api from '../../api/axios';

export default function RunnerModal({ collectionId, onClose }: { collectionId: string, onClose: () => void }) {
  const [iterations, setIterations] = useState(1);
  const [delay, setDelay] = useState(0);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const handleRun = async () => {
    setRunning(true);
    setResults([]);
    try {
      // In a real implementation, the runner would execute each request sequentially
      // either on the client side using the sandbox/worker, or via a specific backend runner route.
      // For this v1, we will simulate the run or trigger a backend route if it exists.
      
      const res = await api.get(`/collections/all/requests`);
      const reqs = res.data.filter((r: any) => r.collectionId === collectionId);
      
      let currentResults = [];
      for (let i = 0; i < iterations; i++) {
        for (const req of reqs) {
          // Simulate run
          await new Promise(resolve => setTimeout(resolve, delay || 100));
          currentResults.push({
            iteration: i + 1,
            requestName: req.name,
            status: 200, // mock
            passed: true,
            time: Math.floor(Math.random() * 200) + 50
          });
          setResults([...currentResults]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-xl w-[800px] h-[600px] flex flex-col border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border bg-surface">
          <h2 className="text-lg font-bold">Collection Runner</h2>
          <button onClick={onClose} className="p-1 hover:bg-border rounded"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="flex flex-1 min-h-0">
          <div className="w-1/3 border-r border-border p-4 bg-surface flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Iterations</label>
              <input 
                type="number" 
                min="1"
                value={iterations} 
                onChange={(e) => setIterations(+e.target.value)}
                className="w-full p-2 border border-border rounded bg-background"
                disabled={running}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Delay (ms)</label>
              <input 
                type="number" 
                min="0"
                value={delay} 
                onChange={(e) => setDelay(+e.target.value)}
                className="w-full p-2 border border-border rounded bg-background"
                disabled={running}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Data File (Optional)</label>
              <input 
                type="file" 
                className="w-full p-2 border border-border rounded bg-background text-sm"
                disabled={running}
              />
            </div>
            <button 
              onClick={handleRun} 
              disabled={running}
              className="mt-4 bg-primary text-white p-3 rounded hover:bg-orange-600 transition flex items-center justify-center gap-2 font-bold disabled:opacity-50"
            >
              <Play className="w-5 h-5" /> {running ? 'Running...' : 'Run Collection'}
            </button>
          </div>

          <div className="flex-1 p-4 overflow-y-auto bg-background">
            <h3 className="font-bold mb-4">Results</h3>
            {results.length === 0 && !running && <div className="text-text-muted text-sm">Configure settings and click Run.</div>}
            {results.map((r, i) => (
              <div key={i} className="mb-2 p-3 border border-border rounded flex justify-between items-center text-sm">
                <div>
                  <span className="font-bold text-text-muted mr-2">Iter {r.iteration}</span>
                  <span className="font-medium">{r.requestName}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-green-500 font-bold">{r.status} OK</span>
                  <span className="text-text-muted">{r.time} ms</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
