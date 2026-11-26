import React, { useId, useRef, useState, useEffect } from 'react';
import type { NameSuggestion } from '../../utils/variables';

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (val: string) => void;
  /** Suggestions for what is typed so far; the caller knows which scope is being edited. */
  getSuggestions: (query: string) => NameSuggestion[];
}

const GROUP_LABEL = ['In this list', 'Other sources', 'System variables'];

/** Text input for a variable NAME with an ARIA combobox list. Free typing always works; Enter only picks after an arrow-key highlight. */
export function VariableNameInput({ value, onChange, getSuggestions, onKeyDown, onFocus, onBlur, ...props }: Props) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 0 });
  const ref = useRef<HTMLInputElement>(null);
  const listId = useId();
  const items = open ? getSuggestions(value) : [];
  const shown = open && items.length > 0;

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, top: r.bottom, width: Math.max(r.width, 240) });
    setOpen(true);
  };

  // Fixed positioning escapes the table's scroll container; close on scroll rather than track it.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [open]);

  const pick = (name: string) => { onChange(name); setOpen(false); setHi(-1); };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!shown) {
        if (e.key === 'ArrowDown') { e.preventDefault(); show(); }
      } else {
        e.preventDefault();
        const n = items.length;
        setHi(h => (e.key === 'ArrowDown' ? (h + 1) % n : (h <= 0 ? n - 1 : h - 1)));
      }
    } else if (e.key === 'Enter' && shown && hi >= 0 && items[hi]) {
      e.preventDefault();
      pick(items[hi].name);
    } else if (e.key === 'Escape' && shown) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
    onKeyDown?.(e);
  };

  return (
    <>
      <input
        {...props}
        ref={ref}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={shown ? listId : undefined}
        aria-activedescendant={shown && hi >= 0 ? `${listId}-${hi}` : undefined}
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => { onChange(e.target.value); setHi(-1); show(); }}
        onKeyDown={handleKeyDown}
        onFocus={(e) => { show(); setHi(-1); onFocus?.(e); }}
        onBlur={(e) => { setOpen(false); onBlur?.(e); }}
      />
      {shown && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Variable name suggestions"
          data-testid="var-name-suggestions"
          style={{ left: pos.left, top: pos.top, minWidth: pos.width }}
          className="fixed z-50 mt-0.5 max-h-56 overflow-y-auto py-1 bg-background border border-border rounded-lg shadow-2xl text-xs font-sans select-none"
        >
          {items.map((s, i) => (
            <React.Fragment key={s.name}>
              {(i === 0 || items[i - 1].group !== s.group) && (
                <li role="presentation" className="px-2.5 py-1 text-[10px] uppercase font-semibold text-text-muted bg-surface">{GROUP_LABEL[s.group]}</li>
              )}
              <li
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === hi}
                data-testid="var-name-option"
                onMouseDown={(e) => { e.preventDefault(); pick(s.name); }}
                className={`${i === hi ? 'bg-surface ' : ''}px-3 py-1.5 hover:bg-surface cursor-pointer flex items-center justify-between gap-3 font-mono text-text`}
              >
                <span className="truncate">{s.name}</span>
                <span className="text-[10px] text-text-muted font-sans shrink-0 max-w-32 truncate">{s.tag}</span>
              </li>
            </React.Fragment>
          ))}
        </ul>
      )}
    </>
  );
}
