import Editor from '../common/LazyEditor';
import { useMonacoTheme } from '../../utils/useMonacoTheme';

interface ScriptEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

const SNIPPETS = [
  { label: 'Get Environment Variable', code: 'pm.environment.get("variable_key");' },
  { label: 'Set Environment Variable', code: 'pm.environment.set("variable_key", "variable_value");' },
  { label: 'Clear Environment Variable', code: 'pm.environment.unset("variable_key");' },
  { label: 'Check Status Code is 200', code: 'pm.test("Status code is 200", function () {\n    pm.expect(pm.response.status).to.equal(200);\n});' },
  { label: 'Response body contains string', code: 'pm.test("Body matches string", function () {\n    pm.expect(pm.response.text()).to.include("string_you_want_to_search");\n});' },
  { label: 'JSON value check', code: 'pm.test("Your test name", function () {\n    var jsonData = pm.response.json();\n    pm.expect(jsonData.value).to.eql(100);\n});' },
  { label: 'Response time is less than 200ms', code: 'pm.test("Response time is less than 200ms", function () {\n    pm.expect(pm.response.responseTime).to.be.below(200);\n});' },
  { label: 'Set request header (pre-request)', code: '// pm.request.headers is a plain object: use assignment. headers.add() is not supported.\npm.request.headers["X-Header"] = "value";' },
  { label: 'Send a request', code: 'pm.sendRequest("https://reqspace-echo.com/get", function (err, response) {\n    console.log(response.json());\n});' },
];

export function ScriptEditor({ value, onChange }: ScriptEditorProps) {
  const monacoTheme = useMonacoTheme();
  const insertSnippet = (code: string) => {
    const newVal = value ? value + '\n' + code : code;
    onChange(newVal);
  };

  return (
    <div className="flex h-full gap-4">
      <div data-testid="monaco-editor-container" className="flex-1 h-full min-h-[200px] border border-border rounded-md overflow-hidden bg-background pt-2">
        <Editor
          height="100%"
          language="javascript"
          placeholder="Write JavaScript to run for this request"
          theme={monacoTheme}
          value={value}
          onChange={(val) => onChange(val || '')}
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            lineNumbers: 'on',
          }}
        />
      </div>
      <div className="w-56 shrink-0 flex flex-col border border-border rounded-md bg-surface">
        <div className="p-2 border-b border-border text-sm font-semibold text-text">
          Snippets
        </div>
        <div className="flex-1 overflow-y-auto p-1 scrollbar-hide">
          {SNIPPETS.map((snippet, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => insertSnippet(snippet.code)}
              title="Insert snippet"
              className="block w-full text-left text-xs text-text px-2 py-1.5 rounded hover:bg-border/50 hover:text-primary"
            >
              {snippet.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
