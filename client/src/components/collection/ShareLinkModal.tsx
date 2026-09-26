import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check } from 'lucide-react';
import api from '../../api/axios';
import { useToastStore } from '../../store/toastStore';

interface Props {
  collectionId: string;
  collectionName: string;
  onClose: () => void;
}

export function ShareLinkModal({ collectionId, collectionName, onClose }: Props) {
  const [expiresInDays, setExpiresInDays] = useState('7');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sharedLink, setSharedLink] = useState('');
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    try {
      setLoading(true);
      const res = await api.post('/share/collection/' + collectionId, { expiresInDays: parseInt(expiresInDays) });
      setSharedLink(window.location.origin + res.data.url);
      setLoading(false);
    } catch (err: any) {
      const message = err.response?.data?.message || 'Failed to generate link';
      // Local state for inline feedback while the modal is still open, plus a
      // toast so the error isn't silently lost if the user already closed it
      // before this async call settled (UI-2).
      setError(message);
      useToastStore.getState().addToast('error', message);
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sharedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return createPortal(
    <div data-testid="share-link-modal" className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-lg shadow-2xl p-6 w-[400px]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Share "{collectionName}"</h2>
          <button onClick={onClose} className="p-1 hover:bg-background rounded">
            <X size={20} />
          </button>
        </div>

        {!sharedLink ? (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              Generate a temporary public link for others to view and execute this collection.
            </p>
            <div>
              <label className="block text-sm font-medium mb-1">Expires in</label>
              <select
                value={expiresInDays}
                onChange={e => setExpiresInDays(e.target.value)}
                className="w-full p-2 border border-border rounded bg-background text-sm"
              >
                <option value="1">1 Day</option>
                <option value="7">1 Week</option>
                <option value="30">1 Month</option>
              </select>
            </div>

            {error && <div className="text-red-500 text-sm">{error}</div>}

            <div className="pt-4 flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 hover:bg-background rounded text-sm font-medium">
                Cancel
              </button>
              <button 
                data-testid="share-link-generate-btn"
                onClick={handleShare} 
                disabled={loading}
                className="bg-primary text-white px-4 py-2 rounded text-sm font-bold hover:bg-orange-600 disabled:opacity-50"
              >
                {loading ? 'Generating...' : 'Generate Link'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-green-400">Link generated successfully!</p>
            <div className="flex gap-2">
              <input 
                data-testid="share-link-result"
                type="text" 
                readOnly 
                value={sharedLink} 
                className="flex-1 p-2 border border-border rounded bg-background text-sm focus:outline-none"
              />
              <button 
                onClick={copyToClipboard}
                className="bg-background border border-border hover:bg-gray-800 text-text p-2 rounded flex items-center justify-center"
              >
                {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
              </button>
            </div>
            <div className="pt-4 flex justify-end">
              <button onClick={onClose} className="bg-primary text-white px-4 py-2 rounded text-sm font-bold hover:bg-orange-600">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
