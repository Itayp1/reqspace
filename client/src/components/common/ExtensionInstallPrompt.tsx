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
      className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-sm bg-primary/10 border-b border-primary/30 text-text"
    >
      <Puzzle size={16} className="text-primary shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-[200px]">
        <span className="font-semibold">Extension not active.</span>{' '}
        Requests to servers that block CORS will fail until the Reqspace Transport extension is installed.
      </span>
      <button
        onClick={() => setShowDownloadModal(true)}
        className="px-3 py-1 rounded-md bg-primary hover:bg-primary/90 text-white font-medium focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        How to install
      </button>
      <a
        href="/extension/reqspace-transport.zip"
        download="reqspace-transport.zip"
        className="inline-flex items-center gap-1 px-3 py-1 rounded-md border border-border text-text hover:bg-border font-medium focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Download size={14} aria-hidden="true" />
        Download
      </a>
      <button onClick={dismiss} aria-label="Dismiss" className="p-1 rounded hover:bg-border text-text-muted hover:text-text focus-visible:ring-2 focus-visible:ring-primary">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
