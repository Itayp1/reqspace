import { queryJsonPath, isMultiPath } from '../../utils/jsonPath';
import { useMonacoTheme } from '../../utils/useMonacoTheme';
import React, { useState, useMemo, useEffect } from 'react';
import { useRequestStore } from '../../store/requestStore';
import { useCookieStore } from '../../store/cookieStore';
import type { CookieItem } from '../../store/cookieStore';
import Editor from '../common/LazyEditor';
import { Download, Loader2, Search, Cookie, Copy, Check, WrapText, ChevronDown } from 'lucide-react';
import { CookieManagerModal } from '../common/CookieManagerModal';

type TabType = 'body' | 'cookies' | 'headers' | 'test_results' | 'visualizer';
// No 'visualize' mode: it only ever printed "not implemented". The real
// visualizer (pm.visualizer.set) has its own response tab.
type BodyMode = 'pretty' | 'raw' | 'preview';
type FormatType = 'JSON' | 'XML' | 'HTML' | 'Text' | 'Auto';

const formatXml = (xml: string) => {
  let formatted = '';
  let pad = 0;
  const s = xml.replace(/(>)\s*(<)(\/*)/g, '$1\n$2$3');
  s.split('\n').forEach(node => {
    let indent = 0;
    if (node.match(/^\s*<\//)) {
      pad -= 2;
    } else if (
      node.match(/^\s*<[^\/]/) &&
      !node.match(/\/>\s*$/) &&
      !node.match(/<\/[^>]+>\s*$/) &&
      !node.match(/^<\?/) &&
      !node.match(/^<!/)
    ) {
      indent = 2;
    }
    formatted += ' '.repeat(Math.max(0, pad)) + node.trim() + '\n';
    pad += indent;
  });
  return formatted.trim();
};

export const ResponseViewer: React.FC = () => {
  const { activeResponse, activeRequest, isLoading } = useRequestStore();
  const { cookies } = useCookieStore();
  const monacoTheme = useMonacoTheme();
  
  const [activeTab, setActiveTab] = useState<TabType>('body');
  const [bodyMode, setBodyMode] = useState<BodyMode>('pretty');
  const [format, setFormat] = useState<FormatType>('Auto');
  const [jsonFilter, setJsonFilter] = useState('');
  const [headerFilter, setHeaderFilter] = useState('');
  const [isCookieModalOpen, setIsCookieModalOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState<boolean>(false);
  const [forceRenderLarge, setForceRenderLarge] = useState<boolean>(false);

  const requestDomain = useMemo(() => {
    try {
      if (!activeRequest?.url) return '';
      return new URL(activeRequest.url).hostname;
    } catch {
      return '';
    }
  }, [activeRequest?.url]);

  const currentDomainCookies = useMemo(() => {
    if (!requestDomain) return cookies;
    return cookies.filter(c => requestDomain === c.domain || requestDomain.endsWith('.' + c.domain));
  }, [cookies, requestDomain]);

  const { status, statusText, headers, body, responseTime, size, testResults } = activeResponse || {};

  const displayCookies = useMemo(() => {
    let cookiesToDisplay = [...currentDomainCookies];
    const setCookieHeader = headers?.['set-cookie'] || headers?.['Set-Cookie'];
    if (setCookieHeader) {
      const setCookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
      setCookies.forEach((headerStr) => {
        const parts = headerStr.split(';').map((p: string) => p.trim());
        if (parts.length === 0) return;
        const nameValue = parts[0];
        const [name, ...valueParts] = nameValue.split('=');
        const value = valueParts.join('=');
        
        let domain = requestDomain;
        let path = '/';
        let expires = '';
        let httpOnly = false;
        let secure = false;
        let removed = false;

        parts.slice(1).forEach((part: string) => {
          const lower = part.toLowerCase();
          if (lower.startsWith('domain=')) domain = part.substring(7).replace(/^\./, '').toLowerCase();
          else if (lower.startsWith('path=')) path = part.substring(5);
          else if (lower.startsWith('expires=')) expires = part.substring(8);
          else if (lower.startsWith('max-age=')) { expires = `Max-Age: ${part.substring(8)}`; if (parseInt(part.substring(8), 10) <= 0) removed = true; }
          else if (lower === 'httponly') httpOnly = true;
          else if (lower === 'secure') secure = true;
        });

        // Same identity as the jar (name+domain+path) so the tab stays in sync with it.
        if (!removed && expires && !expires.startsWith('Max-Age') && new Date(expires).getTime() <= Date.now()) removed = true;
        const exists = cookiesToDisplay.findIndex(c => c.name === name && c.domain === domain && (c.path || '/') === path);
        if (removed) {
          // Deleted by this response (Max-Age<=0 / past Expires): the jar drops it, so the tab must too.
          if (exists >= 0) cookiesToDisplay.splice(exists, 1);
          return;
        }
        const newC: CookieItem = { id: `res-${name}`, name, value, domain, path, expires, httpOnly, secure };
        if (exists >= 0) {
          cookiesToDisplay[exists] = newC;
        } else {
          cookiesToDisplay.push(newC);
        }
      });
    }
    return cookiesToDisplay;
  }, [currentDomainCookies, headers, requestDomain]);

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-green-700 dark:text-green-400';
    if (status >= 300 && status < 400) return 'text-blue-700 dark:text-blue-400';
    if (status >= 400) return 'text-red-700 dark:text-red-400';
    return 'text-text-muted';
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const contentType = (headers?.['content-type'] || headers?.['Content-Type'] || '').toLowerCase();
  const isHtml = contentType.includes('html') || (body && !activeResponse?.isBase64 && body.trim().startsWith('<!DOCTYPE html>'));
  const isJson = contentType.includes('json') || (body && !activeResponse?.isBase64 && (body.trim().startsWith('{') || body.trim().startsWith('[')));
  const isXml = contentType.includes('xml') || (body && !activeResponse?.isBase64 && body.trim().startsWith('<') && !isHtml);
  const isImage = contentType.includes('image/');
  const isPdf = contentType.includes('application/pdf');

  const handleDownload = () => {
    if (!activeResponse) return;
    
    let blob: Blob;
    if (activeResponse.isBase64) {
      const byteCharacters = atob(activeResponse.body);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      blob = new Blob([byteArray], { type: contentType });
    } else {
      blob = new Blob([activeResponse.body], { type: contentType || 'text/plain' });
    }
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `response_${Date.now()}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const language = useMemo(() => {
    if (format !== 'Auto') {
      return format.toLowerCase();
    }
    if (isJson) return 'json';
    if (isHtml) return 'html';
    if (isXml) return 'xml';
    return 'text';
  }, [format, isJson, isHtml, isXml]);

  useEffect(() => {
    setForceRenderLarge(false);
  }, [activeRequest?._id, activeRequest?.tabId]);

  const displayBody = useMemo(() => {
    if (!body) return '';
    if (bodyMode === 'raw') return body;

    if (isJson && (format === 'Auto' || format === 'JSON')) {
      try {
        let parsed = JSON.parse(body);
        if (jsonFilter.trim()) {
          let matches: unknown[];
          try {
            matches = queryJsonPath(parsed, jsonFilter);
          } catch (e: any) {
            return `// Invalid JSON path "${jsonFilter}": ${e.message}`;
          }
          if (matches.length === 0) return `// No match for path "${jsonFilter}"`;
          return JSON.stringify(isMultiPath(jsonFilter) ? matches : matches[0], null, 2);
        }
        return JSON.stringify(parsed, null, 2);
      } catch {
        return body;
      }
    }

    if (isXml && (format === 'Auto' || format === 'XML')) {
      return formatXml(body);
    }
    
    if (isHtml && (format === 'Auto' || format === 'HTML')) {
      // HTML is structurally similar to XML, we can use the same formatter for basic indentation
      return formatXml(body);
    }

    return body;
  }, [body, bodyMode, isJson, isXml, jsonFilter, format]);

  if (isLoading) {
    return (
      <div role="status" className="flex-1 flex flex-col items-center justify-center gap-2 bg-background h-full text-text-muted">
        <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
        <span className="text-sm">Sending…</span>
      </div>
    );
  }

  if (!activeResponse) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-1 bg-background h-full">
        <p className="text-text-muted text-sm">Hit Send to get a response</p>
        <p className="text-text-muted/70 text-xs"><kbd className="font-mono">Ctrl</kbd>+<kbd className="font-mono">Enter</kbd> sends from anywhere in the request</p>
      </div>
    );
  }

  const isLargeResponse = size && size > 5 * 1024 * 1024;

  return (
    <div className="flex-1 flex flex-col h-full bg-background border-l border-border">
      <div className="flex items-center justify-between border-b border-border text-sm px-2">
        <div role="tablist" aria-label="Response sections" className="flex pt-1">
          {(['body', 'cookies', 'headers', 'test_results', 'visualizer'] as TabType[]).map((tab) => {
            if (tab === 'visualizer' && !activeResponse.visualizerData) return null;
            return (
            <button
              key={tab}
              data-testid={`response-tab-${tab}`}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 border-b-2 font-medium capitalize text-xs ${
                activeTab === tab
                  ? 'border-primary text-text'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              {tab.replace('_', ' ')}
              {tab === 'headers' && headers && ` (${Object.values(headers).reduce((n: number, v: any) => n + (Array.isArray(v) ? v.length : 1), 0)})`}
              {tab === 'test_results' && testResults && ` (${testResults.length})`}
            </button>
            );
          })}
        </div>

        <div className="flex space-x-4 items-center text-xs font-mono">
          <div className="flex items-center space-x-1.5">
            <span className="text-text-muted">Status:</span>
            <span data-testid="response-status" className={`font-semibold ${getStatusColor(status || 0)}`}>
              {status} {statusText}
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-text-muted">Time:</span>
            <span className="text-text tabular-nums">{responseTime}&nbsp;ms</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-text-muted">Size:</span>
            <span className="text-text tabular-nums">{formatSize(size || 0)}</span>
          </div>
          <button
            onClick={handleDownload}
            className="flex items-center text-text-muted hover:text-text ml-2 py-1 rounded"
            title="Save Response"
            aria-label="Save response"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span className="ml-1 sr-only">Save</span>
          </button>
        </div>
      </div>

      {activeTab === 'body' && (
        <div className="flex items-center justify-between border-b border-border p-1.5 text-xs">
          <div className="flex space-x-1">
            {(['pretty', 'raw', 'preview'] as BodyMode[]).map((mode) => (
              <button
                key={mode}
                aria-pressed={bodyMode === mode}
                onClick={() => setBodyMode(mode)}
                className={`px-2 py-1 rounded transition capitalize ${
                  bodyMode === mode
                    ? 'bg-border text-text font-medium'
                    : 'text-text-muted hover:bg-surface hover:text-text'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2">
            <div className="relative group flex items-center bg-surface rounded">
              <select
                aria-label="Response format"
                value={format}
                onChange={(e) => setFormat(e.target.value as FormatType)}
                className="appearance-none bg-transparent text-text pl-2 pr-6 py-1 rounded cursor-pointer w-full"
              >
                <option value="Auto">Auto</option>
                <option value="JSON">JSON</option>
                <option value="XML">XML</option>
                <option value="HTML">HTML</option>
                <option value="Text">Text</option>
              </select>
              <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted" aria-hidden="true" />
            </div>

            <button
              onClick={() => setWordWrap(!wordWrap)}
              aria-pressed={wordWrap}
              aria-label="Wrap lines"
              className={`p-1 rounded transition ${
                wordWrap 
                  ? 'bg-border text-text' 
                  : 'text-text-muted hover:bg-surface'
              }`}
              title="Wrap lines"
            >
              <WrapText className="w-4 h-4" aria-hidden="true" />
            </button>

            <button
              onClick={() => {
                navigator.clipboard.writeText(displayBody);
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 2000);
              }}
              className="p-1 text-text-muted hover:bg-surface rounded transition"
              title="Copy response"
              aria-label="Copy response"
            >
              {isCopied ? <Check className="w-4 h-4 text-get" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
            </button>

            {isJson && (format === 'Auto' || format === 'JSON') && (
              <div className="flex items-center border border-border rounded px-1.5 py-0.5 ml-2 focus-within:border-primary">
                <Search className="w-3 h-3 text-text-muted mr-1" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Filter JSON..."
                  aria-label="Filter JSON by path"
                  autoComplete="off"
                  spellCheck={false}
                  value={jsonFilter}
                  onChange={(e) => setJsonFilter(e.target.value)}
                  className="bg-transparent outline-none w-28 text-text font-mono"
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-background relative">
        {activeTab === 'body' && (
          <div className="h-full" data-testid="response-body-viewer">
            {isLargeResponse && !forceRenderLarge ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background text-text">
                <div className="bg-surface p-6 rounded-lg border border-border max-w-md text-center">
                  <h3 className="text-text font-semibold mb-2 text-lg">Large Response</h3>
                  <p className="text-sm mb-4">
                    The response is <strong>{formatSize(size || 0)}</strong>. Rendering large payloads may cause the browser to freeze or crash.
                  </p>
                  <button
                    onClick={() => setForceRenderLarge(true)}
                    className="px-4 py-2 bg-primary-strong hover:opacity-90 text-white rounded text-sm font-medium transition-colors"
                  >
                    Render Anyway
                  </button>
                </div>
              </div>
            ) : null}
            {isImage ? (
              <div className="w-full h-full flex items-center justify-center bg-surface p-4">
                <img src={`data:${contentType};base64,${activeResponse?.body}`} alt="Response" className="max-w-full max-h-full object-contain shadow-lg" />
              </div>
            ) : isPdf ? (
              <div className="w-full h-full">
                <object data={`data:application/pdf;base64,${activeResponse?.body}`} type="application/pdf" className="w-full h-full">
                  <p>PDF cannot be displayed. <a href="#" onClick={(e) => { e.preventDefault(); handleDownload(); }}>Download</a> instead.</p>
                </object>
              </div>
            ) : bodyMode === 'preview' && isHtml ? (
              <iframe
                srcDoc={body}
                title="Response HTML Preview"
                className="w-full h-full border-0 bg-white"
                sandbox=""
              />
            ) : (
              <Editor
                height="100%"
                language={bodyMode === 'raw' ? 'text' : language}
                value={displayBody}
                theme={monacoTheme}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  wordWrap: wordWrap ? 'on' : 'off',
                  formatOnPaste: true,
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                }}
              />
            )}
          </div>
        )}

        {activeTab === 'headers' && (
          <div className="flex flex-col h-full p-3">
            <div className="mb-3">
              <div className="flex items-center border border-border rounded px-2 py-1 w-64 text-sm bg-background focus-within:border-primary">
                <Search className="w-4 h-4 text-text-muted mr-2" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Search headers…"
                  aria-label="Search headers"
                  autoComplete="off"
                  spellCheck={false}
                  value={headerFilter}
                  onChange={(e) => setHeaderFilter(e.target.value)}
                  className="bg-transparent outline-none flex-1 text-text"
                />
              </div>
            </div>
            <div className="flex-1 overflow-auto border border-border rounded">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-surface sticky top-0 border-b border-border">
                  <tr>
                    <th className="px-4 py-1.5 font-medium text-text-muted border-r border-border w-1/3">Key</th>
                    <th className="px-4 py-1.5 font-medium text-text-muted">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Repeated headers (e.g. several Set-Cookie) arrive as arrays: one row per value. */}
                  {Object.entries(headers || {})
                    .flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((val, i) => [k, String(val), `${k}#${i}`] as [string, string, string]))
                    .filter(([k, v]) => k.toLowerCase().includes(headerFilter.toLowerCase()) || v.toLowerCase().includes(headerFilter.toLowerCase()))
                    .map(([key, value, rowKey]) => (
                    <tr key={rowKey} className="border-b border-border/60 hover:bg-surface">
                      <td className="px-4 py-1.5 font-mono text-xs text-text border-r border-border/60 align-top">{key}</td>
                      <td className="px-4 py-1.5 font-mono text-xs text-text-muted whitespace-pre-wrap break-all">{value}</td>
                    </tr>
                  ))}
                  {(!headers || Object.keys(headers).length === 0) && (
                    <tr>
                      <td colSpan={2} className="px-4 py-6 text-center text-text-muted">No headers found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'cookies' && (
          <div className="flex flex-col h-full p-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-text">Domain Cookies</span>
              <button
                onClick={() => setIsCookieModalOpen(true)}
                className="text-xs px-2 py-1 bg-surface hover:bg-border text-text rounded font-medium transition flex items-center gap-1.5"
              >
                <Cookie size={12} aria-hidden="true" />
                <span>Manage Cookies</span>
              </button>
            </div>
            <div className="flex-1 overflow-auto border border-border rounded">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-surface sticky top-0 border-b border-border text-text-muted">
                  <tr>
                    <th className="px-3 py-1.5 font-medium border-r border-border">Name</th>
                    <th className="px-3 py-1.5 font-medium border-r border-border">Value</th>
                    <th className="px-3 py-1.5 font-medium border-r border-border">Domain</th>
                    <th className="px-3 py-1.5 font-medium border-r border-border">Path</th>
                    <th className="px-3 py-1.5 font-medium border-r border-border">Expires</th>
                    <th className="px-3 py-1.5 font-medium border-r border-border text-center">HttpOnly</th>
                    <th className="px-3 py-1.5 font-medium text-center">Secure</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {displayCookies.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-text-muted text-sm">No cookies set for this domain</td>
                    </tr>
                  ) : (
                    displayCookies.map((c, i) => (
                      <tr key={c.id || i} className="hover:bg-surface">
                        <td className="px-3 py-1.5 border-r border-border/60 font-mono text-text truncate max-w-[150px]" title={c.name}>{c.name}</td>
                        <td className="px-3 py-1.5 border-r border-border/60 font-mono text-text-muted truncate max-w-[200px]" title={c.value}>{c.value}</td>
                        <td className="px-3 py-1.5 border-r border-border/60 text-text-muted">{c.domain}</td>
                        <td className="px-3 py-1.5 border-r border-border/60 text-text-muted">{c.path}</td>
                        <td className="px-3 py-1.5 border-r border-border/60 text-text-muted">{c.expires || 'Session'}</td>
                        <td className="px-3 py-1.5 border-r border-border/60 text-center text-text-muted">{c.httpOnly ? '✓' : '—'}</td>
                        <td className="px-3 py-1.5 text-center text-text-muted">{c.secure ? '✓' : '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'test_results' && (
          <div className="flex flex-col h-full p-3">
            {!testResults || testResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-text-muted h-full py-6">
                <p className="text-sm">No test results available</p>
                <p className="text-xs text-text-muted mt-1">Add tests in the “Tests” tab using pm.test()</p>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="mb-3 bg-surface border border-border rounded p-2 px-3 flex items-center justify-between">
                  <span className="font-medium text-text text-sm">
                    Test Results
                  </span>
                  <span className="text-sm font-medium text-text-muted">
                    <span className="tabular-nums">Passed ({testResults.filter(t => t.passed).length}/{testResults.length})</span>
                  </span>
                </div>
                <div className="flex-1 overflow-auto">
                  <ul className="space-y-2">
                    {testResults.map((result, idx) => (
                      <li key={idx} data-testid="test-result-item" className="flex flex-col p-2.5 rounded bg-background border border-border">
                        <div className="flex items-start">
                          <span className={`mt-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded text-white ${result.passed ? 'bg-get' : 'bg-delete'}`} data-testid="test-result-status">
                            {result.passed ? 'PASS' : 'FAIL'}
                          </span>
                          <span className="ml-2.5 text-sm text-text font-medium" data-testid="test-result-name">{result.name}</span>
                        </div>
                        {!result.passed && result.error && (
                          <div className="ml-10 mt-1.5 text-xs text-delete bg-delete/10 p-2 rounded font-mono break-all">
                            {result.error}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'visualizer' && activeResponse.visualizerData && (
          <div className="flex flex-col h-full bg-white">
            <iframe
              className="w-full h-full border-none"
              title="visualizer"
              sandbox="allow-scripts"
              srcDoc={`
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <script src="/handlebars.min.js"></script>
                  <style>body { font-family: sans-serif; padding: 10px; margin: 0; }</style>
                </head>
                <body>
                  <div id="root"></div>
                  <script>
                    try {
                      var templateStr = ${JSON.stringify(activeResponse.visualizerData.template)};
                      var data = ${JSON.stringify(activeResponse.visualizerData.data || {})};
                      var template = Handlebars.compile(templateStr);
                      document.getElementById('root').innerHTML = template(data);
                    } catch (e) {
                      document.getElementById('root').innerHTML = '<div style="color:red; font-family:monospace;">Visualizer Error: ' + e.message + '</div>';
                    }
                  </script>
                </body>
                </html>
              `}
            />
          </div>
        )}
      </div>

      <CookieManagerModal
        isOpen={isCookieModalOpen}
        onClose={() => setIsCookieModalOpen(false)}
        initialDomain={requestDomain}
      />
    </div>
  );
};

export default ResponseViewer;
