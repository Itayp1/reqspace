import React from 'react';
import { X, BookOpen } from 'lucide-react';
import { useCollectionStore } from '../../store/collectionStore';

interface DocumentationModalProps {
  collectionId: string;
  collectionName: string;
  onClose: () => void;
}

export const DocumentationModal: React.FC<DocumentationModalProps> = ({ collectionId, collectionName, onClose }) => {
  const { collections, folders, requests } = useCollectionStore();
  const collection = collections.find(c => c._id === collectionId);

  const renderRequestDocs = (request: any, level: number = 0) => {
    return (
      <div key={request._id} className={`mb-8 ${level > 0 ? 'ml-6 border-l border-gray-700 pl-4' : ''}`}>
        <h3 className="text-lg font-semibold text-gray-100 flex items-center gap-2 mb-2">
          <span className={`font-mono text-sm px-2 py-0.5 rounded bg-gray-800 ${
            request.method === 'GET' ? 'text-green-400' :
            request.method === 'POST' ? 'text-yellow-400' :
            request.method === 'PUT' ? 'text-blue-400' :
            request.method === 'DELETE' ? 'text-red-400' : 'text-gray-400'
          }`}>{request.method || 'GET'}</span>
          {request.name}
        </h3>
        
        <div className="bg-gray-900 rounded p-3 mb-4 font-mono text-sm text-gray-300 break-all overflow-x-auto">
          {request.url || 'No URL specified'}
        </div>

        {request.headers && request.headers.filter((h: any) => h.enabled && h.key).length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Headers</h4>
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 bg-gray-800">
                <tr>
                  <th className="px-3 py-2 font-medium">Key</th>
                  <th className="px-3 py-2 font-medium">Value</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-gray-300">
                {request.headers.filter((h: any) => h.enabled && h.key).map((h: any, i: number) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-mono text-xs">{h.key}</td>
                    <td className="px-3 py-2 font-mono text-xs break-all">{h.value}</td>
                    <td className="px-3 py-2 text-gray-500">{h.description || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {request.body && request.body.mode !== 'none' && (
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Body ({request.body.mode})</h4>
            
            {request.body.mode === 'raw' && request.body.raw && (
              <pre className="bg-gray-900 p-3 rounded text-xs font-mono text-gray-300 overflow-x-auto">
                {request.body.raw}
              </pre>
            )}

            {request.body.mode === 'form-data' && request.body.formData && request.body.formData.filter((i: any) => i.enabled && i.key).length > 0 && (
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 bg-gray-800">
                  <tr><th className="px-3 py-2">Key</th><th className="px-3 py-2">Value</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-800 text-gray-300">
                  {request.body.formData.filter((i: any) => i.enabled && i.key).map((item: any, i: number) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-mono text-xs">{item.key}</td>
                      <td className="px-3 py-2 font-mono text-xs">{item.type === 'file' ? '(File)' : item.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            
            {request.body.mode === 'urlencoded' && request.body.urlencoded && request.body.urlencoded.filter((i: any) => i.enabled && i.key).length > 0 && (
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 bg-gray-800">
                  <tr><th className="px-3 py-2">Key</th><th className="px-3 py-2">Value</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-800 text-gray-300">
                  {request.body.urlencoded.filter((i: any) => i.enabled && i.key).map((item: any, i: number) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-mono text-xs">{item.key}</td>
                      <td className="px-3 py-2 font-mono text-xs">{item.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderFolderDocs = (folderId: string, level: number = 0) => {
    const folder = folders.find(f => f._id === folderId);
    if (!folder) return null;
    
    const childFolders = folders.filter(f => f.parentFolderId === folderId);
    const childRequests = requests.filter(r => r.folderId === folderId);

    return (
      <div key={folderId} className={`mb-10 ${level > 0 ? 'ml-6 border-l border-gray-700 pl-4' : ''}`}>
        <h2 className="text-xl font-bold text-gray-100 mb-6 pb-2 border-b border-gray-800 flex items-center gap-2">
          <BookOpen size={20} className="text-gray-500" />
          {folder.name}
        </h2>
        {childFolders.map(f => renderFolderDocs(f._id, level + 1))}
        {childRequests.map(r => renderRequestDocs(r, level + 1))}
      </div>
    );
  };

  if (!collection) return null;

  const rootFolders = folders.filter(f => f.collectionId === collectionId && !f.parentFolderId);
  const rootRequests = requests.filter(r => r.collectionId === collectionId && !r.folderId);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]" onClick={onClose}>
      <div 
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-4xl flex flex-col h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800/50 shrink-0">
          <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
            <BookOpen className="text-blue-400" size={20} />
            {collectionName} Documentation
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-8 overflow-y-auto flex-1 bg-gray-900">
          <div className="max-w-3xl mx-auto">
            {rootFolders.map(f => renderFolderDocs(f._id, 0))}
            {rootRequests.map(r => renderRequestDocs(r, 0))}
            
            {rootFolders.length === 0 && rootRequests.length === 0 && (
              <div className="text-center text-gray-500 mt-20">
                This collection is empty. Add requests and folders to generate documentation.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
