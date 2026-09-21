import React, { useState } from 'react';
import { X, Radio, Copy, Check } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

interface CaptureTrafficModalProps {
  onClose: () => void;
}

export const CaptureTrafficModal: React.FC<CaptureTrafficModalProps> = ({ onClose }) => {
  const { activeWorkspace } = useAuthStore();
  const [copied, setCopied] = useState(false);

  const captureUrl = `${window.location.protocol}//${window.location.hostname}:5000/api/capture/${activeWorkspace?._id}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(captureUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]" onClick={onClose}>
      <div 
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden text-gray-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800/50">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Radio className="text-orange-500 animate-pulse" size={20} />
            Capture Traffic (Interceptor)
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6">
          <p className="text-sm text-gray-300 mb-6 leading-relaxed">
            Configure your external applications (like cURL, mobile apps, or other API clients) to send traffic to our interceptor endpoint. The proxy will automatically capture the request, save it to the <strong>"Captured Requests"</strong> collection in your current workspace, and optionally forward it to the target URL.
          </p>

          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Your Capture URL</h3>
            <div className="flex items-stretch bg-gray-950 border border-gray-700 rounded-md overflow-hidden">
              <input 
                type="text" 
                readOnly 
                value={captureUrl}
                className="flex-1 bg-transparent px-3 py-2 text-sm font-mono text-gray-300 outline-none"
              />
              <button 
                onClick={copyToClipboard}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 border-l border-gray-700 flex items-center gap-2 transition-colors"
              >
                {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">How to use</h3>
            
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <h4 className="text-sm font-medium text-orange-400 mb-2">Option 1: Prepend to target URL</h4>
              <p className="text-xs text-gray-400 mb-2">Send requests directly to the capture URL, followed by your target URL.</p>
              <pre className="text-[11px] font-mono text-gray-300 bg-gray-900 p-2 rounded break-all overflow-x-auto">
                curl -X POST {captureUrl}/api.example.com/v1/users \
                -H "Content-Type: application/json" \
                -d '{'{"name": "Alice"}'}'
              </pre>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <h4 className="text-sm font-medium text-blue-400 mb-2">Option 2: Use X-Target-Url header</h4>
              <p className="text-xs text-gray-400 mb-2">Send to the root capture URL and specify the target in a header.</p>
              <pre className="text-[11px] font-mono text-gray-300 bg-gray-900 p-2 rounded break-all overflow-x-auto">
                curl {captureUrl} \
                -H "X-Target-Url: https://api.example.com/v1/users"
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
