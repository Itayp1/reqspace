import Editor from '@monaco-editor/react';

interface ScriptEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

const SNIPPETS = [
  { label: 'Get Environment Variable', code: 'pm.environment.get("variable_key");' },
  { label: 'Set Environment Variable', code: 'pm.environment.set("variable_key", "variable_value");' },
  { label: 'Clear Environment Variable', code: 'pm.environment.unset("variable_key");' },
  { label: 'Check Status Code is 200', code: 'pm.test("Status code is 200", function () {\n    pm.response.to.have.status(200);\n});' },
  { label: 'Response body contains string', code: 'pm.test("Body matches string", function () {\n    pm.expect(pm.response.text()).to.include("string_you_want_to_search");\n});' },
  { label: 'JSON value check', code: 'pm.test("Your test name", function () {\n    var jsonData = pm.response.json();\n    pm.expect(jsonData.value).to.eql(100);\n});' },
  { label: 'Response time is less than 200ms', code: 'pm.test("Response time is less than 200ms", function () {\n    pm.expect(pm.response.responseTime).to.be.below(200);\n});' },
  { label: 'Send a request', code: 'pm.sendRequest("https://reqspace-echo.com/get", function (err, response) {\n    console.log(response.json());\n});' },
];

export function ScriptEditor({ value, onChange }: ScriptEditorProps) {
  const insertSnippet = (code: string) => {
    const newVal = value ? value + '\n' + code : code;
    onChange(newVal);
  };

  return (
    <div className="flex h-full gap-4">
      <div className="flex-1 h-full min-h-[200px] border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden bg-white dark:bg-gray-900 pt-2">
        <Editor
          height="100%"
          language="javascript"
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
      <div className="w-64 flex flex-col border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800/50">
        <div className="p-2 border-b border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300">
          Snippets
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-hide">
          {SNIPPETS.map((snippet, idx) => (
            <div
              key={idx}
              onClick={() => insertSnippet(snippet.code)}
              className="text-xs text-orange-600 dark:text-orange-400 cursor-pointer hover:underline hover:text-orange-500 py-1"
            >
              {snippet.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
