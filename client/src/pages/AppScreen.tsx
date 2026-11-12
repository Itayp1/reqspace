import { useEffect, useRef, useState } from 'react';
import { RequestTabBar } from '../components/request/RequestTabBar';
import { RequestEditor } from '../components/request/RequestEditor';
import { ConnectionEditor } from '../components/request/ConnectionEditor';
import { ResponseViewer } from '../components/response/ResponseViewer';
import { EnvironmentTabEditor } from '../components/environment/EnvironmentTabEditor';
import ProfileVariablesEditor from '../components/environment/ProfileVariablesEditor';
import { useRequestStore } from '../store/requestStore';

export default function AppScreen() {
  const { activeRequest, undo, redo } = useRequestStore();
  const isEnvTab = activeRequest?.tabType === 'environment';
  const isConnTab = activeRequest?.tabType === 'connection';
  const rootRef = useRef<HTMLDivElement>(null);
  const [responseH, setResponseH] = useState<number | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in a native input and holding Ctrl+Z (it handles text-level undo).
      // Wait, actually, standard inputs handle their own undo. But if we want Request-level undo,
      // maybe we should intercept it? Yes, we can just intercept if it bubbles.
      // Wait, if it bubbles from an input, we shouldn't prevent default if it's text.
      // Let's just allow it, but we can also trigger our undo. It's safer to only trigger if the target is NOT an input/textarea.
      // Actually, since all our params are inputs, we DO want Ctrl+Z to undo adding rows, changing auth types, etc.
      if ((e.ctrlKey || e.metaKey) && (e.key ?? "").toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key ?? "").toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Drag the splitter: the response pane grows upwards; the request pane keeps its 300px minimum, the response its 120px.
  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault(); // no text selection while dragging
    const root = rootRef.current; if (!root) return;
    const startY = e.clientY;
    const startH = e.currentTarget.nextElementSibling!.getBoundingClientRect().height;
    const max = root.clientHeight - root.firstElementChild!.getBoundingClientRect().height - 10 - 300;
    const move = (ev: PointerEvent) => setResponseH(Math.max(120, Math.min(max, startH + startY - ev.clientY)));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  return (
    <div ref={rootRef} className="flex flex-col h-full min-h-[440px] bg-background min-w-0">
      <RequestTabBar />
      <div className="flex-[2_1_0%] flex min-h-[300px]">
        <div className="flex-1 flex flex-col min-w-0">
          {isEnvTab ? (
            activeRequest?.environmentId === 'profile-variables' ? <ProfileVariablesEditor /> : <EnvironmentTabEditor />
          ) : isConnTab ? (
            <ConnectionEditor key={activeRequest?.tabId} />
          ) : <RequestEditor />}
        </div>
      </div>
      {!isEnvTab && !isConnTab && (
        <>
          <div data-testid="response-splitter" onPointerDown={startDrag} className="h-2.5 shrink-0 cursor-row-resize select-none touch-none bg-surface border-y border-border flex items-center justify-center">
            <div className="w-10 h-1 bg-text-muted/40 rounded-full" />
          </div>
          <div data-testid="response-pane" style={responseH == null ? undefined : { flex: `0 0 ${responseH}px` }} className="flex-[1_1_0%] flex min-h-[120px] bg-background">
            <ResponseViewer />
          </div>
        </>
      )}
    </div>
  );
}
