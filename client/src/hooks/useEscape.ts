import { useEffect, useRef } from 'react';

// Open modals, oldest first; only the last one reacts to Escape.
const stack: symbol[] = [];

export function useEscape(onEscape?: () => void) {
  const cb = useRef(onEscape);
  cb.current = onEscape;
  useEffect(() => {
    const id = Symbol();
    stack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || stack[stack.length - 1] !== id) return;
      e.preventDefault();
      cb.current?.();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(id), 1);
    };
  }, []);
}
