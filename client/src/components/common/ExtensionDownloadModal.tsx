import { useEffect, useRef } from 'react';
import { useExtensionStore } from '../../store/extensionStore';
import { X, Download, Puzzle } from 'lucide-react';

/**
 * Modal that appears when the user tries to send a request but the
 * Reqspace Transport extension is not installed.
 *
 * The modal provides a download of the packaged extension (zip)
 * and step-by-step install instructions.
 */
export function ExtensionDownloadModal() {
  const { showDownloadModal, setShowDownloadModal } = useExtensionStore();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showDownloadModal) return;
    closeRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowDownloadModal(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showDownloadModal, setShowDownloadModal]);

  if (!showDownloadModal) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[300] p-4"
      onClick={() => setShowDownloadModal(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ext-modal-title"
        className="bg-surface border border-border rounded-lg shadow-xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/15 p-2.5 rounded-lg">
              <Puzzle size={22} className="text-primary" aria-hidden="true" />
            </div>
            <div>
              <h2 id="ext-modal-title" className="text-base font-semibold text-text">
                Install Reqspace Extension
              </h2>
              <p className="text-xs text-text-muted mt-0.5">Required to bypass CORS restrictions</p>
            </div>
          </div>
          <button
            ref={closeRef}
            onClick={() => setShowDownloadModal(false)}
            className="text-text-muted hover:text-text p-1 rounded hover:bg-border transition-colors focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Close"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Explanation */}
          <p className="text-sm text-text-muted leading-relaxed">
            Your browser's CORS policy blocks direct requests to external APIs.
            The <span className="text-text font-semibold">Reqspace Transport</span> extension
            routes requests through its service worker, bypassing this restriction securely.
          </p>

          {/* Download button */}
          <a
            href="/extension/reqspace-transport.zip"
            download="reqspace-transport.zip"
            className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-primary hover:bg-primary/90 text-white font-semibold rounded transition-colors text-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <Download size={16} aria-hidden="true" />
            Download Extension (.zip)
          </a>

          {/* Install instructions */}
          <div className="bg-background border border-border rounded-lg p-4 space-y-3">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-widest">Install Steps</p>
            {[
              { n: '1', text: 'Download the .zip file above and extract it to a folder' },
              { n: '2', text: <>Open <code className="text-text bg-border px-1.5 py-0.5 rounded text-[11px]">chrome://extensions</code> in a new tab</> },
              { n: '3', text: 'Enable Developer Mode (toggle top-right)' },
              { n: '4', text: 'Click "Load unpacked" and select the extracted folder' },
            ].map(({ n, text }) => (
              <div key={n} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 h-5 bg-primary text-white text-[11px] font-bold rounded-full flex items-center justify-center mt-0.5">
                  {n}
                </span>
                <p className="text-sm text-text leading-snug">{text}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-text-muted text-center">
            After installing, refresh this page. The extension is detected automatically.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5">
          <button
            onClick={() => setShowDownloadModal(false)}
            className="w-full py-2.5 text-sm text-text border border-border rounded hover:bg-border transition-colors focus-visible:ring-2 focus-visible:ring-primary"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
