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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]" onClick={onClose}>
      <div
        data-testid="codegen-modal"
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-gray-100">Generate Code</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={16} /></button>
        </div>

        {/* Language Selector */}
        <div className="flex gap-1 p-3 border-b border-gray-800 overflow-x-auto flex-shrink-0">
          {LANGUAGES.map(lang => (
            <button
              key={lang.id}
              data-testid={`codegen-lang-${lang.id}`}
              onClick={() => setLanguage(lang.id)}
              className={`px-3 py-1.5 text-xs rounded whitespace-nowrap transition-colors ${
                language === lang.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>

        {/* Code Block */}
        <div className="flex-1 overflow-y-auto relative">
          <pre data-testid="codegen-code-block" className="p-4 text-xs text-gray-200 font-mono whitespace-pre-wrap break-words leading-relaxed">
            {code}
          </pre>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-700 flex justify-end">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors"
          >
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CodeGenModal;
