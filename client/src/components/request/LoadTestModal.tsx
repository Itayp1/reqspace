import React, { useState } from 'react';
import { X, Play, StopCircle, Activity } from 'lucide-react';
import { useRequestStore } from '../../store/requestStore';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { sendRequest } from '../../transport';
import api from '../../api/axios';

interface Props {
  onClose: () => void;
}

export function LoadTestModal({ onClose }: Props) {
  const { activeRequest } = useRequestStore();
  const { activeWorkspace } = useAuthStore();
  
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
    times: number[];
  }>({ total: 0, success: 0, failed: 0, minTime: 0, maxTime: 0, avgTime: 0, times: [] });

  const abortControllerRef = React.useRef<AbortController | null>(null);

  if (!activeRequest) return null;

  const handleStart = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setProgress(0);
    setResults({ total: 0, success: 0, failed: 0, minTime: 0, maxTime: 0, avgTime: 0, times: [] });
    
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
          const headers = activeRequest.headers.reduce((acc: any, h) => { if (h.enabled && h.key) acc[h.key] = h.value; return acc; }, {});
          // activeRequest.body is the editor's { mode, raw, ... } descriptor, not
          // a resolved payload — same simplification the old proxy call made.
          const rawBody = activeRequest.body ? JSON.stringify(activeRequest.body) : undefined;
          const res = await sendRequest({
            method: activeRequest.method,
            url: activeRequest.url,
            headers,
            body: rawBody,
            followRedirects: settings.followRedirects,
            verifySsl: settings.verifySsl,
            timeout: settings.timeout,
            signal: abortControllerRef.current?.signal,
          });
          success++;
          if (settings.saveHistory && activeWorkspace?._id) {
            api.post(`/workspaces/${activeWorkspace._id}/history`, {
              requestSnapshot: { method: activeRequest.method, url: activeRequest.url, headers, body: rawBody },
              responseBody: res.isBase64 ? '[Binary Data]' : res.body,
              responseStatus: res.status,
              responseStatusText: res.statusText,
              responseHeaders: res.headers,
              responseTime: res.responseTime,
              responseSize: res.size,
              testResults: [],
            }).catch(() => { /* best-effort */ });
          }
        } catch (e: any) {
          if (e?.name !== 'AbortError') failed++;
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
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
                min="1"
                max="1000"
                value={iterations}
                onChange={e => setIterations(Number(e.target.value))}
                disabled={isRunning}
                className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded bg-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Concurrency</label>
              <input
                type="number"
                min="1"
                max="50"
                value={concurrency}
                onChange={e => setConcurrency(Number(e.target.value))}
                disabled={isRunning}
                className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded bg-transparent outline-none"
              />
            </div>
          </div>

          <div className="p-4 border border-gray-200 dark:border-gray-800 rounded bg-gray-50 dark:bg-gray-800/50">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-500">{results.success}</div>
                <div className="text-xs text-gray-500 uppercase">Success</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-500">{results.failed}</div>
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
            <button onClick={handleStart} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded text-sm font-medium flex items-center gap-1">
              <Play size={16} /> Start
            </button>
          ) : (
            <button onClick={handleStop} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-medium flex items-center gap-1">
              <StopCircle size={16} /> Stop
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
