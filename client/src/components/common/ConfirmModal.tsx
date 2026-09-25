import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]" onClick={onCancel}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-red-500/10 p-2 rounded-lg">
            <AlertTriangle size={20} className="text-red-400" />
          </div>
          <h2 className="text-base font-semibold text-gray-100">{title}</h2>
        </div>
        <p className="text-sm text-gray-400 mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            data-testid="confirm-cancel-btn"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 border border-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            data-testid="confirm-btn"
            onClick={onConfirm}
            className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
