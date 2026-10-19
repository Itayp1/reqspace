import { lazy, Suspense } from 'react';
import type { EditorProps } from '@monaco-editor/react';

const MonacoEditor = lazy(() => import('./monacoEditorImpl'));

/** Drop-in for `@monaco-editor/react`'s Editor that code-splits Monaco out of the entry bundle. */
export default function LazyEditor(props: EditorProps) {
  return (
    <Suspense fallback={<div className="p-2 text-xs text-gray-500">Loading editor...</div>}>
      <MonacoEditor {...props} />
    </Suspense>
  );
}
