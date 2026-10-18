import React, { useState } from 'react';
import { X, Play, StopCircle, Activity } from 'lucide-react';
import { useRequestStore, type ActiveRequest } from '../../store/requestStore';
import { useSettingsStore, getLocalProxyConfig } from '../../store/settingsStore';
import { sendRequest } from '../../transport';
import { useCollectionStore, type Folder } from '../../store/collectionStore';
import { resolveAllVariables } from '../../utils/variables';
import { applyRequestAuth, resolveInheritedAuth, folderChainClosestFirst } from '../../utils/requestAuth';
import { stripJsonComments } from '../../utils/jsonComments';

export const MAX_ITERATIONS = 10000;
export const MAX_CONCURRENCY = 100;

/** Returns an error message for unusable iterations/concurrency values, or null. */
export function validateLoadTestConfig(iterations: unknown, concurrency: unknown): string | null {
  const it = Number(iterations);
  const cc = Number(concurrency);
  if (iterations === '' || iterations === null || !Number.isInteger(it) || it < 1 || it > MAX_ITERATIONS) {
    return `Iterations must be a whole number between 1 and ${MAX_ITERATIONS}`;
  }
  if (concurrency === '' || concurrency === null || !Number.isInteger(cc) || cc < 1 || cc > MAX_CONCURRENCY) {
    return `Concurrency must be a whole number between 1 and ${MAX_CONCURRENCY}`;
  }
  return null;
}

/** p-th percentile (nearest-rank) of an unsorted list. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

interface Props {
  onClose: () => void;
}

function buildIterationRequest(req: ActiveRequest) {
  const { collections, foldersByCollection } = useCollectionStore.getState();
  const allFolders = Object.values(foldersByCollection).filter((v): v is Folder[] => Array.isArray(v)).flat();
  const colId = req.collectionId;
  const collection = collections.find(c => c._id === colId);
  const resolve = (v: string) => resolveAllVariables(v, colId);

  let headers: Record<string, string> = {};
  for (const h of req.headers || []) {
    if (!h.enabled || !h.key) continue;
    const existing = Object.keys(headers).find(k => k.toLowerCase() === h.key.toLowerCase());
    const value = resolve(h.value);
    if (existing) headers[existing] = `${headers[existing]}, ${value}`;
    else headers[h.key] = value;
  }

  const auth = resolveInheritedAuth(req.auth, folderChainClosestFirst(req.folderId, allFolders), collection);
  const applied = applyRequestAuth({ auth, headers, url: resolve(req.url), resolve });
  headers = applied.headers;
  const url = applied.url;

  const mode = req.body?.mode;
  let body: any = undefined;
  if (mode === 'raw') {
    const raw = req.body?.raw || '';
    body = resolve((req.body?.rawLanguage ?? 'json') === 'json' ? stripJsonComments(raw) : raw);
  } else if (mode === 'urlencoded') {
    const params = new URLSearchParams();
    (req.body?.urlencoded || []).filter(i => i.enabled && i.key).forEach(i => params.append(i.key, resolve(i.value)));
    body = params.toString();
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (mode === 'graphql') {
    const query = resolve(req.body?.graphql?.query || '');
    const varsStr = resolve(req.body?.graphql?.variables || '{}');
    let variables: unknown = varsStr;
    try { variables = JSON.parse(varsStr); } catch { /* sent as a string */ }
    body = JSON.stringify({ query, variables });
    headers['Content-Type'] = 'application/json';
  } else if (mode === 'form-data') {
    const items = (req.body?.formData || [])
      .filter(i => i.enabled && i.key && i.type !== 'file')
      .map(i => ({ type: 'text', key: i.key, value: resolve(i.value) }));
    body = { _isFormData: true, items };
  }
  return { method: req.method, url, headers, body };
}

export function LoadTestModal({ onClose }: Props) {
  const { activeRequest } = useRequestStore();
  
  const [iterations, setIterations] = useState(10);
  const [concurrency, setConcurrency] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const [results, setResults] = useState<{
    total: number;
    success: number;
    failed: number;
    minTime: number;
    maxTime: number;
    avgTime: number;
    p95Time: number;
    rps: number;
    times: number[];
  }>({ total: 0, success: 0, failed: 0, minTime: 0, maxTime: 0, avgTime: 0, p95Time: 0, rps: 0, times: [] });
  const [configError, setConfigError] = useState<string | null>(null);

  const abortControllerRef = React.useRef<AbortController | null>(null);

  if (!activeRequest) return null;

  const handleStart = async () => {
    if (isRunning) return;
    const error = validateLoadTestConfig(iterations, concurrency);
    setConfigError(error);
    if (error) return;
    setIsRunning(true);
    setProgress(0);
    setResults({ total: 0, success: 0, failed: 0, minTime: 0, maxTime: 0, avgTime: 0, p95Time: 0, rps: 0, times: [] });
    const runStart = Date.now();
    
    abortControllerRef.current = new AbortController();
    
    let completed = 0;
    const times: number[] = [];
    let success = 0;
    let failed = 0;

    const worker = async () => {
      while (completed < iterations && !abortControllerRef.current?.signal.aborted) {
        // Need to claim a task
        completed++;
        setProgress(completed);
        
        const start = Date.now();
        try {
          const settings = useSettingsStore.getState().settings;
          // Built per iteration so {{$guid}}/{{$timestamp}} get a fresh value each time.
          const built = buildIterationRequest(activeRequest);
          const res = await sendRequest({
            ...built,
            followRedirects: settings.followRedirects,
            verifySsl: settings.verifySsl,
            timeout: settings.timeout,
            localProxy: getLocalProxyConfig(),
          });
          // An HTTP error status is a failed request, not a success.
          if (res.status >= 400 || res.status === 0) failed++;
          else success++;
        } catch (e: any) {
          if (e.name !== 'CanceledError') failed++;
        }
        const time = Date.now() - start;
        times.push(time);
        
        setResults({
          total: times.length,
          success,
          failed,
          minTime: Math.min(...times),
          maxTime: Math.max(...times),
          avgTime: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
          p95Time: percentile(times, 95),
          rps: Math.round((times.length / Math.max(0.001, (Date.now() - runStart) / 1000)) * 100) / 100,
          times
        });
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, iterations) }, () => worker());
    await Promise.allSettled(workers);
    setIsRunning(false);
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    setIsRunning(false);
  };

  return (
    <div data-testid="load-test-modal" className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-[600px] border border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2 text-gray-800 dark:text-gray-100 font-semibold">
            <Activity className="w-5 h-5 text-orange-500" />
            Load Tester
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Iterations</label>
              <input
                type="number"
                data-testid="load-test-iterations"
                min="1"
                max={MAX_ITERATIONS}
                value={Number.isNaN(iterations) ? '' : iterations}
                onChange={e => setIterations(e.target.value === '' ? NaN : Number(e.target.value))}
                disabled={isRunning}
                className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded bg-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Concurrency</label>
              <input
                type="number"
                data-testid="load-test-concurrency"
                min="1"
                max={MAX_CONCURRENCY}
                value={Number.isNaN(concurrency) ? '' : concurrency}
                onChange={e => setConcurrency(e.target.value === '' ? NaN : Number(e.target.value))}
                disabled={isRunning}
                className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded bg-transparent outline-none"
              />
            </div>
          </div>

          {configError && (
            <div data-testid="load-test-error" role="alert" className="text-sm text-red-500">{configError}</div>
          )}

          <div className="p-4 border border-gray-200 dark:border-gray-800 rounded bg-gray-50 dark:bg-gray-800/50">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div data-testid="load-test-success" className="text-2xl font-bold text-green-500">{results.success}</div>
                <div className="text-xs text-gray-500 uppercase">Success</div>
              </div>
              <div>
                <div data-testid="load-test-failed" className="text-2xl font-bold text-red-500">{results.failed}</div>
                <div className="text-xs text-gray-500 uppercase">Failed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-500">{results.avgTime}ms</div>
                <div className="text-xs text-gray-500 uppercase">Avg Response</div>
              </div>
            </div>
            <div className="mt-4 flex justify-between text-xs text-gray-500">
              <span>Min: {results.minTime || 0}ms</span>
              <span>Max: {results.maxTime || 0}ms</span>
              <span data-testid="load-test-p95">p95: {results.p95Time || 0}ms</span>
              <span data-testid="load-test-rps">RPS: {results.rps || 0}</span>
              <span data-testid="load-test-total">Total: {results.total}</span>
            </div>
          </div>
          
          {isRunning && (
            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
              <div className="bg-orange-600 h-2.5 rounded-full transition-all duration-200" style={{ width: `${Math.min(100, (progress / iterations) * 100)}%` }}></div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-2 bg-gray-50 dark:bg-gray-900">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-800">
            Close
          </button>
          {!isRunning ? (
            <button data-testid="load-test-start-btn" onClick={handleStart} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded text-sm font-medium flex items-center gap-1">
              <Play size={16} /> Start
            </button>
          ) : (
            <button data-testid="load-test-stop-btn" onClick={handleStop} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-medium flex items-center gap-1">
              <StopCircle size={16} /> Stop
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
