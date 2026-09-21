import { useState, useEffect } from 'react';
import { useCollectionStore } from '../../store/collectionStore';
import { useRequestStore } from '../../store/requestStore';
import { Search, X, Folder, FileJson } from 'lucide-react';

interface GlobalSearchModalProps {
  onClose: () => void;
}

export default function GlobalSearchModal({ onClose }: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const { collections, folders, requests, openCollectionIds, toggleCollectionOpen } = useCollectionStore();
  const { setActiveRequest } = useRequestStore();

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

  const results = !query.trim() ? [] : [
    ...collections.filter(c => c.name.toLowerCase().includes(query.toLowerCase())).map(c => ({ ...c, type: 'collection' })),
    ...folders.filter(f => f.name.toLowerCase().includes(query.toLowerCase())).map(f => ({ ...f, type: 'folder' })),
    ...requests.filter(r => r.name.toLowerCase().includes(query.toLowerCase()) || r.url?.toLowerCase().includes(query.toLowerCase())).map(r => ({ ...r, type: 'request' }))
  ].slice(0, 50); // limit to 50 results

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center pt-24 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center relative">
          <Search className="w-5 h-5 text-gray-400 absolute left-6" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search collections, folders, requests, or URLs..."
            className="w-full pl-10 pr-4 py-3 bg-gray-100 dark:bg-gray-900 border-none rounded-md focus:ring-2 focus:ring-orange-500 text-lg outline-none"
          />
          <button onClick={onClose} className="absolute right-6 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {query.trim() && results.length === 0 && (
            <div className="text-center text-gray-500 py-8">No results found for "{query}"</div>
          )}
          
          {results.map((item: any) => (
            <div
              key={item._id}
              onClick={() => item.type === 'request' && handleOpenRequest(item._id)}
              className={`p-3 mx-2 my-1 rounded-md flex items-center gap-3 ${
                item.type === 'request' ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700' : 'opacity-75'
              }`}
            >
              {item.type === 'collection' && <Folder className="text-orange-500 w-5 h-5" />}
              {item.type === 'folder' && <Folder className="text-yellow-500 w-5 h-5" />}
              {item.type === 'request' && <FileJson className="text-blue-500 w-5 h-5" />}
              
              <div className="flex-1 overflow-hidden">
                <div className="font-medium truncate text-gray-900 dark:text-gray-100">
                  {item.name}
                  {item.type === 'request' && item.method && (
                    <span className="ml-2 text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-gray-600 dark:text-gray-300">
                      {item.method}
                    </span>
                  )}
                </div>
                {item.type === 'request' && item.url && (
                  <div className="text-xs text-gray-500 truncate mt-0.5">{item.url}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
