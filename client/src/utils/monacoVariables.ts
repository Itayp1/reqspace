import { listVariableNames } from './variables';

const registered = new Set<string>();
const LANGS = ['json', 'plaintext', 'text', 'html', 'xml', 'javascript', 'graphql'];

/**
 * Adds `{{` variable completion (environment + dynamic names) and a right-click "Add ENV" action to a Monaco editor.
 * `monaco` is passed in (typed loosely) so Monaco stays out of the entry bundle.
 */
export function setupVariableCompletion(editor: any, monaco: any) {
  for (const lang of LANGS) {
    if (registered.has(lang)) continue;
    registered.add(lang);
    monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: ['{'],
      provideCompletionItems(model: any, pos: any) {
        const before = model.getLineContent(pos.lineNumber).slice(0, pos.column - 1);
        const m = before.match(/\{\{([^{}]*)$/);
        if (!m) return { suggestions: [] };
        // Replace what was typed after "{{", and a "}}" the editor auto-closed right after the cursor.
        const after = model.getLineContent(pos.lineNumber).slice(pos.column - 1);
        const closed = after.startsWith('}}') ? 2 : 0;
        const range = { startLineNumber: pos.lineNumber, endLineNumber: pos.lineNumber, startColumn: pos.column - m[1].length, endColumn: pos.column + closed };
        const { env, dynamic } = listVariableNames();
        const item = (name: string, detail: string) => ({
          label: name, kind: monaco.languages.CompletionItemKind.Variable, detail, insertText: `${name}}}`, filterText: name, range,
        });
        return { suggestions: [...env.map(n => item(n, 'Environment')), ...dynamic.map(n => item(n, 'Dynamic'))] };
      },
    });
  }
  editor.addAction({
    id: 'reqspace.addEnv',
    label: 'Add ENV',
    contextMenuGroupId: '9_cutcopypaste',
    contextMenuOrder: 0,
    run: (ed: any) => {
      ed.trigger('keyboard', 'type', { text: '{{' });
      ed.trigger('addEnv', 'editor.action.triggerSuggest', {});
    },
  });
}
