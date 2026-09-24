import { useState, useCallback, useEffect } from 'react';
import { useRequestStore } from '../../store/requestStore';
import { useAuthStore } from '../../store/authStore';
import { useCollectionStore } from '../../store/collectionStore';
import { useConsoleStore } from '../../store/consoleStore';
import { useCookieStore } from '../../store/cookieStore';
import { useSettingsStore } from '../../store/settingsStore';
import { Save, Play, Code2, Cookie, Activity } from 'lucide-react';
import { VariableInput } from '../common/VariableInput';
import api from '../../api/axios';
import { sendRequest, TransportError } from '../../transport';
import { SaveRequestModal } from './SaveRequestModal';
import { LoadTestModal } from './LoadTestModal';
import { CodeGenModal } from './CodeGenModal';
import { CookieManagerModal } from '../common/CookieManagerModal';
import type { KeyValueItem } from '../../store/requestStore';

import { fileToBase64 } from '../../utils/fileToBase64';
import { resolveAllVariables } from '../../utils/variables';
import { runPreRequestScript, runTestScript } from '../../utils/scripts';
import { stripJsonComments } from '../../utils/jsonComments';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];

// ── URL ↔ Params Sync ─────────────────────────────────────────────────────────

function parseUrlParams(url: string): KeyValueItem[] {
  try {
    const questionIdx = url.indexOf('?');
    if (questionIdx === -1) return [];
    const queryString = url.slice(questionIdx + 1);
    if (!queryString) return [];
    return queryString.split('&').map((pair) => {
      const [key, ...rest] = pair.split('=');
      return {
        key: decodeURIComponent(key || ''),
        value: decodeURIComponent(rest.join('=') || ''),
        enabled: true,
        description: '',
      };
    }).filter(p => p.key);
  } catch {
    return [];
  }
}

function buildUrlWithParams(baseUrl: string, params: KeyValueItem[]): string {
  const enabledParams = params.filter(p => p.enabled && p.key.trim());
  if (enabledParams.length === 0) {
    return baseUrl.split('?')[0];
  }
  const queryString = enabledParams
    .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&');
  return `${baseUrl.split('?')[0]}?${queryString}`;
}

// ── UrlBar ────────────────────────────────────────────────────────────────────

export function UrlBar() {
  const { activeWorkspace } = useAuthStore();
  const {
    activeRequest,
    updateActiveRequest,
    setActiveResponse,
    setIsLoading,
    isLoading,
    markSaved,
  } = useRequestStore();
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isLoadTestModalOpen, setIsLoadTestModalOpen] = useState(false);
  const [isCodeGenOpen, setIsCodeGenOpen] = useState(false);
  const [isCookieModalOpen, setIsCookieModalOpen] = useState(false);
  const [isRenamingTitle, setIsRenamingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const isDirty = !!activeRequest?.isDirty;

  const handleUrlChange = useCallback((newUrl: string) => {
    if (!activeRequest) return;
    const parsedParams = parseUrlParams(newUrl);
    updateActiveRequest({ url: newUrl, params: parsedParams.length > 0 ? parsedParams : activeRequest.params });
  }, [activeRequest, updateActiveRequest]);

  const handleParamsChange = useCallback((params: KeyValueItem[]) => {
    if (!activeRequest) return;
    const newUrl = buildUrlWithParams(activeRequest.url, params);
    updateActiveRequest({ params, url: newUrl });
  }, [activeRequest?.url, updateActiveRequest]);

  // Expose handleParamsChange via window so KeyValueEditor can call it when in Params tab
  (window as any).__onParamsChange = handleParamsChange;

  const handleSend = async () => {
    if (!activeRequest) return;
    const startTime = Date.now();
    try {
      setIsLoading(true);

      const { collections, folders } = useCollectionStore.getState();
      const colId = activeRequest.collectionId;
      const collection = collections.find(c => c._id === colId);

      const preScripts: string[] = [];
      const testScripts: string[] = [];

      if (collection) {
        if (collection.preRequestScript) preScripts.push(collection.preRequestScript);
        if (collection.testScript) testScripts.push(collection.testScript);
      }

      const requestFolders = [];
      let currFolderId = activeRequest.folderId;
      while (currFolderId) {
        const f = folders.find(f => f._id === currFolderId);
        if (f) {
          requestFolders.unshift(f);
          currFolderId = f.parentFolderId;
        } else {
          break;
        }
      }

      for (const f of requestFolders) {
        if (f.preRequestScript) preScripts.push(f.preRequestScript);
        if (f.testScript) testScripts.push(f.testScript);
      }

      if (activeRequest.preRequestScript) preScripts.push(activeRequest.preRequestScript);
      if (activeRequest.testScript) testScripts.push(activeRequest.testScript);

      // Local variables map spanning pre-request and test scripts
      const localVariables = new Map<string, string>();

      // 1. Run combined Pre-request script
      runPreRequestScript(preScripts.join('\n\n'), colId, undefined, localVariables);

      // 2. Resolve all variables in URL, headers, and body
      const resolvedUrl = resolveAllVariables(activeRequest.url, colId, undefined, localVariables);

      const reqHeaders = activeRequest.headers?.reduce((acc: any, h: any) => {
        if (h.key && h.enabled) acc[h.key] = resolveAllVariables(h.value, colId, undefined, localVariables);
        return acc;
      }, {}) || {};

      const cookieVal = useCookieStore.getState().getCookiesHeaderForUrl(resolvedUrl);
      if (cookieVal && !reqHeaders['Cookie'] && !reqHeaders['cookie']) {
        reqHeaders['Cookie'] = cookieVal;
      }

      // Apply Authorization from auth tab
      let auth = activeRequest.auth;
      if (auth?.type === 'inherit') {
        const { collections, folders } = useCollectionStore.getState();
        if (activeRequest.folderId) {
          const folder = folders.find(f => f._id === activeRequest.folderId);
          if (folder && folder.auth && folder.auth.type !== 'inherit') auth = folder.auth;
        } else if (colId) {
          const col = collections.find(c => c._id === colId);
          if (col && col.auth && col.auth.type !== 'inherit') auth = col.auth;
        }
      }

      if (auth?.type === 'bearer' && auth.bearer?.token) {
        reqHeaders['Authorization'] = `Bearer ${auth.bearer.token}`;
      } else if (auth?.type === 'basic' && auth.basic?.username) {
        const encoded = btoa(`${auth.basic.username}:${auth.basic.password || ''}`);
        reqHeaders['Authorization'] = `Basic ${encoded}`;
      } else if (auth?.type === 'apikey' && auth.apikey?.key && auth.apikey?.in === 'header') {
        reqHeaders[auth.apikey.key] = auth.apikey.value || '';
      } else if (auth?.type === 'oauth2' && auth.oauth2?.token) {
        reqHeaders['Authorization'] = `Bearer ${auth.oauth2.token}`;
      } else if (auth?.type === 'ntlm') {
        // NTLM is complex, for now we will pass it to proxy so the proxy can handle it if it supports it.
        // We set a custom header that the proxy can interpret.
        reqHeaders['x-reqspace-ntlm-username'] = auth.ntlm?.username || '';
        reqHeaders['x-reqspace-ntlm-password'] = auth.ntlm?.password || '';
        reqHeaders['x-reqspace-ntlm-domain'] = auth.ntlm?.domain || '';
        reqHeaders['x-reqspace-ntlm-workstation'] = auth.ntlm?.workstation || '';
      }

      // Apply request settings
      const settings = useSettingsStore.getState().settings;
      if (settings.sendNoCacheHeader) {
        reqHeaders['Cache-Control'] = 'no-cache';
      }

      // Build final URL (API key in query param)
      let finalUrl = resolvedUrl;
      if (auth?.type === 'apikey' && auth.apikey?.key && auth.apikey?.in === 'query') {
        const sep = finalUrl.includes('?') ? '&' : '?';
        finalUrl = `${finalUrl}${sep}${encodeURIComponent(auth.apikey.key)}=${encodeURIComponent(auth.apikey.value || '')}`;
      }

      // Build request body payload
      let requestBody: any = undefined;
      const bodyMode = activeRequest.body?.mode;

      if (bodyMode === 'raw') {
        let rawBody = activeRequest.body?.raw || '';
        
        // Strip comments if the body is marked as JSON
        if (activeRequest.body?.rawLanguage === 'json') {
          rawBody = stripJsonComments(rawBody);
        }

        requestBody = resolveAllVariables(rawBody, colId, undefined, localVariables);
        
        // Auto-detect Content-Type
        if (!reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
          const lang = activeRequest.body?.rawLanguage;
          if (lang === 'json') reqHeaders['Content-Type'] = 'application/json';
          else if (lang === 'xml') reqHeaders['Content-Type'] = 'application/xml';
          else if (lang === 'html') reqHeaders['Content-Type'] = 'text/html';
          else reqHeaders['Content-Type'] = 'text/plain';
        }
      } else if (bodyMode === 'graphql') {
        const query = resolveAllVariables(activeRequest.body?.graphql?.query || '', colId, undefined, localVariables);
        const varsStr = resolveAllVariables(activeRequest.body?.graphql?.variables || '{}', colId, undefined, localVariables);
        try {
          const variables = JSON.parse(varsStr);
          requestBody = JSON.stringify({ query, variables });
        } catch {
          requestBody = JSON.stringify({ query, variables: varsStr });
        }
        reqHeaders['Content-Type'] = 'application/json';
      } else if (bodyMode === 'urlencoded') {
        const params = new URLSearchParams();
        activeRequest.body?.urlencoded?.filter(i => i.enabled && i.key).forEach(i => {
          params.append(i.key, resolveAllVariables(i.value, colId, undefined, localVariables));
        });
        requestBody = params.toString();
        reqHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
      } else if (bodyMode === 'form-data') {
        const formDataPayload = [];
        for (const item of (activeRequest.body?.formData || [])) {
          if (!item.enabled || !item.key) continue;
          if (item.type === 'file' && item.file) {
            const base64 = await fileToBase64(item.file);
            formDataPayload.push({ type: 'file', key: item.key, filename: item.file.name, content: base64.split(',')[1] });
          } else {
            formDataPayload.push({ type: 'text', key: item.key, value: resolveAllVariables(item.value, colId, undefined, localVariables) });
          }
        }
        requestBody = { _isFormData: true, items: formDataPayload };
      }

      const abortController = new AbortController();
      (window as any).__abortController = abortController;

      const res = await sendRequest({
        method: activeRequest.method,
        url: finalUrl,
        headers: reqHeaders,
        body: requestBody,
        followRedirects: activeRequest.settings?.followRedirects ?? useSettingsStore.getState().settings.followRedirects,
        verifySsl: activeRequest.settings?.verifySsl ?? useSettingsStore.getState().settings.verifySsl,
        timeout: activeRequest.settings?.timeout ?? useSettingsStore.getState().settings.timeout,
        signal: abortController.signal,
      });
      const endTime = Date.now();
      const responseTime = res.responseTime || (endTime - startTime);
      const responseBody = res.body;
      const isBase64 = !!res.isBase64;

      // 3. Run combined Test script
      const scriptReturn = runTestScript(testScripts.join('\n\n'), {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers || {},
        body: responseBody,
        time: responseTime,
      }, colId, undefined, localVariables);

      const testResults = scriptReturn?.testResults || [];
      const visualizerData = scriptReturn?.visualizerData;

      setActiveResponse({
        status: res.status,
        statusText: res.statusText,
        headers: res.headers || {},
        body: responseBody,
        isBase64,
        responseTime,
        size: res.size || 0,
        testResults,
        visualizerData,
      } as any);

      // Log to Console Drawer
      useConsoleStore.getState().addLog({
        type: 'request',
        method: activeRequest.method,
        url: resolvedUrl,
        status: res.status,
        time: responseTime,
        requestHeaders: activeRequest.headers?.reduce((acc: any, h: any) => {
          if (h.key && h.enabled) acc[h.key] = resolveAllVariables(h.value, colId);
          return acc;
        }, {}) || {},
        requestBody: requestBody,
        responseHeaders: res.headers || {},
        responseBody,
      });

      // Best-effort history write — the server recomputes size and enforces
      // quota itself, so it is never trusted with the client's own numbers
      // (SEC-0.3).
      const activeWs = useAuthStore.getState().activeWorkspace;
      if (useSettingsStore.getState().settings.saveHistory && activeWs?._id) {
        api.post(`/workspaces/${activeWs._id}/history`, {
          requestSnapshot: { method: activeRequest.method, url: finalUrl, headers: reqHeaders, body: requestBody },
          responseBody: isBase64 ? `[Binary Data]` : responseBody,
          responseStatus: res.status,
          responseStatusText: res.statusText,
          responseHeaders: res.headers || {},
          responseTime,
          responseSize: res.size || 0,
          testResults,
        }).catch(() => { /* history is best-effort; never block the user */ });
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setActiveResponse({
          status: 0,
          statusText: 'Canceled',
          headers: {},
          body: 'Request was canceled by user.',
          responseTime: Date.now() - startTime,
          size: 0,
        });
        return;
      }
      const errorBody = err instanceof TransportError ? err.message : (err?.message || String(err));
      setActiveResponse({
        status: 0,
        statusText: err instanceof TransportError ? err.code : 'Error',
        headers: {},
        body: errorBody,
        responseTime: Date.now() - startTime,
        size: 0,
      });

      useConsoleStore.getState().addLog({
        type: 'request',
        method: activeRequest.method,
        url: activeRequest.url,
        status: 0,
        time: 0,
        responseBody: errorBody,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveClick = async (isAutoSave = false) => {
    if (!activeRequest) return;
    const canSave = !activeWorkspace || ['editor', 'owner'].includes(activeWorkspace.myRole) || useAuthStore.getState().user?.isSuperAdmin;
    if (!canSave) {
      if (!isAutoSave) alert('You do not have permission to save requests in this workspace.');
      return;
    }

    if (activeRequest.collectionId && activeRequest._id) {
      try {
        // 1. Instant local DB save
        import('../../db').then(({ db }) => {
          if (activeRequest._id) db.requests.update(activeRequest._id, { ...activeRequest });
        });
        
        // Instant UI update
        markSaved();
        
        // 2. Background server sync
        const { data: remoteReq } = await api.get(`/requests/${activeRequest._id}`);
        if (remoteReq.updatedAt && activeRequest.updatedAt && new Date(remoteReq.updatedAt).getTime() > new Date(activeRequest.updatedAt).getTime()) {
          if (isAutoSave) return; // Silent abort for auto-save conflict
          
          const overwrite = window.confirm('A newer version of this request exists on the server. Do you want to overwrite it? Click Cancel to save as new.');
          if (!overwrite) {
            updateActiveRequest({ isConflicted: true, isDirty: true }); // revert isDirty so user can decide
            return;
          }
        }
        
        const res = await api.put(`/requests/${activeRequest._id}`, activeRequest);
        updateActiveRequest({ updatedAt: res.data.updatedAt, isConflicted: false });
        import('../../db').then(({ db }) => {
          if (activeRequest._id) db.requests.update(activeRequest._id, { updatedAt: res.data.updatedAt });
        });
      } catch (err) {
        console.error('Failed to update request', err);
      }
    } else if (!isAutoSave) {
      setIsSaveModalOpen(true);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const settings = useSettingsStore.getState().settings;
      
      const saveShortcut = settings.shortcuts?.save || 'ctrl+s';
      const sendShortcut = settings.shortcuts?.send || 'ctrl+enter';

      const matchShortcut = (shortcut: string) => {
        return shortcut.includes('ctrl') ? (isCtrlOrCmd && key === shortcut.split('+')[1]) : (key === shortcut);
      };

      if (matchShortcut(saveShortcut)) {
        e.preventDefault();
        handleSaveClick(false);
      }
      if (matchShortcut(sendShortcut)) {
        e.preventDefault();
        handleSend();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [activeRequest, handleSaveClick, handleSend]);

  if (!activeRequest) return null;

  const handleTitleDoubleClick = () => {
    setTitleDraft(activeRequest.name);
    setIsRenamingTitle(true);
  };

  const handleTitleSave = () => {
    if (titleDraft.trim()) {
      updateActiveRequest({ name: titleDraft.trim() });
    }
    setIsRenamingTitle(false);
  };

  const isUnsaved = !activeRequest.collectionId || isDirty;

  return (
    <>
      {/* Request Name + Unsaved Indicator */}
      <div className="flex items-center gap-2 px-4 pt-2 pb-1 bg-white border-b border-gray-100">
        {isRenamingTitle ? (
          <input
            autoFocus
            className="text-sm font-medium text-gray-800 bg-gray-100 border border-blue-400 rounded px-2 py-0.5 outline-none min-w-0 w-48"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleSave();
              if (e.key === 'Escape') setIsRenamingTitle(false);
            }}
          />
        ) : (
          <span
            className="text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900 select-none max-w-xs truncate"
            onDoubleClick={handleTitleDoubleClick}
            title="Double-click to rename"
          >
            {activeRequest.name}
            {isUnsaved && <span className="text-orange-500 ml-0.5">●</span>}
          </span>
        )}
        {isUnsaved && !isRenamingTitle && (
          <span className="text-xs text-gray-400">{activeRequest.collectionId ? 'Unsaved changes' : 'Unsaved'}</span>
        )}
      </div>

      {/* URL Bar */}
      <div className="flex flex-col md:flex-row md:items-center gap-2 px-3 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex bg-gray-100 dark:bg-gray-900 rounded-md border border-gray-300 dark:border-gray-700 flex-1 overflow-hidden transition-colors focus-within:border-blue-500">
          <select
            className="bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm font-semibold outline-none border-r border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
            value={activeRequest.method}
            onChange={(e) => updateActiveRequest({ method: e.target.value })}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <div className="relative flex-1 flex items-center">
            <VariableInput
              className="flex-1"
              value={activeRequest.url}
              onChange={(val) => handleUrlChange(val)}
              onEnter={handleSend}
              placeholder="Enter request URL"
            />
          </div>
        </div>

        {/* Cookie Manager Button */}
        <button
          onClick={() => setIsCookieModalOpen(true)}
          className="flex items-center justify-center p-2 border border-gray-300 text-gray-500 rounded-md hover:bg-gray-50 transition-colors"
          title="Manage Cookies"
        >
          <Cookie size={16} />
        </button>

        {/* Code Gen Button */}
        <button
          onClick={() => setIsCodeGenOpen(true)}
          className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
          title="Code Snippet"
        >
          <Code2 size={16} />
        </button>

        {/* Save Button Group (Only for Editors) */}
        {(!activeWorkspace || ['editor', 'owner'].includes(activeWorkspace.myRole) || useAuthStore.getState().user?.isSuperAdmin) && (
          <div className={`flex flex-1 md:flex-none items-stretch rounded-md border transition-colors focus-within:ring-2 focus-within:ring-gray-200 ${isDirty ? 'border-orange-400' : 'border-gray-300 dark:border-gray-700'}`}>
            <button
              onClick={() => handleSaveClick(false)}
              className={`flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium outline-none rounded-l-md ${
                isDirty
                  ? 'text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              title="Save Request"
            >
              <Save size={16} />
              Save{isDirty ? '*' : ''}
            </button>
            
            <button
              onClick={() => setIsSaveModalOpen(true)}
              className={`px-1.5 flex items-center justify-center h-full border-l outline-none rounded-r-md ${
                isDirty 
                  ? 'border-orange-400 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20' 
                  : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              title="Save As..."
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </button>
          </div>
        )}

        {/* Send Button */}
        <div className="flex gap-1 w-full md:w-auto justify-end">
          {isLoading ? (
            <button
              onClick={() => {
                if ((window as any).__abortController) {
                  (window as any).__abortController.abort();
                  (window as any).__abortController = null;
                }
              }}
              className="flex flex-1 md:flex-none items-center justify-center gap-2 px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium transition-colors outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
            >
              <Activity size={16} className="opacity-0" />
              <span>Cancel</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => setIsLoadTestModalOpen(true)}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded-md hover:bg-orange-200 dark:hover:bg-orange-900/50 text-sm font-medium transition-colors"
                title="Load Test"
              >
                <Activity size={16} />
              </button>
              <button
                onClick={handleSend}
                className="flex flex-1 md:flex-none items-center justify-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium transition-colors outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              >
                <Play size={16} />
                Send
              </button>
            </>
          )}
        </div>
      </div>

      {isSaveModalOpen && (
        <SaveRequestModal onClose={() => setIsSaveModalOpen(false)} />
      )}
      {isLoadTestModalOpen && (
        <LoadTestModal onClose={() => setIsLoadTestModalOpen(false)} />
      )}
      {isCodeGenOpen && (
        <CodeGenModal onClose={() => setIsCodeGenOpen(false)} />
      )}
      {isCookieModalOpen && (
        <CookieManagerModal
          isOpen={isCookieModalOpen}
          onClose={() => setIsCookieModalOpen(false)}
          initialDomain={(() => {
            try {
              return new URL(activeRequest.url).hostname;
            } catch {
              return '';
            }
          })()}
        />
      )}
    </>
  );
}
