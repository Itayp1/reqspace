import React, { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  children?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  title,
  message,
  confirmLabel = 'Delete',
  children,
  onConfirm,
  onCancel,
}) => {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  // A fast double click / double Enter must run the action once, not twice,
  // before the parent has had a chance to unmount the modal.
  const settledRef = useRef(false);
  const confirmOnce = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onConfirm();
  };
  const confirmRef = useRef(confirmOnce);
  confirmRef.current = confirmOnce;

  // Focus cancel button on open for safety; Enter confirms
  useEffect(() => {
    cancelBtnRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); } // lets an outer useEscape dialog stay open
      else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        confirmRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]"
      onClick={onCancel}
      role="presentation"
      aria-hidden="false"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-description"
        className={`bg-background border border-border rounded-lg shadow-xl w-full p-6 ${children ? 'max-w-2xl' : 'max-w-sm'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-red-500/10 p-2 rounded-lg" aria-hidden="true">
            <AlertTriangle size={20} className="text-red-500" />
          </div>
          <h2 id="confirm-modal-title" className="text-base font-semibold text-text">{title}</h2>
        </div>
        <p id="confirm-modal-description" className="text-sm text-text-muted mb-6 leading-relaxed">{message}</p>
        {children}
        <div className="flex gap-3 justify-end">
          <button
            ref={cancelBtnRef}
            data-testid="confirm-cancel-btn"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg text-text hover:bg-border border border-border transition-colors"
          >
            Cancel
          </button>
          <button
            data-testid="confirm-btn"
            onClick={confirmOnce}
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
