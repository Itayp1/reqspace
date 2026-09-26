import { useState } from 'react';
import { GitFork, X } from 'lucide-react';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';

interface Props {
  collectionId: string;
  collectionName: string;
  onClose: () => void;
  onForked?: (forkedCollectionId: string) => void;
}

export function ForkModal({ collectionId, collectionName, onClose, onForked }: Props) {
  const { workspaces, activeWorkspace } = useAuthStore();
  const [forkName, setForkName] = useState(`${collectionName} (Fork)`);
  const [targetWorkspaceId, setTargetWorkspaceId] = useState(activeWorkspace?._id || '');
  const [copyEnvId] = useState('');
  const [copyVars, setCopyVars] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFork = async () => {
    if (!targetWorkspaceId) { setError('Please select a target workspace'); return; }
    if (!forkName.trim()) { setError('Please enter a name for the fork'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api.post(`/collections/${collectionId}/fork`, {
        targetWorkspaceId,
        name: forkName.trim(),
        copyEnvironmentId: copyEnvId || undefined,
      });
      onForked?.(res.data.fork.collection._id);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Fork failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-lg shadow-xl w-[460px] p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <GitFork className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold">Fork Collection</h2>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-text-muted mb-4">
          Forking <strong className="text-text">{collectionName}</strong> creates a copy you can modify independently.
          Changes to the original will automatically propagate to items you haven&apos;t edited.
        </p>

        {/* Fork name */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Fork name</label>
          <input
            className="w-full bg-surface-highlight border border-border rounded px-3 py-1.5 text-sm outline-none focus:border-primary"
            value={forkName}
            onChange={e => setForkName(e.target.value)}
            placeholder="My fork name"
          />
        </div>

        {/* Target workspace */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Target workspace</label>
          <select
            className="w-full bg-surface-highlight border border-border rounded px-3 py-1.5 text-sm outline-none focus:border-primary"
            value={targetWorkspaceId}
            onChange={e => setTargetWorkspaceId(e.target.value)}
          >
            <option value="">Select workspace...</option>
            {workspaces?.map((ws: any) => (
              <option key={ws._id} value={ws._id}>
                {ws.name}
                {ws._id === activeWorkspace?._id ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Options */}
        <div className="mb-5 space-y-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={copyVars}
              onChange={e => setCopyVars(e.target.checked)}
              className="rounded border-border text-primary"
            />
            Copy Collection Variables
          </label>
        </div>

        {error && (
          <p className="text-red-400 text-sm mb-3">{error}</p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded border border-border hover:bg-surface-highlight"
          >
            Cancel
          </button>
          <button
            onClick={handleFork}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-1.5 text-sm rounded bg-primary text-primary-content hover:bg-primary/90 disabled:opacity-50"
          >
            <GitFork className="w-4 h-4" />
            {loading ? 'Forking...' : 'Create Fork'}
          </button>
        </div>
      </div>
    </div>
  );
}
