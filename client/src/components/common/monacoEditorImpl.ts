// Everything Monaco lives behind this module so it is split into its own chunk
// (R6.6) and only downloaded when an editor is first rendered.
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker';
import htmlWorker from 'monaco-editor/language/html/html.worker?worker';
import cssWorker from 'monaco-editor/language/css/css.worker?worker';

// Bundled workers served from our own origin. Without this Monaco falls back to
// a data: URL worker, which the CSP (worker-src 'self' blob:) refuses, and every
// editor logged "Failed to fetch dynamically imported module: data:text/javascript"
// into fperrors in production.
(self as any).MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};
loader.config({ monaco });

export { default } from '@monaco-editor/react';
