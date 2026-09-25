import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, UploadCloud, Code, FileJson, Globe } from 'lucide-react';
import * as yaml from 'js-yaml';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { useRequestStore } from '../../store/requestStore';
import { useCollectionStore } from '../../store/collectionStore';

function generateSampleFromSchema(schema: any): any {
  if (!schema) return {};
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.type === 'object' || schema.properties) {
    const res: Record<string, any> = {};
    if (schema.properties) {
      for (const [key, val] of Object.entries<any>(schema.properties)) {
        res[key] = generateSampleFromSchema(val);
      }
    }
    return res;
  }
  if (schema.type === 'array') {
    return schema.items ? [generateSampleFromSchema(schema.items)] : [];
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

export default function ImportModal({ onClose }: { onClose: () => void }) {
  const { activeWorkspace } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'file' | 'openapi' | 'curl' | 'raw' | 'wsdl'>('file');
  const [rawData, setRawData] = useState('');
  const [openApiRaw, setOpenApiRaw] = useState('');
  const [wsdlUrl, setWsdlUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileParsed, setFileParsed] = useState<any>(null);
  const [fileName, setFileName] = useState('');
  const [importFormat, setImportFormat] = useState<'reqSpace' | 'openapi' | 'environment'>('reqSpace');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      try {
        let parsed: any;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = yaml.load(text);
        }
        if (parsed && typeof parsed === 'object') {
          setFileParsed(parsed);
          if (parsed.openapi || parsed.swagger) {
            setImportFormat('openapi');
          } else if (parsed._reqSpace_variable_scope === 'environment') {
            setImportFormat('environment');
          } else {
            setImportFormat('reqSpace');
          }
          setError('');
        } else {
          setError('Could not parse file. Please upload a valid JSON or YAML file.');
        }
      } catch {
        setError('Invalid file format. Please upload a valid JSON or YAML file.');
      }
    };
    reader.readAsText(file);
  };

  const importReqSpaceCollection = async (json: any) => {
    if (!activeWorkspace) return;
    const { fetchCollectionsData } = useCollectionStore.getState();
    await api.post('/collections/import', { workspaceId: activeWorkspace._id, collection: json });
    await fetchCollectionsData(activeWorkspace._id);
  };

  const importReqSpaceEnvironment = async (json: any) => {
    if (!activeWorkspace) return;
    try {
      const { setEnvironments, environments } = await import('../../store/environmentStore').then(m => m.useEnvironmentStore.getState());
      const variables = (json.values || []).map((v: any) => ({
        key: v.key || '',
        initialValue: v.value || '',
        currentValue: v.value || '',
        isSecret: v.type === 'secret',
        enabled: v.enabled !== false
      }));
      
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
    const { createCollection, fetchCollectionsData, toggleCollectionOpen } = useCollectionStore.getState();

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
            useCollectionStore.getState().setFolders([
              ...useCollectionStore.getState().folders,
              fRes.data,
            ]);
          }
        }

        const reqName = operation.summary || operation.operationId || `${method.toUpperCase()} ${pathKey}`;
        const fullUrl = `${baseUrl}${pathKey}`;

        const params: any[] = [];
        const headers: any[] = [];
        const allParams = [...(pathItem.parameters || []), ...(operation.parameters || [])];
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

        let body: any = { mode: 'none' };
        const reqBodyJson = operation.requestBody?.content?.['application/json'];
        if (reqBodyJson?.schema) {
          const sample = generateSampleFromSchema(reqBodyJson.schema);
          body = {
            mode: 'raw',
            raw: JSON.stringify(sample, null, 2),
            rawLanguage: 'json',
          };
          headers.push({ key: 'Content-Type', value: 'application/json', enabled: true });
        } else {
          const bodyParam = allParams.find(p => p.in === 'body');
          if (bodyParam?.schema) {
            const sample = generateSampleFromSchema(bodyParam.schema);
            body = {
              mode: 'raw',
              raw: JSON.stringify(sample, null, 2),
              rawLanguage: 'json',
            };
            headers.push({ key: 'Content-Type', value: 'application/json', enabled: true });
          }
        }

        const savedReq = await api.post(`/collections/${collection._id}/requests`, {
          name: reqName,
          method: method.toUpperCase(),
          url: fullUrl,
          params,
          headers,
          body,
          folderId,
        });

        useCollectionStore.getState().setRequests([
          ...useCollectionStore.getState().requests,
          savedReq.data,
        ]);
      }
    }

    await fetchCollectionsData(activeWorkspace._id);
  };

  const handleImport = async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'file') {
        if (!fileParsed) { setError('Please select a file first.'); setLoading(false); return; }
        if (importFormat === 'openapi') {
          await importOpenApiSpec(fileParsed);
        } else if (importFormat === 'environment') {
          await importReqSpaceEnvironment(fileParsed);
        } else {
          await importReqSpaceCollection(fileParsed);
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
        if (!wsdlUrl.trim()) { setError('Please enter a WSDL URL.'); setLoading(false); return; }
        await api.post(`/import/wsdl`, { url: wsdlUrl, workspaceId: activeWorkspace._id });
        const { fetchCollectionsData } = useCollectionStore.getState();
        await fetchCollectionsData(activeWorkspace._id);
      }
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[9999]">
      <div className="bg-gray-900 text-gray-100 rounded-lg shadow-2xl w-[640px] h-[480px] flex flex-col border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800 bg-gray-850">
          <h2 className="text-base font-semibold text-gray-100">Import</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-850 rounded text-gray-400 hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-800 px-5 gap-2 bg-gray-900">
          <button
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'file'
                ? 'border-orange-500 text-orange-400 font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
            onClick={() => setActiveTab('file')}
          >
            <FileJson size={14} />
            <span>Collection / Spec File</span>
          </button>
          <button
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'openapi'
                ? 'border-orange-500 text-orange-400 font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
            onClick={() => setActiveTab('openapi')}
          >
            <Globe size={14} />
            <span>OpenAPI / Swagger</span>
          </button>
          <button
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'curl'
                ? 'border-orange-500 text-orange-400 font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
            onClick={() => setActiveTab('curl')}
          >
            <Code size={14} />
            <span>cURL</span>
          </button>
          <button
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'raw'
                ? 'border-orange-500 text-orange-400 font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
            onClick={() => setActiveTab('raw')}
          >
            <Code size={14} />
            <span>Raw HTTP</span>
          </button>
          <button
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'wsdl'
                ? 'border-orange-500 text-orange-400 font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
            onClick={() => setActiveTab('wsdl')}
          >
            <Globe size={14} />
            <span>WSDL (SOAP)</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 p-5 flex flex-col min-h-0 overflow-y-auto">
          {error && (
            <div className="bg-red-900/30 border border-red-500 text-red-300 p-2.5 rounded text-xs mb-3">
              {error}
            </div>
          )}

          {activeTab === 'file' && (
            <div className="flex-1 flex flex-col">
              <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-700 hover:border-orange-500/60 rounded-lg p-8 text-center bg-gray-850/50 hover:bg-gray-800/40 transition cursor-pointer relative">
                <input
                  type="file"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={handleFileUpload}
                  accept=".json,.yaml,.yml"
                />
                <UploadCloud className="w-10 h-10 text-gray-400 mb-2.5" />
                {fileParsed ? (
                  <>
                    <div className="font-medium text-emerald-400 text-sm mb-1">✓ {fileName}</div>
                    <div className="text-xs text-gray-400">
                      Format: <span className="text-orange-400 font-semibold">{importFormat === 'openapi' ? 'OpenAPI / Swagger' : importFormat === 'environment' ? 'ReqSpace Environment' : 'ReqSpace Collection'}</span>
                      {fileParsed.name ? ` ("${fileParsed.name}")` : fileParsed.info?.name ? ` ("${fileParsed.info.name}")` : (fileParsed.info?.title ? ` ("${fileParsed.info.title}")` : '')}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-medium text-gray-200 mb-1">
                      Drag & drop ReqSpace Collection or OpenAPI / Swagger file
                    </div>
                    <div className="text-xs text-gray-400">Supports .json, .yaml, .yml</div>
                  </>
                )}
              </label>
            </div>
          )}

          {activeTab === 'openapi' && (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-300">
                  Paste OpenAPI 3.0 or Swagger 2.0 definition (JSON or YAML)
                </label>
              </div>
              <textarea
                className="flex-1 p-3 border border-gray-700 rounded bg-gray-950 font-mono text-xs text-gray-200 resize-none focus:border-orange-500 outline-none"
                value={openApiRaw}
                onChange={(e) => setOpenApiRaw(e.target.value)}
                placeholder={'openapi: "3.0.0"\ninfo:\n  title: Sample API\n  version: 1.0.0\npaths:\n  /users:\n    get:\n      summary: List users'}
              />
            </div>
          )}

          {activeTab === 'curl' && (
            <div className="flex-1 flex flex-col">
              <label className="text-xs font-medium text-gray-300 mb-1.5">Paste cURL command</label>
              <textarea
                className="flex-1 p-3 border border-gray-700 rounded bg-gray-950 font-mono text-xs text-gray-200 resize-none focus:border-orange-500 outline-none"
                value={rawData}
                onChange={(e) => setRawData(e.target.value)}
                placeholder='curl -X GET "https://api.example.com/users" -H "Authorization: Bearer token"'
              />
            </div>
          )}
          {activeTab === 'raw' && (
            <div className="flex-1 flex flex-col">
              <label className="text-xs font-medium text-gray-300 mb-1.5">Paste Raw HTTP request</label>
              <textarea
                className="flex-1 p-3 border border-gray-700 rounded bg-gray-950 font-mono text-xs text-gray-200 resize-none focus:border-orange-500 outline-none"
                value={rawData}
                onChange={(e) => setRawData(e.target.value)}
                placeholder={`POST /api/users HTTP/1.1\nHost: example.com\nContent-Type: application/json\n\n{\n  "name": "Test"\n}`}
              />
            </div>
          )}
          {activeTab === 'wsdl' && (
            <div className="flex-1 flex flex-col">
              <label className="text-xs font-medium text-gray-300 mb-1.5">Enter WSDL URL</label>
              <input
                type="url"
                className="w-full p-3 border border-gray-700 rounded bg-gray-950 font-mono text-xs text-gray-200 focus:border-orange-500 outline-none"
                value={wsdlUrl}
                onChange={(e) => setWsdlUrl(e.target.value)}
                placeholder='http://www.dneonline.com/calculator.asmx?wsdl'
              />
              <p className="text-xs text-gray-500 mt-3">
                A new collection will be created with all SOAP operations parsed from the WSDL file.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-800 flex justify-end gap-2 bg-gray-850">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 border border-gray-700 rounded hover:bg-gray-700 text-xs font-medium text-gray-300 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={
              loading ||
              (activeTab === 'file' ? !fileParsed : activeTab === 'openapi' ? !openApiRaw.trim() : (activeTab === 'curl' || activeTab === 'raw') ? !rawData.trim() : !wsdlUrl.trim())
            }
            className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded font-medium disabled:opacity-50 text-xs transition"
          >
            {loading ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
