import { useEscape } from '../../hooks/useEscape';
import React, { useEffect, useState } from 'react';
import { X, BookOpen, Eye, EyeOff } from 'lucide-react';
import { useCollectionStore, useLoadedTree } from '../../store/collectionStore';

interface DocumentationModalProps {
  collectionId: string;
  collectionName: string;
  onClose: () => void;
}

const SENSITIVE_KEY = /authorization|cookie|token|secret|password|passwd|api[-_]?key|apikey|auth/i;

// Secrets in the generated docs stay masked until the reader asks for them.
const MaskedValue: React.FC<{ name: string; value: string }> = ({ name, value }) => {
  const [shown, setShown] = useState(false);
  if (!value || !SENSITIVE_KEY.test(name)) return <>{value}</>;
  return (
    <span className="inline-flex items-center gap-2">
      <span data-testid="doc-masked-value">{shown ? value : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}</span>
      <button
        type="button"
        data-testid="doc-reveal-btn"
        aria-label={shown ? 'Hide value' : 'Reveal value'}
        onClick={() => setShown(v => !v)}
        className="text-text-muted hover:text-text outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
      >
        {shown ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
    </span>
  );
};

export const DocumentationModal: React.FC<DocumentationModalProps> = ({ collectionId, collectionName, onClose }) => {
  useEscape(onClose);
  const { collections, loadCollectionChildren, loadFolderChildren } = useCollectionStore();
  const { folders, requests } = useLoadedTree();

  // The tree is lazy-loaded: pull in this collection's folders and every
  // folder's requests so the generated docs are complete, not just what the
  // sidebar happens to have expanded.
  useEffect(() => { loadCollectionChildren(collectionId); }, [collectionId, loadCollectionChildren]);
  const folderIds = folders.filter(f => f.collectionId === collectionId).map(f => f._id).join(',');
  useEffect(() => {
    if (folderIds) folderIds.split(',').forEach(id => loadFolderChildren(collectionId, id));
  }, [collectionId, folderIds, loadFolderChildren]);
  const collection = collections.find(c => c._id === collectionId);

  const renderRequestDocs = (request: any, level: number = 0) => {
    return (
      <div key={request._id} data-testid={`doc-request-${request.name}`} className={`mb-8 ${level > 0 ? 'ml-6 border-l border-border pl-4' : ''}`}>
        <h3 className="text-base font-semibold text-text flex items-center gap-2 mb-2">
          <span className={`font-mono text-xs font-semibold px-2 py-0.5 rounded bg-surface border border-border ${
            request.method === 'GET' ? 'text-get' :
            request.method === 'POST' ? 'text-post' :
            request.method === 'PUT' ? 'text-put' :
            request.method === 'DELETE' ? 'text-delete' : 'text-text-muted'
          }`}>{request.method || 'GET'}</span>
          {request.name}
        </h3>
        
        <div className="bg-surface border border-border rounded p-3 mb-4 font-mono text-xs text-text break-all overflow-x-auto">
          {request.url || 'No URL specified'}
        </div>

        {request.headers && request.headers.filter((h: any) => h.enabled && h.key).length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Headers</h4>
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-text-muted bg-surface">
                <tr>
                  <th className="px-3 py-2 font-medium">Key</th>
                  <th className="px-3 py-2 font-medium">Value</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-text">
                {request.headers.filter((h: any) => h.enabled && h.key).map((h: any, i: number) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-mono text-xs">{h.key}</td>
                    <td className="px-3 py-2 font-mono text-xs break-all"><MaskedValue name={h.key} value={h.value} /></td>
                    <td className="px-3 py-2 text-text-muted">{h.description || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {request.body && request.body.mode !== 'none' && (
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Body ({request.body.mode})</h4>
            
            {request.body.mode === 'raw' && request.body.raw && (
              <pre className="bg-surface border border-border p-3 rounded text-xs font-mono text-text overflow-x-auto">
                {request.body.raw}
              </pre>
            )}

            {request.body.mode === 'form-data' && request.body.formData && request.body.formData.filter((i: any) => i.enabled && i.key).length > 0 && (
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-text-muted bg-surface">
                  <tr><th className="px-3 py-2">Key</th><th className="px-3 py-2">Value</th></tr>
                </thead>
                <tbody className="divide-y divide-border text-text">
                  {request.body.formData.filter((i: any) => i.enabled && i.key).map((item: any, i: number) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-mono text-xs">{item.key}</td>
                      <td className="px-3 py-2 font-mono text-xs">{item.type === 'file' ? '(File)' : <MaskedValue name={item.key} value={item.value} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            
            {request.body.mode === 'urlencoded' && request.body.urlencoded && request.body.urlencoded.filter((i: any) => i.enabled && i.key).length > 0 && (
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-text-muted bg-surface">
                  <tr><th className="px-3 py-2">Key</th><th className="px-3 py-2">Value</th></tr>
                </thead>
                <tbody className="divide-y divide-border text-text">
                  {request.body.urlencoded.filter((i: any) => i.enabled && i.key).map((item: any, i: number) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-mono text-xs">{item.key}</td>
                      <td className="px-3 py-2 font-mono text-xs"><MaskedValue name={item.key} value={item.value} /></td>
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
      <div key={folderId} data-testid={`doc-folder-${folder.name}`} className={`mb-10 ${level > 0 ? 'ml-6 border-l border-border pl-4' : ''}`}>
        <h2 className="text-lg font-semibold text-text mb-4 pb-2 border-b border-border flex items-center gap-2">
          <BookOpen size={18} className="text-text-muted" aria-hidden="true" />
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
    <div data-testid="documentation-modal" className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[200]" onClick={onClose}>
      <div 
        role="dialog"
        aria-modal="true"
        aria-label={`${collectionName} documentation`}
        className="bg-background text-text border border-border rounded-lg shadow-2xl w-full max-w-4xl flex flex-col h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-text flex items-center gap-2 min-w-0">
            <BookOpen className="text-text-muted shrink-0" size={18} aria-hidden="true" />
            <span className="truncate" title={collectionName}>{collectionName} Documentation</span>
          </h2>
          <button data-testid="documentation-close-btn" aria-label="Close" onClick={onClose} className="p-1 rounded text-text-muted hover:text-text hover:bg-surface transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        
        <div className="p-8 overflow-y-auto flex-1 bg-background">
          <div className="max-w-3xl mx-auto">
            {rootFolders.map(f => renderFolderDocs(f._id, 0))}
            {rootRequests.map(r => renderRequestDocs(r, 0))}
            
            {rootFolders.length === 0 && rootRequests.length === 0 && (
              <div className="text-center text-text-muted text-sm mt-20">
                This collection is empty. Add a request or folder to it and the documentation appears here.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
