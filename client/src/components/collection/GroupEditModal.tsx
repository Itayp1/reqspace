import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useCollectionStore } from '../../store/collectionStore';
import api from '../../api/axios';
import { ScriptEditor } from '../request/ScriptEditor';

interface GroupEditModalProps {
  type: 'collection' | 'folder';
  id: string;
  name: string;
  onClose: () => void;
}

export const GroupEditModal: React.FC<GroupEditModalProps> = ({ type, id, name, onClose }) => {
  const { collections, folders, setCollections, setFolders } = useCollectionStore();
  const item = type === 'collection' ? collections.find(c => c._id === id) : folders.find(f => f._id === id);

  const [activeTab, setActiveTab] = useState<'variables' | 'prerequest' | 'test'>(type === 'collection' ? 'variables' : 'prerequest');
  const [variables, setVariables] = useState<any[]>(type === 'collection' && item ? (item as any).variables || [] : []);
  const [preRequestScript, setPreRequestScript] = useState<string>(item?.preRequestScript || '');
  const [testScript, setTestScript] = useState<string>(item?.testScript || '');
  const [loading, setLoading] = useState(false);

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
        preRequestScript,
        testScript
      };
      
      if (type === 'collection') {
        payload.variables = variables.filter(v => v.key.trim() !== '');
        const res = await api.put(`/collections/${id}`, payload);
        setCollections(collections.map(c => c._id === id ? { ...c, variables: res.data.variables, preRequestScript: res.data.preRequestScript, testScript: res.data.testScript } : c));
      } else {
        const res = await api.put(`/folders/${id}`, payload);
        setFolders(folders.map(f => f._id === id ? { ...f, preRequestScript: res.data.preRequestScript, testScript: res.data.testScript } : f));
      }
      onClose();
    } catch (err) {
      console.error('Failed to save', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-3xl flex flex-col h-[70vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800/40">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">Edit {type === 'collection' ? 'Collection' : 'Folder'} — {name}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={16} /></button>
        </div>

        <div className="flex border-b border-gray-700 px-4 bg-gray-800/20 pt-2">
          {type === 'collection' && (
            <button
              data-testid="group-edit-variables-tab"
              className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'variables' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
              onClick={() => setActiveTab('variables')}
            >
              Variables
            </button>
          )}
          <button
            data-testid="group-edit-prerequest-tab"
            className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'prerequest' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
            onClick={() => setActiveTab('prerequest')}
          >
            Pre-request Script
          </button>
          <button
            data-testid="group-edit-test-tab"
            className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'test' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
            onClick={() => setActiveTab('test')}
          >
            Tests
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col min-h-0 bg-gray-950">
          {activeTab === 'variables' && type === 'collection' && (
            <div className="flex-1 overflow-y-auto border border-gray-700 rounded bg-gray-900">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 bg-gray-800/50">
                    <th className="p-2 w-8"></th>
                    <th className="p-2">VARIABLE</th>
                    <th className="p-2">VALUE</th>
                    <th className="p-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 font-mono text-gray-300">
                  {variables.map((v, i) => (
                    <tr key={i} className="hover:bg-gray-800/30">
                      <td className="p-2 text-center">
                        <input type="checkbox" checked={v.enabled} onChange={e => handleUpdateVar(i, 'enabled', e.target.checked)} className="cursor-pointer accent-orange-500" />
                      </td>
                      <td className="p-1">
                        <input type="text" data-testid={`group-var-key-${i}`} value={v.key} onChange={e => handleUpdateVar(i, 'key', e.target.value)} className="w-full p-2 bg-transparent outline-none placeholder-gray-600" placeholder="New key" />
                      </td>
                      <td className="p-1">
                        <input type="text" data-testid={`group-var-val-${i}`} value={v.value} onChange={e => handleUpdateVar(i, 'value', e.target.value)} className="w-full p-2 bg-transparent outline-none placeholder-gray-600" placeholder="Value" />
                      </td>
                      <td className="p-2 text-center">
                        <button onClick={() => handleRemoveVar(i)} className="text-gray-500 hover:text-red-400"><X size={14} /></button>
                      </td>
                    </tr>
                  ))}
                  <tr className="hover:bg-gray-800/30 cursor-pointer" onClick={handleAddVar} data-testid="group-add-var-btn">
                    <td className="p-2"></td>
                    <td className="p-2 text-gray-500" colSpan={3}>+ Add a new variable</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'prerequest' && (
            <div className="h-full flex flex-col gap-2">
              <p className="text-xs text-gray-400">Write JavaScript code to execute before sending any request in this {type}.</p>
              <div className="flex-1 min-h-0 border border-gray-700 rounded overflow-hidden" data-testid="group-prerequest-editor">
                <ScriptEditor value={preRequestScript} onChange={setPreRequestScript} />
              </div>
            </div>
          )}

          {activeTab === 'test' && (
            <div className="h-full flex flex-col gap-2">
              <p className="text-xs text-gray-400">Write JavaScript code to test the response of any request in this {type}.</p>
              <div className="flex-1 min-h-0 border border-gray-700 rounded overflow-hidden" data-testid="group-test-editor">
                <ScriptEditor value={testScript} onChange={setTestScript} />
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-700 bg-gray-900 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:text-white transition">Cancel</button>
          <button data-testid="group-edit-save-btn" onClick={handleSave} disabled={loading} className="px-4 py-2 text-sm bg-orange-600 hover:bg-orange-500 text-white rounded font-medium disabled:opacity-50 transition">
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};
