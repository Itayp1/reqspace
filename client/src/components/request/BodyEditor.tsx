import { useRequestStore } from '../../store/requestStore';
import type { RequestBody } from '../../store/requestStore';
import { KeyValueEditor } from './KeyValueEditor';
import Editor from '@monaco-editor/react';
import { Wand2 } from 'lucide-react';

const CONTENT_TYPE_MAP: Record<string, string> = {
  json: 'application/json',
  xml: 'application/xml',
  html: 'text/html',
  javascript: 'application/javascript',
  text: 'text/plain',
};

export function BodyEditor() {
  const { activeRequest, updateActiveRequest } = useRequestStore();

  if (!activeRequest) return null;

  const { body, headers = [] } = activeRequest;

  const handleModeChange = (mode: RequestBody['mode']) => {
    updateActiveRequest({ body: { ...body, mode } });
  };

  const handleRawLanguageChange = (rawLanguage: RequestBody['rawLanguage']) => {
    // Auto-set Content-Type header based on selected language
    const contentTypeValue = CONTENT_TYPE_MAP[rawLanguage || 'text'] || 'text/plain';
    const existingIdx = headers.findIndex(h => h.key.toLowerCase() === 'content-type');
    let newHeaders = [...headers];
    if (existingIdx >= 0) {
      newHeaders[existingIdx] = { ...newHeaders[existingIdx], value: contentTypeValue, enabled: true };
    } else {
      newHeaders = [...newHeaders, { key: 'Content-Type', value: contentTypeValue, enabled: true, description: '' }];
    }
    updateActiveRequest({ body: { ...body, rawLanguage }, headers: newHeaders });
  };

  const handleBeautifyJson = () => {
    if (!body.raw) return;
    try {
      const parsed = JSON.parse(body.raw);
      updateActiveRequest({ body: { ...body, raw: JSON.stringify(parsed, null, 2) } });
    } catch {
      // not valid JSON — do nothing
    }
  };

  const modes: Array<{ label: string; value: RequestBody['mode'] }> = [
    { label: 'none', value: 'none' },
    { label: 'form-data', value: 'form-data' },
    { label: 'x-www-form-urlencoded', value: 'urlencoded' },
    { label: 'raw', value: 'raw' },
    { label: 'GraphQL', value: 'graphql' },
  ];

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex items-center gap-4 text-sm flex-wrap">
        {modes.map((m) => (
          <label key={m.value} data-testid={`body-mode-${m.value}`} className="flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
              name="bodyMode"
              value={m.value}
              checked={body.mode === m.value}
              onChange={() => handleModeChange(m.value)}
              className="cursor-pointer"
            />
            <span>{m.label}</span>
          </label>
        ))}

        {body.mode === 'raw' && (
          <>
            <select
              data-testid="body-raw-language-select"
              className="ml-4 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none text-sm cursor-pointer"
              value={body.rawLanguage || 'json'}
              onChange={(e) => handleRawLanguageChange(e.target.value as any)}
            >
              <option value="text">Text</option>
              <option value="json">JSON</option>
              <option value="html">HTML</option>
              <option value="xml">XML</option>
              <option value="javascript">JavaScript</option>
            </select>

            {(body.rawLanguage === 'json' || !body.rawLanguage) && (
              <button
                onClick={handleBeautifyJson}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/20 transition-colors"
                title="Beautify / Format JSON"
              >
                <Wand2 size={12} />
                Beautify
              </button>
            )}
          </>
        )}
      </div>

      <div className="flex-1 min-h-[200px] border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden bg-white dark:bg-gray-900">
        {body.mode === 'none' && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            This request does not have a body
          </div>
        )}
        
        {body.mode === 'form-data' && (
          <div className="p-4 overflow-y-auto h-full">
            <KeyValueEditor
              items={body.formData || []}
              onChange={(items) => updateActiveRequest({ body: { ...body, formData: items } })}
              allowFiles={true}
            />
          </div>
        )}

        {body.mode === 'urlencoded' && (
          <div className="p-4 overflow-y-auto h-full">
            <KeyValueEditor
              items={body.urlencoded || []}
              onChange={(items) => updateActiveRequest({ body: { ...body, urlencoded: items } })}
            />
          </div>
        )}

        {body.mode === 'raw' && (
          <div data-testid="monaco-editor-container" className="h-full pt-2">
            <Editor
              height="100%"
              theme="vs-dark"
              language={body.rawLanguage || 'json'}
              value={body.raw || ''}
              onChange={(value) => updateActiveRequest({ body: { ...body, raw: value || '' } })}
              options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                lineNumbers: 'on',
              }}
            />
          </div>
        )}

        {body.mode === 'graphql' && (
          <div className="h-full flex flex-col pt-2">
            <div className="flex-1 flex flex-col min-h-0 border-b border-gray-200 dark:border-gray-700">
              <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-gray-800/50">Query</div>
              <Editor
                height="100%"
                theme="vs-dark"
                language="graphql"
                value={body.graphql?.query || ''}
                onChange={(value) => updateActiveRequest({ body: { ...body, graphql: { ...body.graphql, query: value || '', variables: body.graphql?.variables || '' } } })}
                options={{ minimap: { enabled: false }, scrollBeyondLastLine: false }}
              />
            </div>
            <div className="h-48 flex flex-col shrink-0">
              <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-gray-800/50">GraphQL Variables</div>
              <Editor
                height="100%"
                theme="vs-dark"
                language="json"
                value={body.graphql?.variables || ''}
                onChange={(value) => updateActiveRequest({ body: { ...body, graphql: { ...body.graphql, query: body.graphql?.query || '', variables: value || '' } } })}
                options={{ minimap: { enabled: false }, scrollBeyondLastLine: false }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
