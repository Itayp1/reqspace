import { useState, useEffect } from 'react';
import { GitFork, X } from 'lucide-react';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';

interface Props {
  collectionId: string;
  collectionName: string;
  onClose: () => void;
  onForked?: (forkedCollectionId: string) => void;
}

export function ForkModal({ collectionId, collectionName, onClose, onForked }: Props) {
  const { workspaces, activeWorkspace } = useAuthStore();
  // Forking is restricted server-side to shared workspace → the fork owner's
  // own personal workspace (see routes/forks.ts) — there's exactly one valid
  // target, so there's nothing to pick.
  const personalWorkspace = workspaces?.find((ws: any) => ws.isPersonal);
  const [forkName, setForkName] = useState(`${collectionName} (Fork)`);
  const [environments, setEnvironments] = useState<{ _id: string; name: string }[]>([]);
  const [copyEnvId, setCopyEnvId] = useState('');
  const [copyVars, setCopyVars] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // The collection being forked always lives in the currently active
  // workspace (CollectionExplorer only ever shows that workspace's tree), so
  // that's the workspace whose environments are eligible to copy.
  useEffect(() => {
    if (!activeWorkspace?._id) return;
    api.get(`/workspaces/${activeWorkspace._id}/environments`)
      .then(res => setEnvironments((res.data || []).filter((e: any) => !e.isGlobal)))
      .catch(() => setEnvironments([]));
  }, [activeWorkspace?._id]);

  const handleFork = async () => {
    if (!personalWorkspace) { setError('Could not find your personal workspace'); return; }
    if (!forkName.trim()) { setError('Please enter a name for the fork'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api.post(`/collections/${collectionId}/fork`, {
        targetWorkspaceId: personalWorkspace._id,
        name: forkName.trim(),
        copyEnvironmentId: copyEnvId || undefined,
        copyVariables: copyVars,
      });
      // SocketSync only joins the currently-active workspace's room, so a fork
      // created in some other workspace won't refresh that workspace's tree
      // live — the user has to switch to it. Tell them explicitly instead of
      // leaving it looking like nothing happened. (The target is always the
      // personal workspace, and forking is only ever done from a shared one,
      // so this is always true — kept as an explicit check rather than
      // hard-coded in case that invariant ever loosens.)
      if (personalWorkspace._id !== activeWorkspace?._id) {
        useToastStore.getState().addToast('success', `Forked into ${personalWorkspace.name}. Switch workspaces to see it.`);
      }
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
            data-testid="fork-name-input"
            className="w-full bg-surface-highlight border border-border rounded px-3 py-1.5 text-sm outline-none focus:border-primary"
            value={forkName}
            onChange={e => setForkName(e.target.value)}
            placeholder="My fork name"
          />
        </div>

        {/* Target workspace — always the fork owner's personal workspace */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Target workspace</label>
          <div
            data-testid="fork-target-workspace"
            className="w-full bg-surface-highlight border border-border rounded px-3 py-1.5 text-sm text-text-muted"
          >
            {personalWorkspace ? personalWorkspace.name : 'Personal workspace not found'}
          </div>
        </div>

        {/* Environment to copy */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Copy environment (optional)</label>
          <select
            data-testid="fork-copy-env-select"
            className="w-full bg-surface-highlight border border-border rounded px-3 py-1.5 text-sm outline-none focus:border-primary"
            value={copyEnvId}
            onChange={e => setCopyEnvId(e.target.value)}
          >
            <option value="">None</option>
            {environments.map(env => (
              <option key={env._id} value={env._id}>{env.name}</option>
            ))}
          </select>
        </div>

        {/* Options */}
        <div className="mb-5 space-y-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              data-testid="fork-copy-vars-checkbox"
              type="checkbox"
              checked={copyVars}
              onChange={e => setCopyVars(e.target.checked)}
              className="rounded border-border text-primary"
            />
            Copy Collection Variables
          </label>
        </div>

        {error && (
          <p data-testid="fork-error" className="text-red-400 text-sm mb-3">{error}</p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            data-testid="fork-cancel-btn"
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded border border-border hover:bg-surface-highlight"
          >
            Cancel
          </button>
          <button
            data-testid="fork-submit-btn"
            onClick={handleFork}
            disabled={loading || !personalWorkspace}
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
