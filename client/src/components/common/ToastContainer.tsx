import React from 'react';
import { useToastStore } from '../../store/toastStore';
import { X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center justify-between min-w-[300px] max-w-md p-4 rounded shadow-lg text-white ${
            toast.type === 'error' ? 'bg-red-600' :
            toast.type === 'success' ? 'bg-green-600' :
            'bg-blue-600'
          }`}
        >
          <span className="text-sm">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="p-1 hover:bg-black/20 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Close toast"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};
