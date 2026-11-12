import { useRequestStore } from '../../store/requestStore';
import type { RequestBody } from '../../store/requestStore';
import { KeyValueEditor } from './KeyValueEditor';
import Editor from '../common/LazyEditor';
import { Wand2 } from 'lucide-react';
import { useMonacoTheme } from '../../utils/useMonacoTheme';
import { stripJsonComments } from '../../utils/jsonComments';
import { useToastStore } from '../../store/toastStore';

const CONTENT_TYPE_MAP: Record<string, string> = {
  json: 'application/json',
  xml: 'application/xml',
  html: 'text/html',
  javascript: 'application/javascript',
  text: 'text/plain',
};

export function BodyEditor() {
  const { activeRequest, updateActiveRequest } = useRequestStore();
  const monacoTheme = useMonacoTheme();

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
      // // and /* */ comments are removed on send, so they are dropped here too.
      const parsed = JSON.parse(stripJsonComments(body.raw));
      updateActiveRequest({ body: { ...body, raw: JSON.stringify(parsed, null, 2) } });
    } catch (e: any) {
      useToastStore.getState().addToast('error', `Cannot beautify - invalid JSON: ${e?.message || 'parse error'}`);
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
      <div role="radiogroup" aria-label="Body type" className="flex items-center gap-4 text-sm flex-wrap">
        {modes.map((m) => (
          <label key={m.value} data-testid={`body-mode-${m.value}`} className="flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
              name="bodyMode"
              value={m.value}
              checked={body.mode === m.value}
              onChange={() => handleModeChange(m.value)}
              className="cursor-pointer accent-primary"
            />
            <span>{m.label}</span>
          </label>
        ))}

        {body.mode === 'raw' && (
          <>
            <select
              data-testid="body-raw-language-select"
              aria-label="Raw body format"
              className="ml-4 border border-border rounded px-2 py-1 bg-background text-text outline-none focus-visible:ring-2 focus-visible:ring-primary/40 text-sm cursor-pointer"
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
                className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                title="Beautify / Format JSON"
              >
                <Wand2 size={12} aria-hidden="true" />
                Beautify
              </button>
            )}
          </>
        )}
      </div>

      {['form-data', 'urlencoded', 'graphql'].includes(body.mode) && headers.some(h => h.enabled && h.key.toLowerCase() === 'content-type') && (
        <p data-testid="body-content-type-warning" role="status" className="text-xs px-3 py-1.5 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
          The Content-Type header is ignored: it is set from the body type when you send.
        </p>
      )}

      <div className="flex-1 min-h-[200px] border border-border rounded-md overflow-hidden bg-background">
        {body.mode === 'none' && (
          <div className="flex items-center justify-center h-full text-text-muted text-sm text-center px-4">
            This request does not have a body. Pick a type above (raw, form-data, …) to send data.
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
              theme={monacoTheme}
              language={body.rawLanguage || 'json'}
              placeholder="Enter request body"
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
            <div className="flex-1 flex flex-col min-h-0 border-b border-border">
              <div className="px-2 py-1 text-xs font-semibold text-text-muted uppercase tracking-wider bg-surface">Query</div>
              <Editor
                height="100%"
                theme={monacoTheme}
                language="graphql"
                value={body.graphql?.query || ''}
                onChange={(value) => updateActiveRequest({ body: { ...body, graphql: { ...body.graphql, query: value || '', variables: body.graphql?.variables || '' } } })}
                options={{ minimap: { enabled: false }, scrollBeyondLastLine: false }}
              />
            </div>
            <div className="h-48 flex flex-col shrink-0">
              <div className="px-2 py-1 text-xs font-semibold text-text-muted uppercase tracking-wider bg-surface">GraphQL Variables</div>
              <Editor
                height="100%"
                theme={monacoTheme}
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
