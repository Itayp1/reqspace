import { useEffect, useRef } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { matchesShortcut } from '../utils/shortcuts';

// Mounted editors, oldest first; only the last one reacts to the save shortcut.
const stack: symbol[] = [];

/** True while an editor owns the save shortcut (so the request editor must not also save). */
export const saveShortcutClaimed = () => stack.length > 0;

export function useSaveShortcut(onSave: () => void) {
  const cb = useRef(onSave);
  cb.current = onSave;
  useEffect(() => {
    const id = Symbol();
    stack.push(id);
    const onKey = (e: KeyboardEvent) => {
      const shortcut = useSettingsStore.getState().settings.shortcuts?.save || 'ctrl+s';
      if (stack[stack.length - 1] !== id || !matchesShortcut(e, shortcut)) return;
      e.preventDefault(); // also stops the browser's "Save page" dialog
      cb.current();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      stack.splice(stack.indexOf(id), 1);
    };
  }, []);
}
