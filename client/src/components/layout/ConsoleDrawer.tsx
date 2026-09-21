import React, { useState } from 'react';
import { useConsoleStore } from '../../store/consoleStore';
import { Terminal, Trash2, X, ChevronDown, ChevronRight } from 'lucide-react';

export const ConsoleDrawer: React.FC = () => {
  const { isOpen, logs, setIsOpen, clearLogs } = useConsoleStore();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getMethodColor = (method?: string) => {
    switch (method?.toUpperCase()) {
      case 'GET': return 'text-green-400';
      case 'POST': return 'text-yellow-400';
      case 'PUT': return 'text-blue-400';
      case 'DELETE': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="h-60 border-t border-gray-800 bg-gray-950 flex flex-col text-xs font-mono select-none">
      {/* Console Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2 text-gray-300 font-semibold text-[11px]">
          <Terminal size={13} className="text-gray-400" />
          <span>Console ({logs.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearLogs}
            className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
            title="Clear Console"
          >
            <Trash2 size={13} />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
            title="Close Console"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Logs List */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-900/60 p-1">
        {logs.length === 0 ? (
          <div className="p-6 text-center text-gray-600 text-xs font-sans">
            No logs yet. Network requests and script logs will appear here.
          </div>
        ) : (
          logs.map(log => {
            const isExpanded = expandedIds.has(log.id);
            return (
              <div key={log.id} className="py-1 px-2 hover:bg-gray-900/40 rounded">
                <div
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={() => toggleExpand(log.id)}
                >
                  <span className="text-gray-600 shrink-0">
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </span>
                  <span className="text-gray-500 shrink-0">{log.timestamp}</span>

                  {log.type === 'request' && (
                    <>
                      <span className={`font-bold shrink-0 ${getMethodColor(log.method)}`}>
                        {log.method}
                      </span>
                      <span className="text-gray-300 truncate flex-1">{log.url}</span>
                      {log.status !== undefined && (
                        <span className={`font-semibold shrink-0 ${log.status >= 200 && log.status < 400 ? 'text-green-400' : 'text-red-400'}`}>
                          {log.status}
                        </span>
                      )}
                      {log.time !== undefined && (
                        <span className="text-gray-500 shrink-0">{log.time} ms</span>
                      )}
                    </>
                  )}

                  {log.type !== 'request' && (
                    <span className={`flex-1 ${
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'warn' ? 'text-amber-400' : 'text-gray-300'
                    }`}>
                      {log.message}
                    </span>
                  )}
                </div>

                {/* Expanded Details */}
                {isExpanded && log.type === 'request' && (
                  <div className="mt-2 ml-4 p-2 bg-gray-900/80 rounded border border-gray-800 space-y-2 text-[11px]">
                    {log.requestHeaders && Object.keys(log.requestHeaders).length > 0 && (
                      <div>
                        <div className="text-gray-500 font-semibold mb-0.5">Request Headers:</div>
                        <pre className="text-gray-400 font-mono whitespace-pre-wrap">
                          {JSON.stringify(log.requestHeaders, null, 2)}
                        </pre>
                      </div>
                    )}
                    {log.requestBody && (
                      <div>
                        <div className="text-gray-500 font-semibold mb-0.5">Request Body:</div>
                        <pre className="text-gray-400 font-mono whitespace-pre-wrap">{log.requestBody}</pre>
                      </div>
                    )}
                    {log.responseHeaders && Object.keys(log.responseHeaders).length > 0 && (
                      <div>
                        <div className="text-gray-500 font-semibold mb-0.5">Response Headers:</div>
                        <pre className="text-gray-400 font-mono whitespace-pre-wrap">
                          {JSON.stringify(log.responseHeaders, null, 2)}
                        </pre>
                      </div>
                    )}
                    {log.responseBody && (
                      <div>
                        <div className="text-gray-500 font-semibold mb-0.5">Response Body:</div>
                        <pre className="text-gray-400 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                          {log.responseBody}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ConsoleDrawer;
