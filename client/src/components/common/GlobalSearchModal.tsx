import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCollectionStore, useLoadedTree } from '../../store/collectionStore';
import { useRequestStore } from '../../store/requestStore';
import { revealState } from '../collection/CollectionExplorer';
import { Search, X, Folder, FileJson } from 'lucide-react';

interface GlobalSearchModalProps {
  onClose: () => void;
}

export default function GlobalSearchModal({ onClose }: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const { collections, openCollectionIds, toggleCollectionOpen } = useCollectionStore();
  const { folders, requests } = useLoadedTree();
  const { setActiveRequest } = useRequestStore();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleOpenRequest = (reqId: string) => {
    const req = requests.find(r => r._id === reqId);
    if (req) {
      if (!openCollectionIds.has(req.collectionId)) {
        toggleCollectionOpen(req.collectionId);
      }
      setActiveRequest(req as any);
      onClose();
    }
  };

  // Open the collection and every folder on the way, then scroll the node into view.
  const handleReveal = (item: any) => {
    const ids = new Set<string>();
    let fid = item.type === 'folder' ? item._id : null;
    for (let guard = 0; fid && guard < 50; guard++) {
      ids.add(fid);
      fid = folders.find(x => x._id === fid)?.parentFolderId ?? null;
    }
    revealState.open = ids;
    useCollectionStore.getState().openCollection(item.type === 'folder' ? item.collectionId : item._id);
    window.dispatchEvent(new Event('reveal-in-tree'));
    // Children mount level by level, so retry until the node exists.
    let tries = 0;
    const timer = setInterval(() => {
      const el = document.querySelector(`[data-node-id="${item._id}"]`);
      if (el) { el.scrollIntoView({ block: 'center' }); clearInterval(timer); }
      else if (++tries > 20) clearInterval(timer);
    }, 100);
    onClose();
  };

  // "Collection › Folder › Sub" breadcrumb for an item (P1.2), so identically
  // named items in different places can be told apart.
  const pathOf = (item: { collectionId?: string; folderId?: string | null; parentFolderId?: string | null; type: string }) => {
    const parts: string[] = [];
    let folderId = item.type === 'folder' ? item.parentFolderId : item.folderId;
    for (let guard = 0; folderId && guard < 50; guard++) {
      const f = folders.find(x => x._id === folderId);
      if (!f) break;
      parts.unshift(f.name);
      folderId = f.parentFolderId;
    }
    const col = collections.find(c => c._id === item.collectionId);
    if (col && item.type !== 'collection') parts.unshift(col.name);
    return parts.join(' › ');
  };

  const q = query.trim().toLowerCase();
  const results = !q ? [] : [
    ...collections.filter(c => c.name.toLowerCase().includes(q)).map(c => ({ ...c, type: 'collection' })),
    ...folders.filter(f => f.name.toLowerCase().includes(q)).map(f => ({ ...f, type: 'folder' })),
    ...requests.filter(r => r.name.toLowerCase().includes(q) || r.url?.toLowerCase().includes(q) || r.method?.toLowerCase() === q).map(r => ({ ...r, type: 'request' }))
  ].slice(0, 50); // limit to 50 results

  useEffect(() => {
    // Reset active index when results change
    setActiveIndex(-1);
  }, [query]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Keyboard navigation for result list
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => {
        const next = prev < results.length - 1 ? prev + 1 : 0;
        scrollItemIntoView(next);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => {
        const next = prev > 0 ? prev - 1 : results.length - 1;
        scrollItemIntoView(next);
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < results.length) {
        const item = results[activeIndex] as any;
        if (item.type === 'request') handleOpenRequest(item._id);
        else handleReveal(item);
      }
    }
  };

  const scrollItemIntoView = (index: number) => {
    const list = listRef.current;
    if (!list) return;
    const item = list.querySelector(`[data-index="${index}"]`) as HTMLElement;
    item?.scrollIntoView({ block: 'nearest' });
  };

  const resultsId = 'global-search-results';

  // Portal: rendered inside the TopBar the backdrop sat under the sidebar's stacking context.
  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-24 z-50"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        className="bg-background text-text border border-border rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex items-center relative">
          <Search className="w-5 h-5 text-text-muted absolute left-6" aria-hidden="true" />
          <input
            ref={inputRef}
            autoFocus
            type="text" autoComplete="off" spellCheck={false}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={resultsId}
            aria-activedescendant={activeIndex >= 0 ? `search-result-${activeIndex}` : undefined}
            aria-autocomplete="list"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search collections, folders, requests, or URLs…"
            className="w-full pl-10 pr-12 py-3 bg-surface text-text border-none rounded-md focus:ring-2 focus:ring-primary text-lg outline-none"
          />
          <button
            onClick={onClose}
            className="absolute right-6 text-text-muted hover:text-text rounded focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Close search"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        
        <div id={resultsId} ref={listRef} className="flex-1 overflow-y-auto p-2" role="listbox" aria-label="Search results">
          {query.trim() && results.length === 0 && (
            <div className="text-center text-text-muted py-8" aria-live="polite">No results found for “{query}”</div>
          )}
          {!query.trim() && (
            <div className="text-center text-text-muted py-8 text-sm">Type to search. <kbd className="font-mono">↑</kbd> <kbd className="font-mono">↓</kbd> to move, <kbd className="font-mono">Enter</kbd> to open, <kbd className="font-mono">Esc</kbd> to close.</div>
          )}
          
          {results.map((item: any, index) => (
            <div
              key={item._id}
              id={`search-result-${index}`}
              data-index={index}
              role="option"
              aria-selected={index === activeIndex}
              onClick={() => (item.type === 'request' ? handleOpenRequest(item._id) : handleReveal(item))}
              className={`p-3 mx-2 my-1 rounded-md flex items-center gap-3 cursor-pointer hover:bg-surface
 ${index === activeIndex ? 'bg-surface ring-2 ring-primary' : ''}`}
              aria-label={`${item.type}: ${item.name}${item.url ? ` — ${item.url}` : ''}`}
            >
              {item.type === 'collection' && <Folder className="text-orange-500 w-5 h-5" aria-hidden="true" />}
              {item.type === 'folder' && <Folder className="text-yellow-500 w-5 h-5" aria-hidden="true" />}
              {item.type === 'request' && <FileJson className="text-blue-500 w-5 h-5" aria-hidden="true" />}
              
              <div className="flex-1 overflow-hidden">
                <div className="font-medium truncate text-text">
                  {item.name}
                  {item.type === 'request' && item.method && (
                    <span className="ml-2 text-xs px-2 py-0.5 bg-border rounded text-text-muted" aria-label={item.method}>
                      {item.method}
                    </span>
                  )}
                </div>
                {item.type !== 'collection' && pathOf(item) && (
                  <div data-testid="search-result-path" className="text-xs text-text-muted truncate mt-0.5">{pathOf(item)}</div>
                )}
                {item.type === 'request' && item.url && (
                  <div className="text-xs text-text-muted truncate mt-0.5">{item.url}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
