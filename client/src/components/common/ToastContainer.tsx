import React from 'react';
import { useToastStore } from '../../store/toastStore';
import { X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  return (
    <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-[10000] flex flex-col gap-2 max-w-[calc(100vw-2rem)]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          data-testid={`toast-${toast.type}`}
          className={`flex items-center justify-between gap-3 min-w-[min(300px,100%)] max-w-md p-4 rounded shadow-lg text-white ${
            toast.type === 'error' ? 'bg-red-600' :
            toast.type === 'success' ? 'bg-green-600' :
            'bg-blue-600'
          }`}
        >
          <span className="text-sm break-words min-w-0">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="p-1 hover:bg-black/20 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Close notification"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
};
