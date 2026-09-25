import { useEffect } from 'react';
import { RequestTabBar } from '../components/request/RequestTabBar';
import { RequestEditor } from '../components/request/RequestEditor';
import { ResponseViewer } from '../components/response/ResponseViewer';
import { EnvironmentTabEditor } from '../components/environment/EnvironmentTabEditor';
import LocalVariablesEditor from '../components/environment/LocalVariablesEditor';
import { useRequestStore } from '../store/requestStore';

export default function AppScreen() {
  const { activeRequest, undo, redo } = useRequestStore();
  const isEnvTab = activeRequest?.tabType === 'environment';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in a native input and holding Ctrl+Z (it handles text-level undo).
      // Wait, actually, standard inputs handle their own undo. But if we want Request-level undo,
      // maybe we should intercept it? Yes, we can just intercept if it bubbles.
      // Wait, if it bubbles from an input, we shouldn't prevent default if it's text.
      // Let's just allow it, but we can also trigger our undo. It's safer to only trigger if the target is NOT an input/textarea.
      // Actually, since all our params are inputs, we DO want Ctrl+Z to undo adding rows, changing auth types, etc.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return (
    <div className="flex-1 flex flex-col h-full bg-background min-w-0">
      <RequestTabBar />
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          {isEnvTab ? (
            activeRequest?.environmentId === 'local-variables' ? <LocalVariablesEditor /> : <EnvironmentTabEditor />
          ) : <RequestEditor />}
        </div>
      </div>
      {!isEnvTab && (
        <>
          <div className="h-2 cursor-row-resize bg-surface border-y border-border flex items-center justify-center">
            <div className="w-8 h-1 bg-border rounded-full" />
          </div>
          <div className="flex-1 flex min-h-0 bg-background">
            <ResponseViewer />
          </div>
        </>
      )}
    </div>
  );
}
