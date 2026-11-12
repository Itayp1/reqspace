import { useState, useRef, useEffect } from 'react';
import { Check } from 'lucide-react';

// Inline name field for tree rows: Enter saves, Esc cancels, blur saves when
// there is text and cancels when empty. Used for rename and for "new ..." rows.
export const InlineNameInput = ({
  value = '',
  onSave,
  onCancel,
  testId = 'inline-rename-input',
  label = 'Name',
  placeholder,
}: {
  value?: string;
  onSave: (name: string) => void;
  onCancel: () => void;
  testId?: string;
  label?: string;
  placeholder?: string;
}) => {
  const [val, setVal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  // Enter unmounts the input, which can also fire blur: save only once.
  const doneRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const finish = (save: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (save && val.trim()) onSave(val.trim()); else onCancel();
  };

  return (
    <div className="flex items-center gap-1 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
      <input
        ref={inputRef}
        data-testid={testId}
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="flex-1 bg-background text-text text-xs px-1 py-0.5 rounded border border-primary outline-none focus-visible:ring-1 focus-visible:ring-primary min-w-0"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); if (val.trim()) finish(true); }
          if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        }}
        onBlur={(e) => {
          if (e.relatedTarget && (e.relatedTarget as HTMLElement).dataset?.testid === 'prompt-submit') return;
          finish(true);
        }}
      />
      <button
        type="button"
        data-testid="prompt-submit"
        aria-label="Confirm"
        className="p-0.5 rounded text-primary hover:bg-border focus-visible:ring-1 focus-visible:ring-primary focus:outline-none shrink-0"
        onMouseDown={e => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          finish(true);
        }}
      >
        <Check size={14} />
      </button>
    </div>
  );
};
