import { useState, useEffect, useRef } from 'react';
import api from '../../api/axios';
import { Search } from 'lucide-react';

interface User {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface Props {
  onSelect: (email: string) => void;
  value: string;
  onChange: (val: string) => void;
}

export function UserAutocomplete({ onSelect, value, onChange }: Props) {
  const [results, setResults] = useState<User[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search; the cleanup cancels the timer and aborts the in-flight
  // request so a slow earlier response can never overwrite a newer one.
  useEffect(() => {
    if (value.length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.get('/users/search?q=' + encodeURIComponent(value), { signal: controller.signal })
        .then(res => {
          setResults(res.data);
          setShowDropdown(true);
        })
        .catch(err => {
          if (!controller.signal.aborted) console.error(err);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative">
        <input
          data-testid="user-autocomplete-input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setShowDropdown(true);
          }}
          placeholder="Search user by name or email..."
          className="w-full pl-8 p-2 border border-border rounded bg-background text-sm focus:border-primary outline-none"
        />
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-text-muted" />
      </div>

      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-surface border border-border rounded shadow-lg max-h-60 overflow-y-auto">
          {results.map(user => (
            <div
              key={user._id}
              data-testid="user-autocomplete-result"
              className="p-2 flex items-center gap-2 hover:bg-background cursor-pointer"
              onClick={() => {
                onSelect(user.email);
                setShowDropdown(false);
              }}
            >
              <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                {user.name?.charAt(0).toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <div className="text-sm font-medium truncate">{user.name}</div>
                <div className="text-xs text-text-muted truncate">{user.email}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
