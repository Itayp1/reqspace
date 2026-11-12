import { useEscape } from '../../hooks/useEscape';
import React, { useState, useMemo } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { useRequestStore } from '../../store/requestStore';

interface CodeGenModalProps {
  onClose: () => void;
}

import { resolveAllVariables } from '../../utils/variables';
import { applyRequestAuth, folderChainClosestFirst, resolveInheritedAuth } from '../../utils/requestAuth';
import { useCollectionStore, type Folder } from '../../store/collectionStore';
import { bodyForCode, generateSnippet, type Language } from '../../utils/codegen';

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'fetch', label: 'JavaScript (fetch)' },
  { id: 'axios', label: 'JavaScript (axios)' },
  { id: 'python-requests', label: 'Python (requests)' },
  { id: 'python-httpx', label: 'Python (httpx)' },
  { id: 'go', label: 'Go' },
  { id: 'csharp', label: 'C# (HttpClient)' },
];

// Resolves the tab the same way Send does (variables, inherited auth, the
// body as it would be sent), then renders it for the chosen language.
function generateCode(language: Language, req: ReturnType<typeof useRequestStore.getState>['activeRequest']): string {
  if (!req) return '';

  const { collectionId } = req;
  const { collections, foldersByCollection } = useCollectionStore.getState();
  const allFolders = Object.values(foldersByCollection).filter((v): v is Folder[] => Array.isArray(v)).flat();
  const collection = collections.find(c => c._id === collectionId);
  const resolve = (value: string) => resolveAllVariables(value, collectionId);

  const baseHeaders: Record<string, string> = {};
  for (const h of req.headers || []) {
    if (h.enabled && h.key.trim()) baseHeaders[h.key] = resolve(h.value);
  }
  const applied = applyRequestAuth({
    auth: resolveInheritedAuth(req.auth, folderChainClosestFirst(req.folderId, allFolders), collection),
    headers: baseHeaders,
    url: resolve(req.url || ''),
    resolve,
  });

  return generateSnippet(language, {
    method: (req.method || 'GET').toUpperCase(),
    url: applied.url,
    headers: Object.entries(applied.headers),
    body: bodyForCode(req.body as any, resolve),
  });
}

export const CodeGenModal: React.FC<CodeGenModalProps> = ({ onClose }) => {
  useEscape(onClose);
  const { activeRequest } = useRequestStore();
  const [language, setLanguage] = useState<Language>('curl');
  const [copied, setCopied] = useState(false);

  const code = useMemo(() => generateCode(language, activeRequest), [language, activeRequest]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Clipboard API can be denied (permissions, insecure context) — fail visibly instead of silently
      console.error('Failed to copy code to clipboard');
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[200]" onClick={onClose}>
      <div
        data-testid="codegen-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Generate code"
        className="bg-background text-text border border-border rounded-lg shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="text-base font-semibold">Generate Code</h2>
          <button aria-label="Close" onClick={onClose} className="p-1 rounded text-text-muted hover:text-text hover:bg-surface outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><X size={16} aria-hidden="true" /></button>
        </div>

        {/* Language Selector */}
        <div className="flex flex-wrap gap-1 p-3 border-b border-border flex-shrink-0">
          {LANGUAGES.map(lang => (
            <button
              key={lang.id}
              data-testid={`codegen-lang-${lang.id}`}
              aria-pressed={language === lang.id}
              onClick={() => setLanguage(lang.id)}
              className={`px-3 py-1.5 text-xs rounded whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                language === lang.id
                  ? 'bg-primary-strong text-white'
                  : 'text-text-muted hover:text-text hover:bg-surface'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>

        {/* Code Block */}
        <div className="flex-1 overflow-y-auto relative">
          <pre data-testid="codegen-code-block" className="p-4 text-xs text-text bg-surface font-mono whitespace-pre-wrap break-words leading-relaxed">
            {code}
          </pre>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex justify-end">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded bg-primary-strong hover:bg-primary/90 text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {copied ? <Check size={14} className="text-white" /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CodeGenModal;
