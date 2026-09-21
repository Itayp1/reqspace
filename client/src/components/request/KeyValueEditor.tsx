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

  return (
    <div className="w-full text-sm flex flex-col h-full">
      <div className="flex justify-end mb-2 shrink-0">
        <button 
          onClick={() => setIsBulkEdit(!isBulkEdit)}
          className="text-xs font-medium text-orange-500 hover:text-orange-600 dark:text-orange-400 dark:hover:text-orange-300 transition-colors"
        >
          {isBulkEdit ? 'Key-Value Edit' : 'Bulk Edit'}
        </button>
      </div>
      
      {isBulkEdit ? (
        <div className="flex-1 min-h-[200px] border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 p-1">
          <textarea
            value={bulkText}
            onChange={(e) => handleBulkChange(e.target.value)}
            className="w-full h-full p-2 outline-none resize-none font-mono text-sm bg-transparent text-gray-800 dark:text-gray-200"
            placeholder={`key:value\n// disabled-key:value`}
            spellCheck={false}
          />
        </div>
      ) : (
        <div className="flex flex-col flex-1">
          <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] border border-gray-300 dark:border-gray-700 rounded-t-md bg-gray-50 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 font-medium shrink-0">
            <div className="p-2 border-r border-gray-300 dark:border-gray-700 w-10 flex justify-center"></div>
            <div className="p-2 border-r border-gray-300 dark:border-gray-700">Key</div>
            <div className="p-2 border-r border-gray-300 dark:border-gray-700">Value</div>
            <div className="p-2 border-r border-gray-300 dark:border-gray-700">Description</div>
            <div className="p-2 w-10"></div>
          </div>
          
          <div className="border-x border-b border-gray-300 dark:border-gray-700 rounded-b-md bg-white dark:bg-gray-800 overflow-y-auto flex-1">
            {displayItems.map((item, i) => {
              const isLast = i === displayItems.length - 1;
              
              return (
                <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr_auto] border-b border-gray-200 dark:border-gray-700 group last:border-b-0 text-gray-800 dark:text-gray-200">
                  <div className="p-2 border-r border-gray-200 dark:border-gray-700 w-10 flex justify-center items-center">
                    {!isLast && (
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={(e) => updateItem(i, 'enabled', e.target.checked)}
                        className="w-4 h-4 cursor-pointer accent-orange-500"
                      />
                    )}
                  </div>
                  <div className="border-r border-gray-200 dark:border-gray-700 relative flex group/key">
                    <input
                      type="text"
                      placeholder="Key"
                      value={item.key}
                      onChange={(e) => updateItem(i, 'key', e.target.value)}
                      className="w-full p-2 outline-none bg-transparent placeholder-gray-400 dark:placeholder-gray-600"
                    />
                    {allowFiles && (
                      <select
                        value={item.type || 'text'}
                        onChange={(e) => updateItem(i, 'type', e.target.value)}
                        className="absolute right-1 top-1.5 text-[10px] bg-transparent text-gray-500 outline-none opacity-0 group-hover/key:opacity-100 focus:opacity-100"
                      >
                        <option value="text">Text</option>
                        <option value="file">File</option>
                      </select>
                    )}
                  </div>
                  <div className="border-r border-gray-200 dark:border-gray-700 flex items-center">
                    {item.type === 'file' ? (
                      <input
                        type="file"
                        className="w-full p-1 text-xs outline-none bg-transparent"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const newItems = [...items];
                            newItems[i] = { ...newItems[i], file };
                            onChange(newItems);
                          }
                        }}
                      />
                    ) : (
                      <VariableInput
                        placeholder="Value"
                        value={item.value}
                        onChange={(val) => updateItem(i, 'value', val)}
                        className="w-full h-full bg-transparent placeholder-gray-400 dark:placeholder-gray-600"
                        style={{ padding: '0.5rem' }}
                      />
                    )}
                  </div>
                  <div className="border-r border-gray-200 dark:border-gray-700">
                    <input
                      type="text"
                      placeholder="Description"
                      value={item.description || ''}
                      onChange={(e) => updateItem(i, 'description', e.target.value)}
                      className="w-full p-2 outline-none bg-transparent placeholder-gray-400 dark:placeholder-gray-600"
                    />
                  </div>
                  <div className="p-2 w-10 flex justify-center items-center">
                    {!isLast && (
                      <button 
                        onClick={() => deleteItem(i)}
                        className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={16} />
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
