import React, { useState, useRef } from 'react';
import { useEnvironmentStore } from '../../store/environmentStore';

interface VariableInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (val: string) => void;
  onEnter?: () => void;
  // Single line while idle; while focused, wraps into a two-line box so long values are fully visible.
  multilineOnFocus?: boolean;
  style?: React.CSSProperties;
}

export const VariableInput: React.FC<VariableInputProps> = ({ value, onChange, onEnter, multilineOnFocus, className, style, ...props }) => {
  const { environments, activeEnvironmentId, globalEnvironment } = useEnvironmentStore();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [varFilter, setVarFilter] = useState('');
  const [cursorPos, setCursorPos] = useState<number>(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<any>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // The visible text is the overlay; the real <input> text is transparent. When a
  // long value scrolls inside the input, the overlay has to follow or it looks stuck.
  const syncScroll = () => {
    if (inputRef.current && overlayRef.current) {
      overlayRef.current.scrollLeft = inputRef.current.scrollLeft;
      overlayRef.current.scrollTop = inputRef.current.scrollTop;
    }
  };
  const syncScrollSoon = () => requestAnimationFrame(syncScroll);

  const activeEnv = environments.find(e => e._id === activeEnvironmentId);
  const allVars = [
    ...(globalEnvironment?.variables || []),
    ...(activeEnv?.variables || [])
  ].filter(v => v.enabled);

  // Parse text to highlight {{var}}
  const renderHighlighted = () => {
    const parts = value.split(/(\{\{[^{}]+\}\})/g);
    return parts.map((part, i) => {
      if (part.startsWith('{{') && part.endsWith('}}')) {
        const varName = part.slice(2, -2);
        const exists = allVars.some(v => v.key === varName) || ['guid', 'timestamp', 'randomInt'].some(v => v === varName);
        return (
          <span key={i} className={exists ? "text-orange-500" : "text-red-500"}>
            {part}
          </span>
        );
      }
      return <span key={i} className="text-gray-900 dark:text-gray-100">{part}</span>;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<any>) => {
    if (e.key === 'Escape') {
      setShowSuggestions(false);
      return;
    }
    if (e.key === 'Enter') {
      if (multilineOnFocus) e.preventDefault();
      if (showSuggestions) {
        e.preventDefault();
      } else if (onEnter) {
        onEnter();
      }
    }
    if (props.onKeyDown) props.onKeyDown(e);
  };

  const handleChange = (e: React.ChangeEvent<any>) => {
    const val = multilineOnFocus ? e.target.value.replace(/[
]+/g, '') : e.target.value;
    onChange(val);
    syncScrollSoon();

    const cursor = e.target.selectionStart || 0;
    setCursorPos(cursor);
    const beforeCursor = val.slice(0, cursor);
    const match = beforeCursor.match(/\{\{([^{}]*)$/);
    if (match) {
      setShowSuggestions(true);
      setVarFilter(match[1]);
    } else {
      setShowSuggestions(false);
    }
  };

  const insertVariable = (varKey: string) => {
    if (!inputRef.current) return;
    const val = value;
    const match = val.slice(0, cursorPos).match(/\{\{([^{}]*)$/);
    if (match) {
      const start = cursorPos - match[0].length;
      const newVal = val.slice(0, start) + `{{${varKey}}}` + val.slice(cursorPos);
      onChange(newVal);
      setShowSuggestions(false);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const newCursor = start + varKey.length + 4;
          inputRef.current.setSelectionRange(newCursor, newCursor);
        }
      }, 0);
    }
  };

  const filteredVars = Array.from(new Set(allVars.map(v => v.key)))
    .filter(k => k.toLowerCase().includes(varFilter.toLowerCase()));

  // Determine if caret is inside a variable to show its value
  let activeVarVal = null;
  let activeVarName = null;
  const beforeCursor = value.slice(0, cursorPos);
  const afterCursor = value.slice(cursorPos);
  const openMatch = beforeCursor.match(/\{\{([^{}]*)$/);
  const closeMatch = afterCursor.match(/^([^{}]*)\}\}/);
  if (openMatch && closeMatch && !showSuggestions) {
    const varName = openMatch[1] + closeMatch[1];
    const foundVar = allVars.find(v => v.key === varName);
    if (foundVar) {
      activeVarName = varName;
      activeVarVal = foundVar.currentValue || foundVar.initialValue || '';
    }
  }

  const wrapped = !!multilineOnFocus && focused;
  const Field: any = multilineOnFocus ? 'textarea' : 'input';

  return (
    <div className={`relative flex items-center ${className || ''}`} style={style}>
      <div 
        ref={overlayRef}
        className={`absolute inset-0 px-4 py-2 pointer-events-none font-sans text-sm overflow-hidden ${multilineOnFocus ? 'leading-5' : ''} ${wrapped ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}
        style={{ padding: style?.padding, paddingLeft: style?.paddingLeft, paddingRight: style?.paddingRight, paddingTop: style?.paddingTop, paddingBottom: style?.paddingBottom }}
      >
        {renderHighlighted()}
      </div>
      
      <Field
        ref={inputRef}
        {...(multilineOnFocus ? { rows: wrapped ? 2 : 1, wrap: wrapped ? 'soft' : 'off' } : { type: 'text' })}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={(e) => { setCursorPos(e.currentTarget.selectionStart || 0); syncScrollSoon(); }}
        onKeyUp={(e) => { setCursorPos(e.currentTarget.selectionStart || 0); syncScrollSoon(); }}
        onScroll={syncScroll}
        onSelect={syncScrollSoon}
        onFocus={() => { setFocused(true); syncScrollSoon(); }}
        onBlur={() => { setFocused(false); syncScrollSoon(); }}
        className={`relative z-10 bg-transparent text-transparent caret-gray-900 dark:caret-gray-100 outline-none w-full px-4 py-2 text-sm font-sans placeholder-gray-400 dark:placeholder-gray-600 focus:placeholder-transparent ${multilineOnFocus ? 'resize-none leading-5 block' : ''} ${wrapped ? 'break-all' : ''}`}
        {...props}
        style={{ ...style }}
      />

      {activeVarVal !== null && activeVarName !== null && (
        <div className="absolute left-0 bottom-full mb-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl px-3 py-2 text-xs font-mono max-w-sm break-all flex flex-col gap-1">
          <div className="text-[10px] uppercase font-semibold text-gray-400">Value of {activeVarName}</div>
          <div className="text-gray-100">{activeVarVal}</div>
          <button 
            className="text-[10px] text-blue-400 hover:text-blue-300 self-start mt-1 cursor-pointer"
            onClick={(e) => { e.preventDefault(); navigator.clipboard.writeText(activeVarVal as string); }}
            onMouseDown={(e) => e.preventDefault()}
          >
            Copy to clipboard
          </button>
        </div>
      )}

      {showSuggestions && filteredVars.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-64 max-h-52 overflow-y-auto py-1 text-xs select-none font-sans">
          <div className="px-2.5 py-1 text-[10px] uppercase font-semibold text-gray-400 bg-gray-800/80">
            Environment Variables
          </div>
          {filteredVars.map(v => (
            <div
              key={v}
              onMouseDown={(e) => { e.preventDefault(); insertVariable(v); }}
              className="px-3 py-1.5 hover:bg-gray-800 cursor-pointer flex items-center justify-between text-orange-400 hover:text-orange-300 font-mono"
            >
              <span>{`{{${v}}}`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
