import { useState, useEffect } from 'react';
import { Puzzle, Download, X } from 'lucide-react';
import { isExtensionInstalled } from '../../transport/extension';
import { useExtensionStore } from '../../store/extensionStore';

const DISMISSED_KEY = 'reqspace.extensionPromptDismissed';

// Mobile browsers can't run extensions, so the prompt would be a dead end.
const isMobileBrowser = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

export function ExtensionInstallPrompt() {
  const [show, setShow] = useState(false);
  const { setShowDownloadModal } = useExtensionStore();

  useEffect(() => {
    if ((window as any).electron || isMobileBrowser()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    // The extension's content script answers our ping asynchronously.
    const timer = setTimeout(() => {
      if (!isExtensionInstalled()) setShow(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setShow(false);
  };

  return (
    <div
      data-testid="extension-install-prompt"
      className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-sm bg-indigo-950/60 border-b border-indigo-800 text-indigo-100"
    >
      <Puzzle size={16} className="text-indigo-300 shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-[200px]">
        <span className="font-semibold">Extension not active.</span>{' '}
        Requests to servers that block CORS will fail until the Reqspace Transport extension is installed.
      </span>
      <button
        onClick={() => setShowDownloadModal(true)}
        className="px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
      >
        How to install
      </button>
      <a
        href="/extension/reqspace-transport.zip"
        download="reqspace-transport.zip"
        className="inline-flex items-center gap-1 px-3 py-1 rounded-md border border-indigo-500 text-indigo-100 hover:bg-indigo-900 font-medium"
      >
        <Download size={14} aria-hidden="true" />
        Download
      </a>
      <button onClick={dismiss} aria-label="Dismiss" className="p-1 rounded hover:bg-indigo-900 text-indigo-300">
        <X size={16} />
      </button>
    </div>
  );
}
