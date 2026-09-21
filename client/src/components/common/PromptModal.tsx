import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface PromptModalProps {
  title: string;
  placeholder?: string;
  initialValue?: string;
  submitText?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export const PromptModal: React.FC<PromptModalProps> = ({
  title,
  placeholder = 'Enter value...',
  initialValue = '',
  submitText = 'Save',
  onSubmit,
  onCancel
}) => {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus the input when the modal opens
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSubmit(value.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="bg-surface border border-border rounded-lg shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          <button onClick={onCancel} className="text-text-muted hover:text-text transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="p-4">
            <input
              ref={inputRef}
              type="text"
              className="w-full p-2 border border-border rounded bg-transparent text-text focus:border-primary outline-none"
              placeholder={placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div className="p-4 border-t border-border flex justify-end gap-2 bg-gray-900/50">
            <button 
              type="button"
              onClick={onCancel} 
              className="px-4 py-2 border border-border rounded hover:bg-border text-sm text-text transition"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={!value.trim()}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-orange-600 disabled:opacity-50 text-sm transition"
            >
              {submitText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
