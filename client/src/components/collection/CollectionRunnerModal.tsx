import React, { useState, useEffect, useRef } from 'react';
import { X, Play, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useEnvironmentStore } from '../../store/environmentStore';
import { resolveAllVariables } from '../../utils/variables';
import { applyRequestAuth, folderChainClosestFirst, resolveInheritedAuth } from '../../utils/requestAuth';
import { runPreRequestScript, runTestScript } from '../../utils/scripts';
import { useCollectionStore, type Folder } from '../../store/collectionStore';
import { sendRequest, EXTENSION_NOT_INSTALLED_ERROR } from '../../transport';
import { useExtensionStore } from '../../store/extensionStore';
import api from '../../api/axios';
import type { ApiRequest } from '../../store/collectionStore';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { notifyHistoryUpdated } from '../../utils/historySync';

interface CollectionRunnerModalProps {
  collectionId: string;
  collectionName: string;
  onClose: () => void;
}

interface RunResult {
  requestId: string;
  name: string;
  method: string;
  url?: string;
  iteration?: number;
  status?: number;
  statusText?: string;
  time?: number;
  passed?: boolean;
  error?: string;
}

const MAX_ITERATIONS = 1000;

/** RFC 4180 CSV: quoted fields (commas, newlines, "" escapes), CRLF/LF, BOM, blank lines. */
export function parseCsv(input: string): Record<string, string>[] {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter(r => r.some(c => c.trim() !== ''));
  if (nonEmpty.length === 0) return [];
  const headers = nonEmpty[0].map(h => h.trim());
  return nonEmpty.slice(1).map(values => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
    return obj;
  });
}

export const CollectionRunnerModal: React.FC<CollectionRunnerModalProps> = ({
  collectionId,
  collectionName,
  onClose,
}) => {
  const { environments, activeEnvironmentId, setActiveEnvironmentId } = useEnvironmentStore();
  const { setShowDownloadModal } = useExtensionStore();

  // Fetched directly rather than read from the collection tree's store: that
  // store only holds whatever folders the user has actually expanded in the
  // sidebar, so it can't be relied on to have every request in the
  // collection (especially ones nested in folders never opened).
  const [collectionRequests, setCollectionRequests] = useState<ApiRequest[]>([]);
  useEffect(() => {
    api.get(`/collections/${collectionId}/requests`).then(res => setCollectionRequests(res.data)).catch(() => {});
  }, [collectionId]);

  const [isRunning, setIsRunning] = useState(false);
  // A ref, not state: the run loop's `await`s mean it keeps executing across
  // several ticks, and it needs to see a Stop click immediately on its next
  // iteration check rather than waiting for a re-render to read fresh state.
  const stopRequestedRef = useRef(false);
  const [results, setResults] = useState<RunResult[]>([]);
  const [delayMs, setDelayMs] = useState(0);
  const [iterationsText, setIterationsText] = useState('1');
  const [dataArray, setDataArray] = useState<Record<string, any>[]>([]);
  const [dataFileName, setDataFileName] = useState('');
  const [dataFileError, setDataFileError] = useState('');
  const [dataInputKey, setDataInputKey] = useState(0);
  // Requests the user un-ticked; everything else (including later additions) runs.
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const iterations = Number(iterationsText);
  const iterationsValid = /^\d+$/.test(iterationsText.trim()) && iterations >= 1 && iterations <= MAX_ITERATIONS;
  const runnable = collectionRequests.filter(r => !excludedIds.has(r._id));

  const toggleExcluded = (id: string) => setExcludedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const clearDataFile = () => {
    setDataArray([]);
    setDataFileName('');
    setDataFileError('');
    setIterationsText('1');
    setDataInputKey(k => k + 1);
  };

  const exportResults = () => {
    const payload = {
      collection: collectionName,
      exportedAt: new Date().toISOString(),
      iterations,
      results,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${collectionName.replace(/[^\w.-]+/g, '_') || 'collection'}-run-results.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stopRun = () => {
    stopRequestedRef.current = true;
    abortRef.current?.abort();
  };

  // Same as a normal Send: one history row per executed request, unless the
  // user turned "Save Request History" off.
  const recordRunnerHistory = (snapshot: Record<string, unknown>, payload: Record<string, unknown>) => {
    const workspaceId = useAuthStore.getState().activeWorkspace?._id;
    if (useSettingsStore.getState().settings.saveHistory === false || !workspaceId) return;
    api.post(`/workspaces/${workspaceId}/history`, { requestSnapshot: snapshot, testResults: [], ...payload })
      .then(() => notifyHistoryUpdated())
      .catch(err => console.error('Failed to save history', err));
  };

  const runAll = async () => {
    if (runnable.length === 0 || !iterationsValid) return;
    const runList = runnable;
    const abortController = new AbortController();
    abortRef.current = abortController;
    stopRequestedRef.current = false;
    setIsRunning(true);
    
    // We will unroll the runs based on iterations
    const allRuns: RunResult[] = [];
    for (let iter = 0; iter < iterations; iter++) {
      for (const r of runList) {
        allRuns.push({
          requestId: r._id,
          name: iterations > 1 ? `${r.name} (Iter ${iter + 1})` : r.name,
          method: r.method || 'GET',
          url: r.url,
          iteration: iter + 1,
        });
      }
    }
    setResults(allRuns);

    let globalIdx = 0;
    const localVariables = new Map<string, string>(); // Persist across the entire runner session
    const collection = useCollectionStore.getState().collections.find(c => c._id === collectionId);
    let folders: Folder[] = [];
    try {
      const folderRes = await api.get(`/collections/${collectionId}/folders`);
      folders = Array.isArray(folderRes.data) ? folderRes.data : [];
    } catch {
      folders = [];
    }

    for (let iter = 0; iter < iterations; iter++) {
      const iterationData = dataArray[iter] || {};

      for (let i = 0; i < runList.length; i++) {
        if (stopRequestedRef.current) {
          setIsRunning(false);
          return;
        }
        const req: any = runList[i];
        const startTime = Date.now();
        // Captured per request: the setResults updaters below run after this
        // loop has moved on and incremented globalIdx, so reading the variable
        // there wrote every result into the next row and dropped the last one.
        const rowIdx = globalIdx;

        try {
          let nextReqName: string | null | undefined = undefined;

          // Collection, then folders from the outermost in, then the request —
          // the same chain Send runs. Only the request's own scripts used to
          // run here, so a collection-level script (an auth token, say) was
          // silently skipped by the runner.
          const chainRootFirst = [...folderChainClosestFirst(req.folderId, folders)].reverse();
          const preScripts: string[] = [];
          if (collection?.preRequestScript) preScripts.push(collection.preRequestScript);
          for (const f of chainRootFirst) if (f.preRequestScript) preScripts.push(f.preRequestScript);
          if (req.preRequestScript) preScripts.push(req.preRequestScript);
          if (preScripts.length > 0) {
            const preRes = await runPreRequestScript(preScripts.join('\n\n'), collectionId, iterationData, localVariables);
            if (preRes && preRes.nextRequest !== undefined) nextReqName = preRes.nextRequest;
          }

          const resolvedUrl = resolveAllVariables(req.url || '', collectionId, iterationData, localVariables);
          const reqHeaders = req.headers?.reduce((acc: any, h: any) => {
            if (h.key && h.enabled) acc[h.key] = resolveAllVariables(h.value, collectionId, iterationData, localVariables);
            return acc;
          }, {}) || {};

          let requestBody: any = undefined;
          if (req.body?.mode === 'raw') {
            requestBody = resolveAllVariables(req.body.raw || '', collectionId, iterationData, localVariables);
          } else if (req.body?.mode === 'urlencoded') {
            const params = new URLSearchParams();
            req.body.urlencoded?.filter((i: any) => i.enabled && i.key).forEach((item: any) => {
              params.append(item.key, resolveAllVariables(item.value, collectionId, iterationData, localVariables));
            });
            requestBody = params.toString();
            reqHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
          } else if (req.body?.mode === 'form-data') {
            // Text fields only: a saved request never carries the file itself.
            requestBody = {
              _isFormData: true,
              items: (req.body.formData || [])
                .filter((i: any) => i.enabled && i.key && i.type !== 'file')
                .map((i: any) => ({ type: 'text', key: i.key, value: resolveAllVariables(i.value, collectionId, iterationData, localVariables) })),
            };
          } else if (req.body?.mode === 'graphql') {
            const query = resolveAllVariables(req.body.graphql?.query || '', collectionId, iterationData, localVariables);
            const varsStr = resolveAllVariables(req.body.graphql?.variables || '{}', collectionId, iterationData, localVariables);
            let variables: unknown = varsStr;
            try { variables = JSON.parse(varsStr); } catch { /* sent as text, as Send does */ }
            requestBody = JSON.stringify({ query, variables });
            reqHeaders['Content-Type'] = 'application/json';
          }

          const appliedAuth = applyRequestAuth({
            auth: resolveInheritedAuth(req.auth, folderChainClosestFirst(req.folderId, folders), collection),
            headers: reqHeaders,
            url: resolvedUrl,
            resolve: (value) => resolveAllVariables(value, collectionId, iterationData, localVariables),
          });

            const res = await sendRequest({
              method: req.method || 'GET',
              url: appliedAuth.url,
              headers: appliedAuth.headers,
              body: requestBody,
              followRedirects: true,
              verifySsl: true,
              timeout: 30000,
              signal: abortController.signal,
            });
          
          const duration = Date.now() - startTime;
          const statusCode = res.status;
          const responseBody = res.body || '';
          recordRunnerHistory(
            { method: req.method || 'GET', url: appliedAuth.url, headers: appliedAuth.headers, body: requestBody },
            { responseBody, responseStatus: statusCode, responseStatusText: res.statusText || '', responseHeaders: res.headers || {}, responseTime: duration, responseSize: res.size || 0 },
          );

          let testPassed = statusCode >= 200 && statusCode < 400;
          const testScripts: string[] = [];
          if (collection?.testScript) testScripts.push(collection.testScript);
          for (const f of chainRootFirst) if (f.testScript) testScripts.push(f.testScript);
          if (req.testScript) testScripts.push(req.testScript);
          
          if (testScripts.length > 0) {
            const scriptReturn = await runTestScript(testScripts.join('\n\n'), {
              status: statusCode,
              statusText: res.statusText,
              headers: res.headers || {},
              body: responseBody,
              time: duration,
            }, collectionId, iterationData, localVariables);
            
            if (scriptReturn?.nextRequest !== undefined) {
              nextReqName = scriptReturn.nextRequest;
            }

            const testResults = scriptReturn?.testResults || [];
            if (testResults && testResults.length > 0) {
              testPassed = testResults.every(tr => tr.passed);
            }
          }

          setResults(prev => prev.map((item, idx) => {
            if (idx === rowIdx) {
              return {
                ...item,
                status: statusCode,
                statusText: res.statusText || 'OK',
                time: duration,
                passed: testPassed,
              };
            }
            return item;
          }));

          if (nextReqName === null) {
            break; // Stop iteration
          } else if (typeof nextReqName === 'string') {
            const targetIdx = runList.findIndex(r => r.name === nextReqName || r._id === nextReqName);
            if (targetIdx !== -1) {
              i = targetIdx - 1; // will be incremented by loop
            }
          }
        } catch (err: any) {
          if (stopRequestedRef.current) {
            // Stopped mid-request: leave the row as it was (no status) and end the run.
            setIsRunning(false);
            return;
          }
          if ((err as any).code === EXTENSION_NOT_INSTALLED_ERROR) {
            // Stop the runner and prompt the user to install the extension
            setShowDownloadModal(true);
            setIsRunning(false);
            return;
          }
          recordRunnerHistory(
            { method: req.method || 'GET', url: req.url || '', headers: {}, body: undefined },
            { responseBody: err.message || '', responseStatus: err.response?.status || 0, responseStatusText: 'Error', responseHeaders: {}, responseTime: Date.now() - startTime, responseSize: 0 },
          );
          setResults(prev => prev.map((item, idx) => {
            if (idx === rowIdx) {
              return {
                ...item,
                status: err.response?.status || 500,
                statusText: 'Error',
                time: 0,
                passed: false,
                error: err.message,
              };
            }
            return item;
          }));
        }

        globalIdx++;
        if (delayMs > 0 && globalIdx < allRuns.length) {
          await new Promise<void>(resolve => {
            const timer = setTimeout(resolve, delayMs);
            abortController.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
          });
        }
      }
    }

    setIsRunning(false);
  };

  const completedCount = results.filter(r => r.status !== undefined).length;
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => r.passed === false).length;
  const totalTime = results.reduce((acc, r) => acc + (r.time || 0), 0);

  return (
    <div data-testid="collection-runner-modal" className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800/50">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">Run Collection: {collectionName}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{collectionRequests.length} requests in collection{excludedIds.size > 0 ? ` (${runnable.length} selected)` : ''}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={16} /></button>
        </div>

        {/* Configuration Bar */}
        <div className="p-3 border-b border-gray-800 flex items-center justify-between gap-4 bg-gray-900 text-xs flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Environment:</span>
            <select
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 outline-none"
              value={activeEnvironmentId || ''}
              onChange={e => setActiveEnvironmentId(e.target.value || null)}
            >
              <option value="">No Environment</option>
              {environments.map(e => (
                <option key={e._id} value={e._id}>{e.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-gray-400">Delay:</span>
            <input
              type="number"
              min="0"
              step="100"
              value={delayMs}
              onChange={e => setDelayMs(Number(e.target.value))}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 w-16 outline-none text-right"
            />
            <span className="text-gray-500">ms</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-gray-400">Iterations:</span>
            <input
              type="number"
              min="1"
              max={MAX_ITERATIONS}
              value={iterationsText}
              data-testid="collection-runner-iterations"
              aria-invalid={!iterationsValid}
              onChange={e => setIterationsText(e.target.value)}
              className={`bg-gray-800 border rounded px-2 py-1 text-gray-200 w-16 outline-none text-right ${iterationsValid ? 'border-gray-700' : 'border-red-500'}`}
            />
            {!iterationsValid && (
              <span data-testid="collection-runner-iterations-error" className="text-red-400">
                1-{MAX_ITERATIONS} whole number
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-gray-400">Data File:</span>
            <input
              key={dataInputKey}
              type="file"
              accept=".json,.csv"
              data-testid="collection-runner-data-file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setDataFileError('');
                const reader = new FileReader();
                reader.onerror = () => setDataFileError('Could not read the data file');
                reader.onload = () => {
                  try {
                    const text = reader.result as string;
                    const lower = file.name.toLowerCase();
                    let parsed: unknown;
                    if (lower.endsWith('.json')) {
                      parsed = JSON.parse(text);
                      if (!Array.isArray(parsed) || !parsed.every(row => row && typeof row === 'object' && !Array.isArray(row))) {
                        throw new Error('JSON data file must be an array of objects');
                      }
                    } else if (lower.endsWith('.csv')) {
                      parsed = parseCsv(text);
                    } else {
                      throw new Error('Unsupported data file type (use .json or .csv)');
                    }
                    const rows = parsed as Record<string, any>[];
                    if (rows.length === 0) throw new Error('Data file has no rows');
                    if (rows.length > MAX_ITERATIONS) throw new Error(`Data file has more than ${MAX_ITERATIONS} rows`);
                    setDataArray(rows);
                    setDataFileName(file.name);
                    setIterationsText(String(rows.length));
                  } catch (err: any) {
                    console.error('Error parsing data file', err);
                    setDataFileError(`Invalid data file: ${err?.message || 'parse error'}`);
                    setDataInputKey(k => k + 1);
                  }
                };
                reader.readAsText(file);
              }}
              className="w-40 text-xs text-gray-300 bg-gray-800 border border-gray-700 rounded file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-700 file:text-gray-200 hover:file:bg-gray-600 outline-none"
            />
            {dataFileName && (
              <button
                type="button"
                data-testid="collection-runner-clear-data-file"
                onClick={clearDataFile}
                title="Remove data file"
                className="flex items-center gap-1 text-gray-400 hover:text-white"
              >
                {dataFileName} <X size={12} />
              </button>
            )}
            {dataFileError && (
              <span data-testid="collection-runner-data-file-error" className="text-red-400">{dataFileError}</span>
            )}
          </div>

          {isRunning ? (
            <button
              data-testid="collection-runner-stop-btn"
              onClick={stopRun}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
            >
              <Loader2 size={13} className="animate-spin" />
              Stop
            </button>
          ) : (
            <button
              data-testid="collection-runner-run-btn"
              onClick={runAll}
              disabled={runnable.length === 0 || !iterationsValid}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50 transition-colors"
            >
              <Play size={13} />
              Run
            </button>
          )}
        </div>

        {/* Results Summary */}
        {completedCount > 0 && (
          <div className="grid grid-cols-4 gap-2 p-3 bg-gray-800/30 border-b border-gray-800 text-center text-xs">
            <div className="bg-gray-800/60 p-2 rounded">
              <div className="text-gray-400">Total</div>
              <div className="text-base font-semibold text-gray-100">{completedCount} / {results.length}</div>
            </div>
            <div className="bg-gray-800/60 p-2 rounded">
              <div className="text-green-400">Passed</div>
              <div className="text-base font-semibold text-green-400">{passedCount}</div>
            </div>
            <div className="bg-gray-800/60 p-2 rounded">
              <div className="text-red-400">Failed</div>
              <div className="text-base font-semibold text-red-400">{failedCount}</div>
            </div>
            <div className="bg-gray-800/60 p-2 rounded">
              <div className="text-gray-400">Total Time</div>
              <div className="text-base font-semibold text-gray-100">{totalTime} ms</div>
            </div>
          </div>
        )}

        {/* Requests List */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-800">
          {collectionRequests.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-xs">No requests in this collection to run.</div>
          ) : (
            (results.length > 0
              ? results.map(r => ({ name: r.name, method: r.method, url: r.url, id: r.requestId }))
              : collectionRequests.map(r => ({ name: r.name, method: r.method || 'GET', url: r.url, id: r._id }))
            ).map((row, idx) => {
              const res = results[idx];
              return (
                <div key={`${row.id}-${idx}`} data-testid="collection-runner-row" className="p-3 flex items-center justify-between text-xs hover:bg-gray-800/40">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {results.length === 0 && (
                      <input
                        type="checkbox"
                        data-testid="collection-runner-select"
                        checked={!excludedIds.has(row.id)}
                        onChange={() => toggleExcluded(row.id)}
                        aria-label={`Include ${row.name}`}
                      />
                    )}
                    <span className={`font-mono font-bold w-12 shrink-0 ${
                      row.method === 'GET' ? 'text-green-400' :
                      row.method === 'POST' ? 'text-yellow-400' :
                      row.method === 'PUT' ? 'text-blue-400' :
                      row.method === 'DELETE' ? 'text-red-400' : 'text-gray-400'
                    }`}>
                      {row.method || 'GET'}
                    </span>
                    <span className="text-gray-200 truncate font-medium">{row.name}</span>
                    <span className="text-gray-500 truncate text-[11px] hidden sm:inline">{row.url}</span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    {res?.status !== undefined ? (
                      <>
                        <span className={`font-mono font-semibold ${res.passed ? 'text-green-400' : 'text-red-400'}`}>
                          {res.status}
                        </span>
                        <span className="text-gray-500 w-14 text-right">{res.time} ms</span>
                        {res.passed ? (
                          <CheckCircle size={15} className="text-green-400" />
                        ) : (
                          <XCircle size={15} className="text-red-400" />
                        )}
                      </>
                    ) : isRunning && results.length > 0 && results.findIndex(r => r.status === undefined) === idx ? (
                      <Loader2 size={14} className="animate-spin text-blue-400" />
                    ) : results.length > 0 ? (
                      <span className="text-gray-600">Pending</span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-700 flex justify-end gap-2">
          {results.length > 0 && !isRunning && (
            <button
              data-testid="collection-runner-reset-btn"
              onClick={() => setResults([])}
              className="px-4 py-1.5 text-xs rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
            >
              Clear results
            </button>
          )}
          {completedCount > 0 && (
            <button
              data-testid="collection-runner-export-btn"
              onClick={exportResults}
              className="px-4 py-1.5 text-xs rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
            >
              Export Results
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default CollectionRunnerModal;
