import { useEffect, useRef } from 'react';
import { useExtensionStore } from '../../store/extensionStore';
import { X, Download, Puzzle } from 'lucide-react';

/**
 * Modal that appears when the user tries to send a request but the
 * Reqspace Transport extension is not installed.
 *
 * The modal provides a one-click download of the packaged .crx file
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
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[300] p-4"
      onClick={() => setShowDownloadModal(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ext-modal-title"
        className="bg-[#0f1117] border border-[#2d3348] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1e1b4b] to-[#312e81] px-6 py-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-500/20 p-2.5 rounded-xl">
              <Puzzle size={22} className="text-indigo-300" />
            </div>
            <div>
              <h2 id="ext-modal-title" className="text-base font-bold text-white">
                Install Reqspace Extension
              </h2>
              <p className="text-xs text-indigo-300 mt-0.5">Required to bypass CORS restrictions</p>
            </div>
          </div>
          <button
            ref={closeRef}
            onClick={() => setShowDownloadModal(false)}
            className="text-indigo-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Explanation */}
          <p className="text-sm text-slate-400 leading-relaxed">
            Your browser's CORS policy blocks direct requests to external APIs.
            The <span className="text-indigo-300 font-semibold">Reqspace Transport</span> extension
            routes requests through its service worker, bypassing this restriction securely.
          </p>

          {/* Download button */}
          <a
            href="/extension/reqspace-transport.crx"
            download="reqspace-transport.crx"
            className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors text-sm"
          >
            <Download size={16} />
            Download Extension (.crx)
          </a>

          {/* Install instructions */}
          <div className="bg-[#1a1f2e] border border-[#2d3348] rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Install Steps</p>
            {[
              { n: '1', text: 'Download the .crx file above' },
              { n: '2', text: <>Open <code className="text-indigo-300 bg-indigo-950/50 px-1.5 py-0.5 rounded text-[11px]">chrome://extensions</code> in a new tab</> },
              { n: '3', text: 'Enable Developer Mode (toggle top-right)' },
              { n: '4', text: 'Drag the downloaded .crx file into the page' },
              { n: '5', text: 'Click "Add extension" in the confirmation dialog' },
            ].map(({ n, text }) => (
              <div key={n} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 h-5 bg-indigo-600 text-white text-[11px] font-bold rounded-full flex items-center justify-center mt-0.5">
                  {n}
                </span>
                <p className="text-sm text-slate-300 leading-snug">{text}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-600 text-center">
            After installing, refresh this page — the extension will be detected automatically.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5">
          <button
            onClick={() => setShowDownloadModal(false)}
            className="w-full py-2.5 text-sm text-slate-400 hover:text-white border border-[#2d3348] rounded-xl hover:bg-white/5 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
