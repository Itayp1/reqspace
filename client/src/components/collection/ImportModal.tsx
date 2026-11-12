import { useEscape } from '../../hooks/useEscape';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, UploadCloud, FileUp, Braces, Terminal, FileText, FileCode } from 'lucide-react';
import * as yaml from 'js-yaml';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { useRequestStore } from '../../store/requestStore';
import { useCollectionStore } from '../../store/collectionStore';
import { useToastStore } from '../../store/toastStore';

// Follows an internal `#/a/b` reference. External refs are never fetched (no
// SSRF, no hanging): they resolve to undefined and the caller falls back.
function resolveRef(doc: any, node: any, seen: Set<string> = new Set()): any {
  while (node && typeof node === 'object' && typeof node.$ref === 'string') {
    const ref: string = node.$ref;
    if (!ref.startsWith('#/') || seen.has(ref)) return undefined;
    seen.add(ref);
    node = ref.slice(2).split('/').reduce((cur: any, part) => (
      cur == null ? undefined : cur[decodeURIComponent(part).replace(/~1/g, '/').replace(/~0/g, '~')]
    ), doc);
  }
  return node;
}

function generateSampleFromSchema(schema: any, doc: any = null, stack: string[] = []): any {
  if (!schema) return {};
  if (typeof schema.$ref === 'string') {
    // A schema that refers back to one being expanded is a cycle: cut it off.
    if (stack.includes(schema.$ref)) return {};
    const target = resolveRef(doc, schema);
    return target ? generateSampleFromSchema(target, doc, [...stack, schema.$ref]) : {};
  }
  if (Array.isArray(schema.allOf)) {
    return Object.assign({}, ...schema.allOf.map((s: any) => generateSampleFromSchema(s, doc, stack)));
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.type === 'object' || schema.properties) {
    const res: Record<string, any> = {};
    if (schema.properties) {
      for (const [key, val] of Object.entries<any>(schema.properties)) {
        res[key] = generateSampleFromSchema(val, doc, stack);
      }
    }
    return res;
  }
  if (schema.type === 'array') {
    return schema.items ? [generateSampleFromSchema(schema.items, doc, stack)] : [];
  }
  if (schema.type === 'string') {
    if (schema.format === 'email') return 'user@example.com';
    if (schema.format === 'date-time') return new Date().toISOString();
    return 'string';
  }
  if (schema.type === 'integer' || schema.type === 'number') return 0;
  if (schema.type === 'boolean') return true;
  return null;
}

// Maps the operation's (or the spec's) first security requirement to the
// request's Auth tab. OpenAPI 3 keeps schemes in components.securitySchemes,
// Swagger 2 in securityDefinitions.
function authFromSecurity(spec: any, operation: any): any {
  const requirements = operation.security ?? spec.security;
  if (!Array.isArray(requirements) || requirements.length === 0) return undefined;
  const schemes = spec.components?.securitySchemes || spec.securityDefinitions || {};
  const name = Object.keys(requirements[0] || {})[0];
  const scheme = name ? resolveRef(spec, schemes[name]) : undefined;
  if (!scheme) return undefined;
  const type = String(scheme.type || '').toLowerCase();
  const httpScheme = String(scheme.scheme || '').toLowerCase();
  if (type === 'http' && httpScheme === 'bearer') {
    return { type: 'bearer', bearer: { token: '' } };
  }
  if (type === 'basic' || (type === 'http' && httpScheme === 'basic')) {
    return { type: 'basic', basic: { username: '', password: '' } };
  }
  if (type === 'apikey') {
    return { type: 'apikey', apikey: { key: scheme.name || '', value: '', in: scheme.in === 'query' ? 'query' : 'header' } };
  }
  if (type === 'oauth2' || type === 'openidconnect') {
    const flow = scheme.flows ? Object.values<any>(scheme.flows)[0] : scheme;
    return {
      type: 'oauth2',
      oauth2: {
        token: '',
        authUrl: flow?.authorizationUrl || '',
        accessTokenUrl: flow?.tokenUrl || '',
        scope: flow?.scopes ? Object.keys(flow.scopes).join(' ') : '',
      },
    };
  }
  return undefined;
}

// An environment file is a Postman export (`values` + scope marker) or this
// app's own environment export (`variables`, no collection `info`/`item`).
// The app's own export used to be treated as a collection, so it could never
// be imported back.
// Returns a message when the command cannot be parsed (an unclosed quote).
function curlProblem(text: string): string {
  const t = text.trim();
  if (!t) return '';
  let quote = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quote === '"' && c === '\\') i++;
    else if (quote) { if (c === quote) quote = ''; }
    else if (c === '\\') i++;
    else if (c === '"' || c === "'") quote = c;
  }
  return quote ? `Unclosed ${quote === '"' ? 'double' : 'single'} quote.` : '';
}

function isEnvironmentFile(parsed: any): boolean {
  if (parsed._postman_variable_scope === 'environment' || parsed._reqSpace_variable_scope === 'environment') return true;
  if (parsed.info || Array.isArray(parsed.item)) return false;
  return Array.isArray(parsed.values) || Array.isArray(parsed.variables);
}

export default function ImportModal({ onClose }: { onClose: () => void }) {
  useEscape(onClose);
  const { activeWorkspace } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'file' | 'openapi' | 'curl' | 'raw' | 'wsdl'>('file');
  const [rawData, setRawData] = useState('');
  const [openApiRaw, setOpenApiRaw] = useState('');
  const [wsdlUrl, setWsdlUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [wsdlText, setWsdlText] = useState('');
  type ImportFormat = 'reqSpace' | 'openapi' | 'environment';
  // Every file picked or dropped, imported one after the other.
  const [fileQueue, setFileQueue] = useState<{ name: string; parsed: any; format: ImportFormat }[]>([]);
  const fileParsed = fileQueue[0]?.parsed ?? null;
  const fileName = fileQueue.length > 1 ? `${fileQueue.length} files` : (fileQueue[0]?.name ?? '');
  const importFormat: ImportFormat = fileQueue[0]?.format ?? 'reqSpace';

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const queue: { name: string; parsed: any; format: ImportFormat }[] = [];
    const failed: string[] = [];
    for (const file of files) {
      try {
        const text = await file.text();
        let parsed: any;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = yaml.load(text);
        }
        if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
        const format: ImportFormat = (parsed.openapi || parsed.swagger) ? 'openapi' : isEnvironmentFile(parsed) ? 'environment' : 'reqSpace';
        queue.push({ name: file.name, parsed, format });
      } catch {
        failed.push(file.name);
      }
    }
    setFileQueue(queue);
    if (failed.length === 0) setError('');
    else if (files.length === 1) setError('Invalid file format. Please upload a valid JSON or YAML file.');
    else setError(`Could not parse: ${failed.join(', ')}`);
  };

  const handleWsdlFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWsdlText(await file.text());
    setError('');
  };

  const importReqSpaceCollection = async (json: any) => {
    if (!activeWorkspace) return;
    const { loadWorkspace, openCollection } = useCollectionStore.getState();
    const res = await api.post('/collections/import', { workspaceId: activeWorkspace._id, collection: json });
    await loadWorkspace(activeWorkspace._id);
    if (res.data?.collectionId) openCollection(res.data.collectionId);
    useToastStore.getState().addToast('success', `Imported ${res.data?.requests ?? 0} request(s) in ${res.data?.folders ?? 0} folder(s)`);
  };

  const importReqSpaceEnvironment = async (json: any) => {
    if (!activeWorkspace) return;
    try {
      const { setEnvironments, environments } = await import('../../store/environmentStore').then(m => m.useEnvironmentStore.getState());
      // Postman files list `values`; this app's own export keeps `variables`
      // in the editor's shape.
      const source: any[] = Array.isArray(json.values) ? json.values : (Array.isArray(json.variables) ? json.variables : []);
      const variables = source.filter((v: any) => v && v.key).map((v: any) => {
        const value = v.currentValue || v.value || v.initialValue || '';
        return {
          key: String(v.key),
          initialValue: String(v.initialValue ?? v.value ?? ''),
          currentValue: String(value),
          isSecret: v.isSecret === true || v.type === 'secret',
          enabled: v.enabled !== false,
        };
      });
      
      const res = await api.post(`/workspaces/${activeWorkspace._id}/environments`, {
        name: json.name || 'Imported Environment',
        variables
      });
      setEnvironments([...environments, res.data]);
      useRequestStore.getState().openEnvironmentTab(res.data._id, res.data.name);
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const importOpenApiSpec = async (spec: any) => {
    if (!activeWorkspace || !spec) return;
    const { createCollection, loadWorkspace, toggleCollectionOpen } = useCollectionStore.getState();

    const title = spec.info?.title || 'OpenAPI Import';
    const collection = await createCollection(activeWorkspace._id, title);
    toggleCollectionOpen(collection._id);

    let baseUrl = '';
    if (spec.servers && spec.servers.length > 0 && spec.servers[0].url) {
      baseUrl = spec.servers[0].url;
    } else if (spec.host) {
      const scheme = spec.schemes?.[0] || 'https';
      const basePath = spec.basePath || '';
      baseUrl = `${scheme}://${spec.host}${basePath}`;
    }

    const foldersMap = new Map<string, string>();
    const paths = spec.paths || {};
    const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];

    for (const [pathKey, pathItem] of Object.entries<any>(paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue;

      for (const method of httpMethods) {
        const operation = pathItem[method];
        if (!operation) continue;

        const tag = operation.tags?.[0];
        let folderId: string | null = null;
        if (tag) {
          if (foldersMap.has(tag)) {
            folderId = foldersMap.get(tag)!;
          } else {
            const fRes = await api.post(`/collections/${collection._id}/folders`, {
              name: tag,
            });
            folderId = fRes.data._id;
            foldersMap.set(tag, fRes.data._id);
          }
        }

        const reqName = operation.summary || operation.operationId || `${method.toUpperCase()} ${pathKey}`;
        const fullUrl = `${baseUrl}${pathKey}`;

        const params: any[] = [];
        const headers: any[] = [];
        const allParams = [...(pathItem.parameters || []), ...(operation.parameters || [])]
          .map((p: any) => resolveRef(spec, p))
          .filter((p: any) => p && typeof p === 'object');
        for (const p of allParams) {
          if (p.in === 'query') {
            params.push({
              key: p.name,
              value: p.schema?.default !== undefined ? String(p.schema.default) : (p.example !== undefined ? String(p.example) : ''),
              enabled: p.required ?? false,
              description: p.description || '',
            });
          } else if (p.in === 'header') {
            headers.push({
              key: p.name,
              value: p.schema?.default !== undefined ? String(p.schema.default) : (p.example !== undefined ? String(p.example) : ''),
              enabled: p.required ?? false,
              description: p.description || '',
            });
          }
        }

        const auth = authFromSecurity(spec, operation);

        let body: any = { mode: 'none' };
        const reqBodyJson = resolveRef(spec, operation.requestBody)?.content?.['application/json'];
        if (reqBodyJson?.schema) {
          const sample = generateSampleFromSchema(reqBodyJson.schema, spec);
          body = {
            mode: 'raw',
            raw: JSON.stringify(sample, null, 2),
            rawLanguage: 'json',
          };
          headers.push({ key: 'Content-Type', value: 'application/json', enabled: true });
        } else {
          const bodyParam = allParams.find(p => p.in === 'body');
          if (bodyParam?.schema) {
            const sample = generateSampleFromSchema(bodyParam.schema, spec);
            body = {
              mode: 'raw',
              raw: JSON.stringify(sample, null, 2),
              rawLanguage: 'json',
            };
            headers.push({ key: 'Content-Type', value: 'application/json', enabled: true });
          }
        }

        await api.post(`/collections/${collection._id}/requests`, {
          name: reqName,
          method: method.toUpperCase(),
          url: fullUrl,
          params,
          headers,
          body,
          folderId,
          ...(auth ? { auth } : {}),
        });

      }
    }

    await loadWorkspace(activeWorkspace._id);
  };

  const curlError = activeTab === 'curl' ? curlProblem(rawData) : '';

  const handleImport = async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'file') {
        if (fileQueue.length === 0) { setError('Please select a file first.'); setLoading(false); return; }
        for (const f of fileQueue) {
          try {
            if (f.format === 'openapi') await importOpenApiSpec(f.parsed);
            else if (f.format === 'environment') await importReqSpaceEnvironment(f.parsed);
            else await importReqSpaceCollection(f.parsed);
          } catch (err: any) {
            if (fileQueue.length > 1 && err?.response?.data?.message) err.response.data.message = `${f.name}: ${err.response.data.message}`;
            throw err;
          }
        }
      } else if (activeTab === 'openapi') {
        if (!openApiRaw.trim()) { setError('Please enter OpenAPI / Swagger definition.'); setLoading(false); return; }
        let parsed: any;
        try {
          parsed = JSON.parse(openApiRaw);
        } catch {
          parsed = yaml.load(openApiRaw);
        }
        if (!parsed || (!parsed.openapi && !parsed.swagger && !parsed.paths)) {
          setError('Invalid OpenAPI or Swagger specification. Missing paths or version.');
          setLoading(false);
          return;
        }
        await importOpenApiSpec(parsed);
      } else if (activeTab === 'curl') {
        // shortcut: only rejects clearly invalid input (no leading "curl" or no URL-like token); the server parser stays lenient.
        if (!/^curl\s/i.test(rawData.trim()) || !/https?:\/\/|localhost|\w\.\w/i.test(rawData)) {
          setError('Not a valid cURL command. It must start with "curl" and include a URL.');
          setLoading(false);
          return;
        }
        const res = await api.post(`/requests/import/curl`, { workspaceId: activeWorkspace._id, curl: rawData });
        useRequestStore.getState().setActiveRequest({
          ...res.data,
          _id: res.data._id || Date.now().toString(),
        });
      } else if (activeTab === 'raw') {
        const res = await api.post(`/requests/import/raw-http`, { workspaceId: activeWorkspace._id, raw: rawData });
        useRequestStore.getState().setActiveRequest({
          ...res.data,
          _id: res.data._id || Date.now().toString(),
        });
      } else if (activeTab === 'wsdl') {
        if (!wsdlUrl.trim() && !wsdlText.trim()) { setError('Please enter a WSDL URL or provide a WSDL document.'); setLoading(false); return; }
        let wsdl = wsdlText;
        if (!wsdl.trim()) {
          // Fetched from the user's own machine (not the server) so internal hosts work and the server is not a request relay.
          const { getTransport, normalizeRequestUrl } = await import('../../transport');
          const r = await getTransport().send({ method: 'GET', url: normalizeRequestUrl(wsdlUrl) });
          if (r.status < 200 || r.status >= 300 || !r.body || r.isBase64) throw new Error(`Could not load the WSDL (HTTP ${r.status})`);
          wsdl = r.body;
        }
        await api.post(`/import/wsdl`, { wsdl, workspaceId: activeWorkspace._id });
        const { loadWorkspace } = useCollectionStore.getState();
        await loadWorkspace(activeWorkspace._id);
      }
      onClose();
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Import failed';
      setError(message);
      useToastStore.getState().addToast('error', message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'p-3 border border-border rounded bg-background text-text placeholder:text-text-muted font-mono text-xs focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 outline-none';
  const labelClass = 'text-xs font-medium text-text mb-1.5';
  // Icons show the input type: upload, pasted spec, shell command, HTTP text, SOAP document.
  const tabs = [
    { id: 'file', label: 'Collection / Spec File', Icon: FileUp },
    { id: 'openapi', label: 'OpenAPI / Swagger', Icon: Braces },
    { id: 'curl', label: 'cURL', Icon: Terminal },
    { id: 'raw', label: 'Raw HTTP', Icon: FileText },
    { id: 'wsdl', label: 'WSDL (SOAP)', Icon: FileCode },
  ] as const;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[9999]">
      <div role="dialog" aria-modal="true" aria-label="Import" className="bg-background text-text rounded-lg shadow-2xl w-[640px] max-w-[95vw] h-[480px] max-h-[90vh] flex flex-col border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="text-base font-semibold">Import</h2>
          <button data-testid="import-close" aria-label="Close" onClick={onClose} className="p-1 hover:bg-surface rounded text-text-muted hover:text-text focus-visible:ring-2 focus-visible:ring-primary/40 outline-none">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div role="tablist" aria-label="Import source" className="flex border-b border-border px-5 gap-2 overflow-x-auto">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeTab === id}
              className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                activeTab === id
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
              data-testid={`import-tab-${id}`}
              onClick={() => { setActiveTab(id); setError(''); }}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 p-5 flex flex-col min-h-0 overflow-y-auto">
          {error && (
            <div data-testid="import-error" role="alert" className="bg-red-500/10 border border-red-500/40 text-red-600 dark:text-red-400 p-2.5 rounded text-xs mb-3">
              {error}
            </div>
          )}

          {activeTab === 'file' && (
            <div className="flex-1 flex flex-col">
              <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border hover:border-primary/60 focus-within:border-primary rounded-lg p-8 text-center bg-surface hover:bg-surface/70 transition-colors cursor-pointer relative">
                <input
                  data-testid="import-file-input"
                  type="file"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={handleFileUpload}
                  multiple
                  accept=".json,.yaml,.yml"
                />
                <UploadCloud className="w-10 h-10 text-text-muted mb-2.5" aria-hidden="true" />
                {fileParsed ? (
                  <>
                    <div className="font-medium text-green-600 dark:text-green-400 text-sm mb-1 break-all">✓ {fileName}</div>
                    <div className="text-xs text-text-muted">
                      Format: <span data-testid="import-detected-format" className="text-primary font-semibold">{importFormat === 'openapi' ? 'OpenAPI / Swagger' : importFormat === 'environment' ? 'ReqSpace Environment' : 'ReqSpace Collection'}</span>
                      {fileQueue.length > 1 ? ` (+${fileQueue.length - 1} more)` : ''}
                      {fileQueue.length > 1 ? '' : fileParsed.name ? ` ("${fileParsed.name}")` : fileParsed.info?.name ? ` ("${fileParsed.info.name}")` : (fileParsed.info?.title ? ` ("${fileParsed.info.title}")` : '')}
                    </div>
                    <div className="text-xs text-text-muted mt-1">Click to choose different files</div>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-medium mb-1">
                      Drag & drop or click to choose a ReqSpace collection, environment or OpenAPI / Swagger file
                    </div>
                    <div className="text-xs text-text-muted">Supports .json, .yaml, .yml</div>
                  </>
                )}
              </label>
            </div>
          )}

          {activeTab === 'openapi' && (
            <div className="flex-1 flex flex-col">
              <label htmlFor="import-openapi-input" className={labelClass}>
                Paste OpenAPI 3.0 or Swagger 2.0 definition (JSON or YAML)
              </label>
              <textarea
                id="import-openapi-input"
                data-testid="import-openapi-input"
                spellCheck={false}
                className={`flex-1 resize-none ${inputClass}`}
                value={openApiRaw}
                onChange={(e) => setOpenApiRaw(e.target.value)}
                placeholder={'openapi: "3.0.0"\ninfo:\n  title: Sample API\n  version: 1.0.0\npaths:\n  /users:\n    get:\n      summary: List users'}
              />
            </div>
          )}

          {activeTab === 'curl' && (
            <div className="flex-1 flex flex-col">
              <label htmlFor="import-curl-input" className={labelClass}>Paste cURL command</label>
              <textarea
                id="import-curl-input"
                data-testid="import-curl-input"
                spellCheck={false}
                className={`flex-1 resize-none ${inputClass}`}
                value={rawData}
                onChange={(e) => setRawData(e.target.value)}
                placeholder='curl -X GET "https://api.example.com/users" -H "Authorization: Bearer token"'
              />
              {curlError && <p data-testid="import-curl-error" className="text-xs text-red-600 dark:text-red-400 mt-1.5">{curlError}</p>}
            </div>
          )}
          {activeTab === 'raw' && (
            <div className="flex-1 flex flex-col">
              <label htmlFor="import-raw-input" className={labelClass}>Paste raw HTTP request</label>
              <textarea
                id="import-raw-input"
                data-testid="import-raw-input"
                spellCheck={false}
                className={`flex-1 resize-none ${inputClass}`}
                value={rawData}
                onChange={(e) => setRawData(e.target.value)}
                placeholder={`POST /api/users HTTP/1.1\nHost: example.com\nContent-Type: application/json\n\n{\n  "name": "Test"\n}`}
              />
            </div>
          )}
          {activeTab === 'wsdl' && (
            <div className="flex-1 flex flex-col">
              <label htmlFor="import-wsdl-input" className={labelClass}>WSDL URL</label>
              <input
                id="import-wsdl-input"
                data-testid="import-wsdl-input"
                type="url"
                spellCheck={false}
                className={`w-full ${inputClass}`}
                value={wsdlUrl}
                onChange={(e) => setWsdlUrl(e.target.value)}
                placeholder='http://www.dneonline.com/calculator.asmx?wsdl'
              />
              <label htmlFor="import-wsdl-file" className={`${labelClass} mt-3`}>Or upload / paste a WSDL document</label>
              <input
                id="import-wsdl-file"
                data-testid="import-wsdl-file"
                type="file"
                accept=".wsdl,.xml"
                onChange={handleWsdlFile}
                className="text-xs text-text-muted mb-2"
              />
              <textarea
                aria-label="WSDL document"
                data-testid="import-wsdl-text"
                spellCheck={false}
                className={`h-24 resize-none ${inputClass}`}
                value={wsdlText}
                onChange={(e) => setWsdlText(e.target.value)}
                placeholder="<definitions ...>"
              />
              <p className="text-xs text-text-muted mt-3">
                Creates a new collection with all SOAP operations parsed from the WSDL.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button
            data-testid="import-cancel"
            onClick={onClose}
            className="px-3.5 py-1.5 border border-border rounded hover:bg-surface text-xs font-medium text-text transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
          >
            Cancel
          </button>
          <button
            data-testid="import-submit"
            onClick={handleImport}
            disabled={
              loading || !!curlError ||
              (activeTab === 'file' ? fileQueue.length === 0 : activeTab === 'openapi' ? !openApiRaw.trim() : (activeTab === 'curl' || activeTab === 'raw') ? !rawData.trim() : !wsdlUrl.trim() && !wsdlText.trim())
            }
            className="px-4 py-1.5 bg-primary-strong hover:bg-primary/90 text-white rounded font-medium disabled:opacity-50 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none"
          >
            {loading ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
