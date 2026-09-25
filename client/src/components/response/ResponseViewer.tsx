import React, { useState, useMemo, useEffect } from 'react';
import { useRequestStore } from '../../store/requestStore';
import { useCookieStore } from '../../store/cookieStore';
import type { CookieItem } from '../../store/cookieStore';
import Editor from '@monaco-editor/react';
import { Download, Loader2, Search, Cookie, Copy, Check, WrapText, ChevronDown } from 'lucide-react';
import { CookieManagerModal } from '../common/CookieManagerModal';

type TabType = 'body' | 'cookies' | 'headers' | 'test_results' | 'visualizer';
type BodyMode = 'pretty' | 'raw' | 'preview' | 'visualize';
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

        parts.slice(1).forEach((part: string) => {
          const lower = part.toLowerCase();
          if (lower.startsWith('domain=')) domain = part.substring(7);
          else if (lower.startsWith('path=')) path = part.substring(5);
          else if (lower.startsWith('expires=')) expires = part.substring(8);
          else if (lower.startsWith('max-age=')) expires = `Max-Age: ${part.substring(8)}`;
          else if (lower === 'httponly') httpOnly = true;
          else if (lower === 'secure') secure = true;
        });

        const exists = cookiesToDisplay.findIndex(c => c.name === name && c.domain === domain);
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
    if (status >= 200 && status < 300) return 'text-green-500';
    if (status >= 300 && status < 400) return 'text-blue-500';
    if (status >= 400) return 'text-red-500';
    return 'text-gray-500';
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
    if (bodyMode === 'visualize') return '// Visualize mode not implemented.\n' + body;

    if (isJson && (format === 'Auto' || format === 'JSON')) {
      try {
        let parsed = JSON.parse(body);
        if (jsonFilter.trim()) {
          const pathParts = jsonFilter.trim().replace(/^(\$\.|\/)/, '').split(/\.|\[|\]/).filter(Boolean);
          let curr = parsed;
          for (const part of pathParts) {
            if (curr && typeof curr === 'object' && part in curr) {
              curr = curr[part];
            } else {
              return `// No match for path "${jsonFilter}"`;
            }
          }
          return JSON.stringify(curr, null, 2);
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
      <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-gray-900 h-full">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!activeResponse) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-gray-900 h-full">
        <p className="text-gray-500 text-sm">Hit Send to get a response</p>
      </div>
    );
  }

  const isLargeResponse = size && size > 5 * 1024 * 1024;

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 text-sm px-2">
        <div className="flex pt-1">
          {(['body', 'cookies', 'headers', 'test_results', 'visualizer'] as TabType[]).map((tab) => {
            if (tab === 'visualizer' && !activeResponse.visualizerData) return null;
            return (
            <button
              key={tab}
              data-testid={`response-tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 border-b-2 font-medium capitalize text-xs ${
                activeTab === tab
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.replace('_', ' ')}
              {tab === 'headers' && headers && ` (${Object.keys(headers).length})`}
              {tab === 'test_results' && testResults && ` (${testResults.length})`}
            </button>
            );
          })}
        </div>

        <div className="flex space-x-4 items-center text-xs font-mono">
          <div className="flex items-center space-x-1.5">
            <span className="text-gray-400">Status:</span>
            <span data-testid="response-status" className={`font-semibold ${getStatusColor(status || 0)}`}>
              {status} {statusText}
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-gray-400">Time:</span>
            <span className="text-green-600 dark:text-green-500">{responseTime} ms</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-gray-400">Size:</span>
            <span className="text-green-600 dark:text-green-500">{formatSize(size || 0)}</span>
          </div>
          <button
            onClick={handleDownload}
            className="flex items-center text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 ml-2 py-1"
            title="Save Response"
          >
            <Download className="w-4 h-4" />
            <span className="ml-1 sr-only">Save</span>
          </button>
        </div>
      </div>

      {activeTab === 'body' && (
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 p-1.5 text-xs">
          <div className="flex space-x-1">
            {(['pretty', 'raw', 'preview', 'visualize'] as BodyMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setBodyMode(mode)}
                className={`px-2 py-1 rounded transition capitalize ${
                  bodyMode === mode
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2">
            <div className="relative group flex items-center bg-gray-100 dark:bg-gray-800 rounded">
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as FormatType)}
                className="appearance-none bg-transparent text-gray-700 dark:text-gray-300 pl-2 pr-6 py-1 rounded cursor-pointer outline-none w-full"
              >
                <option value="Auto">Auto</option>
                <option value="JSON">JSON</option>
                <option value="XML">XML</option>
                <option value="HTML">HTML</option>
                <option value="Text">Text</option>
              </select>
              <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500" />
            </div>

            <button
              onClick={() => setWordWrap(!wordWrap)}
              className={`p-1 rounded transition ${
                wordWrap 
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white' 
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              title="Wrap lines"
            >
              <WrapText className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                navigator.clipboard.writeText(displayBody);
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 2000);
              }}
              className="p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition"
              title="Copy response"
            >
              {isCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>

            {isJson && (format === 'Auto' || format === 'JSON') && (
              <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 ml-2">
                <Search className="w-3 h-3 text-gray-400 mr-1" />
                <input
                  type="text"
                  placeholder="Filter JSON..."
                  value={jsonFilter}
                  onChange={(e) => setJsonFilter(e.target.value)}
                  className="bg-transparent outline-none w-28 text-gray-700 dark:text-gray-200"
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-white dark:bg-gray-900 relative">
        {activeTab === 'body' && (
          <div className="h-full">
            {isLargeResponse && !forceRenderLarge ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300">
                <div className="bg-orange-50 dark:bg-orange-900/20 p-6 rounded-lg border border-orange-200 dark:border-orange-800/50 max-w-md text-center">
                  <h3 className="text-orange-700 dark:text-orange-400 font-semibold mb-2 text-lg">Large Response</h3>
                  <p className="text-sm mb-4">
                    The response is <strong>{formatSize(size || 0)}</strong>. Rendering large payloads may cause the browser to freeze or crash.
                  </p>
                  <button
                    onClick={() => setForceRenderLarge(true)}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded text-sm font-medium transition-colors"
                  >
                    Render Anyway
                  </button>
                </div>
              </div>
            ) : null}
            {isImage ? (
              <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 p-4">
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
                sandbox="allow-same-origin"
              />
            ) : (
              <Editor
                height="100%"
                language={bodyMode === 'raw' ? 'text' : language}
                value={displayBody}
                theme="vs-dark"
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
              <div className="flex items-center border border-gray-300 dark:border-gray-700 rounded px-2 py-1 w-64 text-sm bg-white dark:bg-gray-900">
                <Search className="w-4 h-4 text-gray-400 mr-2" />
                <input
                  type="text"
                  placeholder="Search headers..."
                  value={headerFilter}
                  onChange={(e) => setHeaderFilter(e.target.value)}
                  className="bg-transparent outline-none flex-1 text-gray-700 dark:text-gray-200"
                />
              </div>
            </div>
            <div className="flex-1 overflow-auto border border-gray-200 dark:border-gray-800 rounded">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-1.5 font-medium text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 w-1/3">Key</th>
                    <th className="px-4 py-1.5 font-medium text-gray-600 dark:text-gray-300">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(headers || {})
                    .filter(([k, v]) => k.toLowerCase().includes(headerFilter.toLowerCase()) || v.toLowerCase().includes(headerFilter.toLowerCase()))
                    .map(([key, value]) => (
                    <tr key={key} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-1.5 font-mono text-xs text-gray-800 dark:text-gray-200 border-r border-gray-100 dark:border-gray-800 align-top">{key}</td>
                      <td className="px-4 py-1.5 font-mono text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all">{value}</td>
                    </tr>
                  ))}
                  {(!headers || Object.keys(headers).length === 0) && (
                    <tr>
                      <td colSpan={2} className="px-4 py-6 text-center text-gray-500">No headers found</td>
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
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Domain Cookies</span>
              <button
                onClick={() => setIsCookieModalOpen(true)}
                className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded font-medium transition flex items-center gap-1.5"
              >
                <Cookie size={12} />
                <span>Manage Cookies</span>
              </button>
            </div>
            <div className="flex-1 overflow-auto border border-gray-200 dark:border-gray-800 rounded">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">
                  <tr>
                    <th className="px-3 py-1.5 font-medium border-r border-gray-200 dark:border-gray-700">Name</th>
                    <th className="px-3 py-1.5 font-medium border-r border-gray-200 dark:border-gray-700">Value</th>
                    <th className="px-3 py-1.5 font-medium border-r border-gray-200 dark:border-gray-700">Domain</th>
                    <th className="px-3 py-1.5 font-medium border-r border-gray-200 dark:border-gray-700">Path</th>
                    <th className="px-3 py-1.5 font-medium border-r border-gray-200 dark:border-gray-700">Expires</th>
                    <th className="px-3 py-1.5 font-medium border-r border-gray-200 dark:border-gray-700 text-center">HttpOnly</th>
                    <th className="px-3 py-1.5 font-medium text-center">Secure</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {displayCookies.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-gray-500 text-sm">No cookies set for this domain</td>
                    </tr>
                  ) : (
                    displayCookies.map((c, i) => (
                      <tr key={c.id || i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-3 py-1.5 border-r border-gray-100 dark:border-gray-800 font-mono text-gray-800 dark:text-gray-200 truncate max-w-[150px]" title={c.name}>{c.name}</td>
                        <td className="px-3 py-1.5 border-r border-gray-100 dark:border-gray-800 font-mono text-gray-600 dark:text-gray-400 truncate max-w-[200px]" title={c.value}>{c.value}</td>
                        <td className="px-3 py-1.5 border-r border-gray-100 dark:border-gray-800 text-gray-500">{c.domain}</td>
                        <td className="px-3 py-1.5 border-r border-gray-100 dark:border-gray-800 text-gray-500">{c.path}</td>
                        <td className="px-3 py-1.5 border-r border-gray-100 dark:border-gray-800 text-gray-500">{c.expires || 'Session'}</td>
                        <td className="px-3 py-1.5 border-r border-gray-100 dark:border-gray-800 text-center text-gray-400">{c.httpOnly ? '✓' : '—'}</td>
                        <td className="px-3 py-1.5 text-center text-gray-400">{c.secure ? '✓' : '—'}</td>
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
              <div className="flex flex-col items-center justify-center text-gray-500 h-full py-6">
                <p>No test results available</p>
                <p className="text-xs text-gray-400 mt-1">Add tests in the "Tests" tab using pm.test()</p>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="mb-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2 px-3 flex items-center justify-between">
                  <span className="font-medium text-gray-700 dark:text-gray-300 text-sm">
                    Test Results
                  </span>
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Passed ({testResults.filter(t => t.passed).length}/{testResults.length})
                  </span>
                </div>
                <div className="flex-1 overflow-auto">
                  <ul className="space-y-2">
                    {testResults.map((result, idx) => (
                      <li key={idx} data-testid="test-result-item" className="flex flex-col p-2.5 rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                        <div className="flex items-start">
                          <span className={`mt-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded text-white ${result.passed ? 'bg-green-500' : 'bg-red-500'}`} data-testid="test-result-status">
                            {result.passed ? 'PASS' : 'FAIL'}
                          </span>
                          <span className="ml-2.5 text-sm text-gray-800 dark:text-gray-200 font-medium" data-testid="test-result-name">{result.name}</span>
                        </div>
                        {!result.passed && result.error && (
                          <div className="ml-10 mt-1.5 text-xs text-red-600 bg-red-50 dark:bg-red-900/10 p-2 rounded font-mono break-all border border-red-100 dark:border-red-900/30">
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
              srcDoc={`
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <script src="https://cdn.jsdelivr.net/npm/handlebars@latest/dist/handlebars.min.js"></script>
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
