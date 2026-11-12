import { lazy, Suspense } from 'react';
import type { EditorProps } from '@monaco-editor/react';

const MonacoEditor = lazy(() => import('./monacoEditorImpl'));

/** Drop-in for `@monaco-editor/react`'s Editor that code-splits Monaco out of the entry bundle. */
export default function LazyEditor({ placeholder, ...props }: EditorProps & { placeholder?: string }) {
  const editor = (
    <Suspense fallback={<div className="p-2 text-xs text-gray-500">Loading editor...</div>}>
      <MonacoEditor {...props} />
    </Suspense>
  );
  if (!placeholder) return editor;
  // Monaco has no placeholder of its own: overlay one while the value is empty.
  return (
    <div className="relative h-full">
      {editor}
      {!props.value && (
        <div data-testid="editor-placeholder" className="absolute left-14 top-0 text-sm text-gray-400 pointer-events-none select-none">
          {placeholder}
        </div>
      )}
    </div>
  );
}
