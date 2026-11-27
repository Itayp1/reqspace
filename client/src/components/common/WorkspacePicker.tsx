import { useState, useEffect, useRef, useId } from 'react';
import { ChevronDown, Search, Link2 } from 'lucide-react';
import clsx from 'clsx';

interface Item { _id: string; name: string }

interface Props<T extends Item> {
  items: T[];
  activeId: string;
  onSelect: (item: T) => void;
  onJoinWithLink?: () => void;
}

/** Searchable single-select (combobox + listbox) used for the workspace switcher. */
export function WorkspacePicker<T extends Item>({ items, activeId, onSelect, onJoinWithLink }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const active = items.find(i => i._id === activeId);
  const shown = items.filter(i => i.name.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };
  const openList = () => {
    setQuery('');
    setHi(Math.max(0, items.findIndex(i => i._id === activeId)));
    setOpen(true);
  };
  const pick = (item: T) => { onSelect(item); close(true); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[hi]) pick(shown[hi]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab' && (e.shiftKey || !onJoinWithLink)) close(false);
  };

  return (
    <div ref={rootRef} className="relative flex-1 min-w-0">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        data-testid="workspace-select"
        data-value={activeId}
        aria-label="Select workspace"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); openList(); }
        }}
        className="w-full flex items-center justify-between gap-1 p-2 bg-background border border-border rounded text-sm text-left hover:bg-border outline-none focus-visible:ring-1 focus-visible:ring-primary"
      >
        <span className="truncate" title={active?.name}>{active?.name ?? ''}</span>
        <ChevronDown className="w-4 h-4 shrink-0 text-text-muted" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute z-50 left-0 min-w-full w-max max-w-72 mt-1 bg-surface border border-border rounded shadow-lg">
          <div className="relative p-1">
            <Search className="absolute left-3 top-3 w-4 h-4 text-text-muted" aria-hidden="true" />
            <input
              autoFocus
              data-testid="workspace-search"
              type="text"
              role="combobox"
              aria-label="Search workspaces"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={shown[hi] ? `${listId}-${shown[hi]._id}` : undefined}
              autoComplete="off"
              spellCheck={false}
              placeholder="Search workspaces…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setHi(0); }}
              onKeyDown={onKeyDown}
              className="w-full pl-7 p-1.5 bg-background border border-border rounded text-sm outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>
          <ul id={listId} role="listbox" aria-label="Workspaces" className="max-h-60 overflow-y-auto py-1">
            {shown.map((ws, i) => (
              <li
                key={ws._id}
                id={`${listId}-${ws._id}`}
                role="option"
                aria-selected={ws._id === activeId}
                data-testid={`workspace-option-${ws._id}`}
                title={ws.name}
                onMouseEnter={() => setHi(i)}
                onClick={() => pick(ws)}
                className={clsx(
                  'px-2 py-1.5 text-sm cursor-pointer truncate',
                  i === hi && 'bg-border',
                  ws._id === activeId && 'font-semibold text-primary'
                )}
              >
                {ws.name}
              </li>
            ))}
            {shown.length === 0 && <li role="presentation" className="px-2 py-1.5 text-sm text-text-muted">No matching workspaces</li>}
          </ul>
          {onJoinWithLink && (
            <button
              type="button"
              data-testid="workspace-join-link-btn"
              onClick={() => { close(true); onJoinWithLink(); }}
              onBlur={(e) => { if (!rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false); }}
              className="w-full flex items-center gap-2 px-2 py-2 text-sm text-text-muted border-t border-border hover:bg-border hover:text-text focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <Link2 className="w-4 h-4" aria-hidden="true" /> Join with Invite Link…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
