import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useCollectionStore, type Folder } from '../../store/collectionStore';
import api from '../../api/axios';
import { ScriptEditor } from '../request/ScriptEditor';
import { AuthEditor } from '../request/AuthEditor';
import type { RequestAuth } from '../../store/requestStore';

interface GroupEditModalProps {
  type: 'collection' | 'folder';
  id: string;
  name: string;
  onClose: () => void;
}

export const GroupEditModal: React.FC<GroupEditModalProps> = ({ type, id, name, onClose }) => {
  // There's no flat top-level `folders` list — folders are keyed by direct
  // parent (a folder id for nested ones, else the collection id), so finding
  // one by id alone means searching every bucket.
  const { collections, foldersByCollection, setCollections, applyFolderUpserted } = useCollectionStore();
  const allFolders = Object.values(foldersByCollection).filter((v): v is Folder[] => Array.isArray(v)).flat();
  const item = type === 'collection'
    ? collections.find(c => c._id === id)
    : allFolders.find(f => f._id === id);

  const [activeTab, setActiveTab] = useState<'variables' | 'auth' | 'prerequest' | 'test'>(type === 'collection' ? 'variables' : 'auth');
  const [variables, setVariables] = useState<any[]>(type === 'collection' && item ? (item as any).variables || [] : []);
  const [preRequestScript, setPreRequestScript] = useState<string>(item?.preRequestScript || '');
  const [testScript, setTestScript] = useState<string>(item?.testScript || '');
  // Ancestor auth — this is what a request set to `inherit` resolves against.
  // A folder defaults to `inherit` (pass its collection's auth through); a
  // collection is the top of the chain, so it defaults to `none`.
  const [auth, setAuth] = useState<RequestAuth>(
    ((item as any)?.auth as RequestAuth) || { type: type === 'folder' ? 'inherit' : 'none' }
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!item) return null;

  const handleUpdateVar = (index: number, field: string, val: any) => {
    const next = [...variables];
    next[index] = { ...next[index], [field]: val };
    setVariables(next);
  };

  const handleAddVar = () => setVariables([...variables, { key: '', value: '', enabled: true }]);
  const handleRemoveVar = (index: number) => setVariables(variables.filter((_, i) => i !== index));

  const handleSave = async () => {
    setLoading(true);
    try {
      const payload: any = {
        auth,
        preRequestScript,
        testScript
      };
      
      if (type === 'collection') {
        payload.variables = variables.filter(v => v.key.trim() !== '');
        const res = await api.put(`/collections/${id}`, payload);
        setCollections(collections.map(c => c._id === id ? { ...c, variables: res.data.variables, auth: res.data.auth, preRequestScript: res.data.preRequestScript, testScript: res.data.testScript } : c));
      } else {
        const res = await api.put(`/folders/${id}`, payload);
        applyFolderUpserted(res.data);
      }
      onClose();
    } catch (err) {
      console.error('Failed to save', err);
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[200]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Edit ${type} ${name}`} className="bg-background text-text border border-border rounded-lg shadow-2xl w-full max-w-3xl flex flex-col h-[70vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div>
            <h2 className="text-base font-semibold truncate" title={name}>Edit {type === 'collection' ? 'Collection' : 'Folder'} — {name}</h2>
          </div>
          <button aria-label="Close" onClick={onClose} className="p-1 rounded text-text-muted hover:text-text hover:bg-surface outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><X size={16} aria-hidden="true" /></button>
        </div>

        <div className="flex border-b border-border px-4 pt-2 overflow-x-auto">
          {type === 'collection' && (
            <button
              data-testid="group-edit-variables-tab"
              className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${activeTab === 'variables' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text'}`}
              onClick={() => setActiveTab('variables')}
            >
              Variables
            </button>
          )}
          <button
            data-testid="group-edit-auth-tab"
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${activeTab === 'auth' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text'}`}
            onClick={() => setActiveTab('auth')}
          >
            Authorization
          </button>
          <button
            data-testid="group-edit-prerequest-tab"
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${activeTab === 'prerequest' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text'}`}
            onClick={() => setActiveTab('prerequest')}
          >
            Pre-request Script
          </button>
          <button
            data-testid="group-edit-test-tab"
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${activeTab === 'test' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text'}`}
            onClick={() => setActiveTab('test')}
          >
            Tests
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col min-h-0 bg-surface">
          {activeTab === 'variables' && type === 'collection' && (
            <div className="flex-1 overflow-y-auto border border-border rounded bg-background">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border text-text-muted bg-surface">
                    <th className="p-2 w-8"></th>
                    <th className="p-2">VARIABLE</th>
                    <th className="p-2">VALUE</th>
                    <th className="p-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono text-text">
                  {variables.map((v, i) => (
                    <tr key={i} className="hover:bg-surface">
                      <td className="p-2 text-center">
                        <input type="checkbox" checked={v.enabled} onChange={e => handleUpdateVar(i, 'enabled', e.target.checked)} className="cursor-pointer accent-primary" />
                      </td>
                      <td className="p-1">
                        <input type="text" data-testid={`group-var-key-${i}`} value={v.key} onChange={e => handleUpdateVar(i, 'key', e.target.value)} className="w-full p-2 bg-transparent outline-none focus-visible:bg-surface placeholder:text-text-muted" placeholder="New key" />
                      </td>
                      <td className="p-1">
                        <input type="text" data-testid={`group-var-val-${i}`} value={v.value} onChange={e => handleUpdateVar(i, 'value', e.target.value)} className="w-full p-2 bg-transparent outline-none focus-visible:bg-surface placeholder:text-text-muted" placeholder="Value" />
                      </td>
                      <td className="p-2 text-center">
                        <button aria-label="Remove variable" onClick={() => handleRemoveVar(i)} className="text-text-muted hover:text-red-500 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"><X size={14} aria-hidden="true" /></button>
                      </td>
                    </tr>
                  ))}
                  <tr className="hover:bg-surface cursor-pointer" onClick={handleAddVar} data-testid="group-add-var-btn">
                    <td className="p-2"></td>
                    <td className="p-2 text-text-muted" colSpan={3}>+ Add a new variable</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'auth' && (
            <div className="flex flex-col gap-3" data-testid="group-auth-editor">
              <p className="text-xs text-text-muted">
                Requests in this {type} whose Authorization type is
                <span className="text-text"> Inherit auth from parent </span>
                use this. The nearest ancestor that sets something other than
                Inherit wins, so a folder overrides its collection.
              </p>
              {/* A collection is the top of the chain — it has no parent to
                  inherit from, so that option is hidden there. */}
              <AuthEditor value={auth} onChange={setAuth} hideInherit={type === 'collection'} />
            </div>
          )}

          {activeTab === 'prerequest' && (
            <div className="h-full flex flex-col gap-2">
              <p className="text-xs text-text-muted">Write JavaScript code to execute before sending any request in this {type}.</p>
              <div className="flex-1 min-h-0 border border-border rounded overflow-hidden" data-testid="group-prerequest-editor">
                <ScriptEditor value={preRequestScript} onChange={setPreRequestScript} />
              </div>
            </div>
          )}

          {activeTab === 'test' && (
            <div className="h-full flex flex-col gap-2">
              <p className="text-xs text-text-muted">Write JavaScript code to test the response of any request in this {type}.</p>
              <div className="flex-1 min-h-0 border border-border rounded overflow-hidden" data-testid="group-test-editor">
                <ScriptEditor value={testScript} onChange={setTestScript} />
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text hover:bg-surface rounded transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40">Cancel</button>
          <button data-testid="group-edit-save-btn" onClick={handleSave} disabled={loading} className="px-4 py-2 text-sm bg-primary-strong hover:bg-primary/90 text-white rounded font-medium disabled:opacity-50 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
            {loading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
