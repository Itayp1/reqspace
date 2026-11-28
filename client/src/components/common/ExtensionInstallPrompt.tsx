import { useState, useEffect } from 'react';
import { Puzzle, Download, X } from 'lucide-react';
import { isExtensionInstalled, isExtensionBlocked, onExtensionStatus, requestExtensionOrigin, getExtensionVersion } from '../../transport/extension';
import { useExtensionStore } from '../../store/extensionStore';

const DISMISSED_KEY = 'reqspace.extensionPromptDismissed';
const UPDATE_DISMISSED_KEY = 'reqspace.extensionUpdateDismissed';

interface ExtensionRelease { version: string; changes: string[] }

const parseVersion = (v: string) => (/^\d+(\.\d+)*$/.test(v) ? v.split('.').map(Number) : null);
/** True only when both are plain x.y.z versions and `a` is higher (test doubles report "test"). */
export function isNewerVersion(a: string, b: string): boolean {
  const pa = parseVersion(a), pb = parseVersion(b);
  if (!pa || !pb) return false;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
}

// Mobile browsers can't run extensions, so the prompt would be a dead end.
const isMobileBrowser = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

export function ExtensionInstallPrompt() {
  const [show, setShow] = useState(false);
  const { setShowDownloadModal } = useExtensionStore();
  const [, rerender] = useState(0);
  useEffect(() => onExtensionStatus(() => rerender((n) => n + 1)), []);

  // Installed extension older than the one this server ships: say so and list what is new.
  const installedVersion = getExtensionVersion();
  const [update, setUpdate] = useState<{ latest: string; releases: ExtensionRelease[] } | null>(null);
  useEffect(() => {
    if (!installedVersion || (window as any).electron) return;
    let cancelled = false;
    fetch('/extension/version.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => {
        if (cancelled || !info || !isNewerVersion(info.version, installedVersion)) return;
        if (localStorage.getItem(UPDATE_DISMISSED_KEY) === info.version) return;
        const releases = (Array.isArray(info.changelog) ? info.changelog : []).filter((e: ExtensionRelease) => isNewerVersion(e.version, installedVersion));
        setUpdate({ latest: info.version, releases });
      })
      .catch(() => { /* no package on this server: nothing to compare with */ });
    return () => { cancelled = true; };
  }, [installedVersion]);

  useEffect(() => {
    if ((window as any).electron || isMobileBrowser()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    // The extension's content script answers our ping asynchronously.
    const timer = setTimeout(() => {
      if (!isExtensionInstalled() && !isExtensionBlocked()) setShow(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Installed, but this site is not in its allowlist: offer to add it (never dismissed permanently).
  if (isExtensionBlocked()) {
    return (
      <div data-testid="extension-origin-prompt" className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-sm bg-amber-500/10 border-b border-amber-500/40 text-text">
        <Puzzle size={16} className="text-amber-600 shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-[200px]">
          <span className="font-semibold">Extension not enabled for this site.</span>{' '}
          Add <code className="bg-border px-1 rounded">{window.location.origin}</code> to the extension's allowed origins.
        </span>
        <button
          onClick={requestExtensionOrigin}
          className="px-3 py-1 rounded-md bg-primary hover:bg-primary/90 text-white font-medium focus-visible:ring-2 focus-visible:ring-primary"
        >
          Add to extension
        </button>
      </div>
    );
  }

  if (update) {
    return (
      <div data-testid="extension-update-prompt" className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-sm bg-amber-500/10 border-b border-amber-500/40 text-text">
        <Puzzle size={16} className="text-amber-600 shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-[200px]">
          <span className="font-semibold">Extension update available.</span>{' '}
          Installed <code className="bg-border px-1 rounded">{installedVersion}</code>, latest <code className="bg-border px-1 rounded">{update.latest}</code>.
          Download it, replace the extension folder and reload the extension in chrome://extensions.
        </span>
        <a
          href="/extension/reqspace-transport.zip"
          download="reqspace-transport.zip"
          className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-primary hover:bg-primary/90 text-white font-medium focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Download size={14} aria-hidden="true" />
          Download
        </a>
        <button
          onClick={() => { localStorage.setItem(UPDATE_DISMISSED_KEY, update.latest); setUpdate(null); }}
          aria-label="Dismiss"
          className="p-1 rounded hover:bg-border text-text-muted hover:text-text focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X size={16} aria-hidden="true" />
        </button>
        {update.releases.length > 0 && (
          <div data-testid="extension-update-changes" className="basis-full pl-6">
            <div className="font-semibold">What's new</div>
            {update.releases.map((r) => (
              <div key={r.version}>
                <span className="text-text-muted">{r.version}</span>
                <ul className="list-disc pl-5">{r.changes.map((c) => <li key={c}>{c}</li>)}</ul>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

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
