import React, { useState, useEffect } from 'react';
import { isExtensionInstalled } from '../../transport/extension';

export function ExtensionInstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Check after a short delay to allow the extension content script to ping
    const timer = setTimeout(() => {
      if (!isExtensionInstalled() && !(window as any).electron) {
        setShow(true);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <div data-testid="extension-install-prompt" className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center justify-between text-sm text-blue-800">
      <div className="flex items-center gap-2">
        <span className="font-semibold">Bypass CORS:</span>
        <span>Install the Reqspace Chrome Extension to send requests directly from your browser.</span>
      </div>
      <button 
        onClick={() => setShow(false)}
        className="text-blue-600 hover:text-blue-900 font-medium"
      >
        Dismiss
      </button>
    </div>
  );
}
