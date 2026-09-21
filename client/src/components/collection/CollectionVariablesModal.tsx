import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useCollectionStore } from '../../store/collectionStore';
import api from '../../api/axios';

interface CollectionVariable {
  key: string;
  value: string;
  enabled: boolean;
}

interface CollectionVariablesModalProps {
  collectionId: string;
  collectionName: string;
  onClose: () => void;
}

export const CollectionVariablesModal: React.FC<CollectionVariablesModalProps> = ({
  collectionId,
  collectionName,
  onClose,
}) => {
  const { collections, setCollections } = useCollectionStore();
  const collection = collections.find(c => c._id === collectionId);

  const [variables, setVariables] = useState<CollectionVariable[]>(
    collection?.variables || []
  );
  const [loading, setLoading] = useState(false);

  const handleAdd = () => {
    setVariables([...variables, { key: '', value: '', enabled: true }]);
  };

  const handleUpdate = (index: number, field: keyof CollectionVariable, val: any) => {
    const next = [...variables];
    next[index] = { ...next[index], [field]: val };
    setVariables(next);
  };

  const handleRemove = (index: number) => {
    setVariables(variables.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const cleanVars = variables.filter(v => v.key.trim() !== '');
      const res = await api.put(`/collections/${collectionId}`, {
        variables: cleanVars,
      });
      setCollections(collections.map(c => c._id === collectionId ? { ...c, variables: res.data.variables } : c));
      onClose();
    } catch (err) {
      console.error('Failed to save collection variables', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-xl flex flex-col max-h-[80vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800/40">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">Variables — {collectionName}</h2>
            <p className="text-xs text-gray-400 mt-0.5">These variables are accessible to all requests in this collection.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="p-2 w-8"></th>
                <th className="p-2">VARIABLE</th>
                <th className="p-2">VALUE</th>
                <th className="p-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 font-mono">
              {variables.map((v, i) => (
                <tr key={i} className="hover:bg-gray-800/30">
                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      checked={v.enabled}
                      onChange={e => handleUpdate(i, 'enabled', e.target.checked)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="text"
                      value={v.key}
                      onChange={e => handleUpdate(i, 'key', e.target.value)}
                      placeholder="key"
                      className="w-full p-1.5 bg-gray-800/60 rounded border border-gray-700/60 text-gray-200 outline-none focus:border-blue-500"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="text"
                      value={v.value}
                      onChange={e => handleUpdate(i, 'value', e.target.value)}
                      placeholder="value"
                      className="w-full p-1.5 bg-gray-800/60 rounded border border-gray-700/60 text-gray-200 outline-none focus:border-blue-500"
                    />
                  </td>
                  <td className="p-1 text-center">
                    <button
                      onClick={() => handleRemove(i)}
                      className="p-1 text-gray-500 hover:text-red-400 rounded"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
              <tr
                className="hover:bg-gray-800/40 cursor-pointer font-sans text-gray-500 hover:text-gray-300"
                onClick={handleAdd}
              >
                <td className="p-2"></td>
                <td className="p-2 text-xs flex items-center gap-1.5" colSpan={3}>
                  <Plus size={12} /> Add new variable
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="p-3 border-t border-gray-700 flex justify-end gap-2 bg-gray-800/20">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Variables'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CollectionVariablesModal;
