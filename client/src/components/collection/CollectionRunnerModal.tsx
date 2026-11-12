import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEscape } from '../../hooks/useEscape';
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
import { findMissingVariables, type MissingVariable } from '../../utils/missingVariables';
import { MissingVariablesModal } from './MissingVariablesModal';

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

  useEscape(onClose);
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

  const [missing, setMissing] = useState<MissingVariable[] | null>(null);

  // Before running: names used by the run that no scope has a record for open the Missing Variables dialog.
  const runAll = async () => {
    if (runnable.length === 0 || !iterationsValid) return;
    let folders: Folder[] = [];
    try {
      const folderRes = await api.get(`/collections/${collectionId}/folders`);
      folders = Array.isArray(folderRes.data) ? folderRes.data : [];
    } catch { /* checked without folder-level fields */ }
    const env = useEnvironmentStore.getState();
    const collection = useCollectionStore.getState().collections.find(c => c._id === collectionId);
    const keys = [
      ...(env.globalEnvironment?.variables || []),
      ...(env.environments.find(e => e._id === env.activeEnvironmentId)?.variables || []),
      ...(collection?.variables || []),
      ...env.userProfileVariables,
    ].map(v => v.key);
    for (const row of dataArray) keys.push(...Object.keys(row));
    const pick = (o: any, ...f: string[]) => Object.fromEntries(f.map(k => [k, o?.[k]]));
    const found = findMissingVariables([
      { label: 'Collection', fields: pick(collection, 'auth', 'preRequestScript', 'testScript') },
      ...folders.map(f => ({ label: `Folder ${f.name}`, fields: pick(f, 'auth', 'preRequestScript', 'testScript') })),
      ...runnable.map(r => ({ label: r.name, fields: pick(r, 'url', 'params', 'headers', 'auth', 'body', 'preRequestScript', 'testScript') })),
    ], keys);
    if (found.length) setMissing(found); else startRun();
  };

  const startRun = async () => {
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

  const dataFileInputRef = useRef<HTMLInputElement>(null);
  const completedCount = results.filter(r => r.status !== undefined).length;
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => r.passed === false).length;
  const totalTime = results.reduce((acc, r) => acc + (r.time || 0), 0);

  return createPortal(
    <>
    <div data-testid="collection-runner-modal" role="dialog" aria-modal="true" aria-label={`Run ${collectionName}`} className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-surface">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-text truncate" title={collectionName}>Run “{collectionName}”</h2>
            <p className="text-xs text-text-muted mt-0.5">{collectionRequests.length} requests in collection{excludedIds.size > 0 ? ` (${runnable.length} selected)` : ''}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text"><X size={16} aria-hidden="true" /></button>
        </div>

        {/* Configuration Bar */}
        <div className="p-3 border-b border-border flex items-center justify-between gap-4 bg-background text-xs flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-text-muted">Environment:</span>
            <select
              className="bg-background border border-border rounded px-2 py-1 text-text focus-visible:outline-none focus-visible:border-primary"
              aria-label="Environment"
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
            <span className="text-text-muted">Delay:</span>
            <input
              type="number"
              min="0"
              step="100"
              value={delayMs}
              onChange={e => setDelayMs(Number(e.target.value))}
              className="bg-background border border-border rounded px-2 py-1 text-text w-16 focus-visible:outline-none focus-visible:border-primary text-right"
            />
            <span className="text-text-muted">ms</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-text-muted">Iterations:</span>
            <input
              type="number"
              min="1"
              max={MAX_ITERATIONS}
              value={iterationsText}
              data-testid="collection-runner-iterations"
              aria-invalid={!iterationsValid}
              onChange={e => setIterationsText(e.target.value)}
              className={`bg-background border rounded px-2 py-1 text-text w-16 focus-visible:outline-none focus-visible:border-primary text-right ${iterationsValid ? 'border-border' : 'border-red-500'}`}
            />
            {!iterationsValid && (
              <span data-testid="collection-runner-iterations-error" className="text-red-600 dark:text-red-400">
                1-{MAX_ITERATIONS} whole number
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-text-muted">Data File:</span>
            <input
              key={dataInputKey}
              type="file"
              ref={dataFileInputRef}
              tabIndex={-1}
              className="sr-only"
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
            />
            <button
              type="button"
              data-testid="collection-runner-data-file-btn"
              onClick={() => dataFileInputRef.current?.click()}
              className="px-2 py-1 rounded border border-border bg-surface text-text hover:bg-border transition-colors"
            >
              Choose file
            </button>
            {!dataFileName && <span className="text-text-muted">No file chosen</span>}
            {dataFileName && (
              <button
                type="button"
                data-testid="collection-runner-clear-data-file"
                onClick={clearDataFile}
                title="Remove data file"
                className="flex items-center gap-1 text-text-muted hover:text-text"
              >
                {dataFileName} <X size={12} />
              </button>
            )}
            {dataFileError && (
              <span data-testid="collection-runner-data-file-error" className="text-red-600 dark:text-red-400">{dataFileError}</span>
            )}
          </div>

          {isRunning ? (
            <button
              data-testid="collection-runner-stop-btn"
              onClick={stopRun}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
            >
              <Loader2 size={13} className="animate-spin" />
              Stop
            </button>
          ) : (
            <button
              data-testid="collection-runner-run-btn"
              onClick={runAll}
              disabled={runnable.length === 0 || !iterationsValid}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-primary-strong hover:bg-primary/90 text-white font-medium disabled:opacity-50 transition-colors"
            >
              <Play size={13} />
              Run
            </button>
          )}
        </div>

        {/* Results Summary */}
        {completedCount > 0 && (
          <div className="grid grid-cols-4 gap-2 p-3 bg-surface border-b border-border text-center text-xs">
            <div className="bg-surface p-2 rounded">
              <div className="text-text-muted">Total</div>
              <div className="text-base font-semibold text-text">{completedCount} / {results.length}</div>
            </div>
            <div data-testid="runner-passed" title="A request passes when all its tests pass. With no tests, it passes when the HTTP status is 2xx or 3xx." className="bg-surface p-2 rounded">
              <div className="text-green-600 dark:text-green-400">Passed</div>
              <div className="text-base font-semibold text-green-600 dark:text-green-400">{passedCount}</div>
            </div>
            <div data-testid="runner-failed" title="A request fails when a test fails. With no tests, it fails on an HTTP status of 400 or more (for example 401), or a network error." className="bg-surface p-2 rounded">
              <div className="text-red-600 dark:text-red-400">Failed</div>
              <div className="text-base font-semibold text-red-600 dark:text-red-400">{failedCount}</div>
            </div>
            <div className="bg-surface p-2 rounded">
              <div className="text-text-muted">Total Time</div>
              <div className="text-base font-semibold text-text">{totalTime} ms</div>
            </div>
          </div>
        )}

        {completedCount > 0 && failedCount > 0 && (
          <p data-testid="collection-runner-fail-hint" className="px-3 py-1.5 text-[11px] text-text-muted border-b border-border">
            Requests without tests count as failed on a 4xx/5xx status or a network error.
          </p>
        )}

        {/* Requests List */}
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {collectionRequests.length === 0 ? (
            <div className="p-8 text-center text-text-muted text-xs">No requests in this collection to run.</div>
          ) : (
            (results.length > 0
              ? results.map(r => ({ name: r.name, method: r.method, url: r.url, id: r.requestId }))
              : collectionRequests.map(r => ({ name: r.name, method: r.method || 'GET', url: r.url, id: r._id }))
            ).map((row, idx) => {
              const res = results[idx];
              return (
                <div key={`${row.id}-${idx}`} data-testid="collection-runner-row" className="p-3 flex items-center justify-between text-xs hover:bg-surface">
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
                      row.method === 'GET' ? 'text-get' :
                      row.method === 'POST' ? 'text-post' :
                      row.method === 'PUT' ? 'text-put' :
                      row.method === 'DELETE' ? 'text-delete' : 'text-text-muted'
                    }`}>
                      {row.method || 'GET'}
                    </span>
                    <span className="text-text truncate font-medium">{row.name}</span>
                    <span className="text-text-muted truncate text-[11px] hidden sm:inline">{row.url}</span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    {res?.status !== undefined ? (
                      <>
                        <span className={`font-mono font-semibold ${res.passed ? 'text-get' : 'text-delete'}`}>
                          {res.status}
                        </span>
                        <span className="text-text-muted w-14 text-right">{res.time} ms</span>
                        {res.passed ? (
                          <CheckCircle size={15} className="text-green-600 dark:text-green-400" aria-label="Passed" />
                        ) : (
                          <XCircle size={15} className="text-red-600 dark:text-red-400" aria-label="Failed" />
                        )}
                      </>
                    ) : isRunning && results.length > 0 && results.findIndex(r => r.status === undefined) === idx ? (
                      <Loader2 size={14} className="animate-spin text-primary" />
                    ) : results.length > 0 ? (
                      <span className="text-text-muted">Pending</span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border flex justify-end gap-2">
          {results.length > 0 && !isRunning && (
            <button
              data-testid="collection-runner-reset-btn"
              onClick={() => setResults([])}
              className="px-4 py-1.5 text-xs rounded border border-border text-text-muted hover:bg-surface"
            >
              Clear results
            </button>
          )}
          {completedCount > 0 && (
            <button
              data-testid="collection-runner-export-btn"
              onClick={exportResults}
              className="px-4 py-1.5 text-xs rounded border border-border text-text-muted hover:bg-surface"
            >
              Export Results
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs rounded border border-border text-text-muted hover:bg-surface"
          >
            Close
          </button>
        </div>
      </div>
    </div>
      {/* Outside the backdrop: React events bubble through portals, and a backdrop click closes the runner. */}
      {missing && (
        <MissingVariablesModal
          missing={missing}
          collectionId={collectionId}
          onCreated={() => { setMissing(null); startRun(); }}
          onRunAnyway={() => { setMissing(null); startRun(); }}
          onCancel={() => setMissing(null)}
        />
      )}
    </>,
    document.body
  );
};

export default CollectionRunnerModal;
