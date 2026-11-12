import { useState, useEffect } from 'react';
import type { KeyValueItem } from '../../store/requestStore';
import { Trash2 } from 'lucide-react';
import { VariableInput } from '../common/VariableInput';

interface KeyValueEditorProps {
  items: KeyValueItem[];
  onChange: (items: KeyValueItem[]) => void;
  allowFiles?: boolean;
}

export function KeyValueEditor({ items = [], onChange, allowFiles = false }: KeyValueEditorProps) {
  const [isBulkEdit, setIsBulkEdit] = useState(false);
  const [bulkText, setBulkText] = useState('');

  // Sync bulk text when switching to bulk mode
  useEffect(() => {
    if (isBulkEdit) {
      const text = items
        .filter(i => i.key || i.value)
        .map(i => `${i.enabled ? '' : '// '}${i.key}:${i.value}`)
        .join('\n');
      setBulkText(text);
    }
  }, [isBulkEdit, items]);

  const handleBulkChange = (text: string) => {
    setBulkText(text);
    const lines = text.split('\n');
    const newItems = lines
      .map((line): KeyValueItem | null => {
        if (!line.trim()) return null;
        
        const isCommented = line.trimStart().startsWith('//');
        const contentLine = isCommented ? line.replace(/^\s*\/\/\s*/, '') : line;
        
        const colonIdx = contentLine.indexOf(':');
        if (colonIdx !== -1) {
          return {
            enabled: !isCommented,
            key: contentLine.slice(0, colonIdx).trim(),
            value: contentLine.slice(colonIdx + 1).trim()
          };
        } else {
          return {
            enabled: !isCommented,
            key: contentLine.trim(),
            value: ''
          };
        }
      })
      .filter((i): i is KeyValueItem => i !== null);
      
    onChange(newItems);
  };

  // Ensure there's always one empty row at the end for adding new items
  const displayItems = [...items];
  const lastItem = displayItems[displayItems.length - 1];
  
  if (!isBulkEdit && (!lastItem || (lastItem.key !== '' || lastItem.value !== ''))) {
    displayItems.push({ key: '', value: '', description: '', enabled: false });
  }

  const updateItem = (index: number, field: keyof KeyValueItem, value: any) => {
    const newItems = [...displayItems];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // Auto-enable if key/value is typed and it was disabled (but only if it's not the empty row being initialized)
    if ((field === 'key' || field === 'value') && !newItems[index].enabled && value !== '') {
        newItems[index].enabled = true;
    }

    // Filter out completely empty trailing rows from the saved state, 
    // but we pass the actual items up to keep them in sync.
    const toSave = newItems.filter((item, i) => i !== newItems.length - 1 || item.key !== '' || item.value !== '');
    onChange(toSave);
  };

  const deleteItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    onChange(newItems);
  };

  const cell = 'border-r border-border';
  const field = 'w-full p-2 bg-transparent text-text placeholder:text-text-muted/60 focus-visible:bg-surface';

  return (
    <div className="w-full text-sm flex flex-col h-full min-h-[160px]">
      <div className="flex justify-end mb-2 shrink-0">
        <button
          type="button"
          onClick={() => setIsBulkEdit(!isBulkEdit)}
          className="text-xs font-medium text-primary hover:underline rounded"
        >
          {isBulkEdit ? 'Key-Value Edit' : 'Bulk Edit'}
        </button>
      </div>

      {isBulkEdit ? (
        <div className="flex-1 min-h-[160px] border border-border rounded-md bg-background p-1 focus-within:border-primary">
          <textarea
            aria-label="Bulk edit, one key:value per line"
            value={bulkText}
            onChange={(e) => handleBulkChange(e.target.value)}
            className="w-full h-full p-2 outline-none resize-none font-mono text-sm bg-transparent text-text"
            placeholder={`key:value
// disabled-key:value`}
            spellCheck={false}
          />
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0 border border-border rounded-md overflow-hidden">
          <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr_2.5rem] border-b border-border bg-surface text-text-muted text-xs font-medium shrink-0">
            <div className={`${cell} p-2`}></div>
            <div className={`${cell} p-2`}>Key</div>
            <div className={`${cell} p-2`}>Value</div>
            <div className={`${cell} p-2`}>Description</div>
            <div className="p-2"></div>
          </div>

          <div className="bg-background overflow-y-auto flex-1">
            {displayItems.map((item, i) => {
              const isLast = i === displayItems.length - 1;
              const rowName = item.key || `row ${i + 1}`;

              return (
                <div key={i} className={`grid grid-cols-[2.5rem_1fr_1fr_1fr_2.5rem] border-b border-border last:border-b-0 group text-text ${!isLast && !item.enabled ? 'opacity-50' : ''}`}>
                  <div className={`${cell} p-2 flex justify-center items-center`}>
                    {!isLast && (
                      <input
                        type="checkbox"
                        aria-label={`Enable ${rowName}`}
                        checked={item.enabled}
                        onChange={(e) => updateItem(i, 'enabled', e.target.checked)}
                        className="w-4 h-4 cursor-pointer accent-primary"
                      />
                    )}
                  </div>
                  <div className={`${cell} relative flex group/key`}>
                    <input
                      type="text"
                      data-testid={`kv-key-${i}`}
                      aria-label={`Key, row ${i + 1}`}
                      placeholder="Key"
                      autoComplete="off"
                      spellCheck={false}
                      value={item.key}
                      onChange={(e) => updateItem(i, 'key', e.target.value)}
                      className={`${field} font-mono text-xs`}
                    />
                    {allowFiles && (
                      <select
                        aria-label={`Type, row ${i + 1}`}
                        value={item.type || 'text'}
                        onChange={(e) => updateItem(i, 'type', e.target.value)}
                        className="absolute right-1 top-1.5 text-[10px] bg-surface text-text-muted rounded opacity-0 group-hover/key:opacity-100 focus-visible:opacity-100"
                      >
                        <option value="text">Text</option>
                        <option value="file">File</option>
                      </select>
                    )}
                  </div>
                  <div className={`${cell} flex items-center`}>
                    {item.type === 'file' ? (
                      <div className="w-full flex flex-col">
                        <input
                          type="file"
                          aria-label={`File, row ${i + 1}`}
                          className="w-full p-1 text-xs bg-transparent"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const newItems = [...items];
                              // The File object itself is not persisted; keep its name in `value`.
                              newItems[i] = { ...newItems[i], file, value: file.name };
                              onChange(newItems);
                            }
                          }}
                        />
                        {!item.file && item.value && (
                          <span data-testid={`kv-file-missing-${i}`} className="px-1 pb-1 text-[10px] text-amber-600 dark:text-amber-400" title="File contents are not saved with the request">
                            {item.value} - not saved, re-select the file before sending
                          </span>
                        )}
                      </div>
                    ) : (
                      <VariableInput
                        data-testid={`kv-val-${i}`}
                        aria-label={`Value, row ${i + 1}`}
                        placeholder="Value"
                        value={item.value}
                        onChange={(val) => updateItem(i, 'value', val)}
                        className="w-full h-full bg-transparent placeholder:text-text-muted/60"
                        style={{ padding: '0.5rem' }}
                      />
                    )}
                  </div>
                  <div className={cell}>
                    <input
                      type="text"
                      aria-label={`Description, row ${i + 1}`}
                      placeholder="Description"
                      autoComplete="off"
                      value={item.description || ''}
                      onChange={(e) => updateItem(i, 'description', e.target.value)}
                      className={`${field} text-text-muted`}
                    />
                  </div>
                  <div className="p-2 flex justify-center items-center">
                    {!isLast && (
                      <button
                        type="button"
                        aria-label={`Delete ${rowName}`}
                        title="Delete"
                        onClick={() => deleteItem(i)}
                        className="text-text-muted hover:text-delete opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
