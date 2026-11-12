import { useEffect, useState, useRef } from 'react';
import { Search, Eye, EyeOff, X, Settings, Cookie, Sun, Moon, SlidersHorizontal } from 'lucide-react';
import { matchesShortcut } from '../../utils/shortcuts';
import { useEnvironmentStore } from '../../store/environmentStore';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import api from '../../api/axios';
import { useRequestStore } from '../../store/requestStore';
import { CookieManagerModal } from '../common/CookieManagerModal';

import GlobalSettingsModal from '../common/GlobalSettingsModal';
import GlobalSearchModal from '../common/GlobalSearchModal';

export default function TopBar() {
  const { activeWorkspace } = useAuthStore();
  const { environments, activeEnvironmentId, setActiveEnvironmentId, setEnvironments, setGlobalEnvironment, fetchUserProfileVariables, restoreActiveEnvironment } = useEnvironmentStore();
  const { openEnvironmentTab } = useRequestStore();
  const [isCookieModalOpen, setIsCookieModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('reqspace_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    // First visit: follow the OS/browser preference (P5.2).
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });
  const [isQuickLookOpen, setIsQuickLookOpen] = useState(false);
  const [revealSecrets, setRevealSecrets] = useState(false);
  const eyeRef = useRef<HTMLDivElement>(null);

  // Close Quick Look on outside click
  useEffect(() => {
    if (!isQuickLookOpen) return;
    const handler = (e: MouseEvent) => {
      if (eyeRef.current && !eyeRef.current.contains(e.target as Node)) {
        setIsQuickLookOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isQuickLookOpen]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('reqspace_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    if (activeWorkspace) {
      import('../../db').then(({ db }) => {
        // The local read and the server fetch race; once the server has
        // answered, a late local read must not overwrite its fresher list.
        let serverAnswered = false;

        // Optimistic local load
        db.environments.where('workspaceId').equals(activeWorkspace._id).toArray().then(localEnvs => {
          if (serverAnswered) return;
          const globals = localEnvs.filter(e => e.isGlobal);
          const locals = localEnvs.filter(e => !e.isGlobal);
          if (globals.length > 0) setGlobalEnvironment(globals[0]);
          setEnvironments(locals);
        });

        // Background server fetch. The global ("Globals (Common)") env lives
        // in its own table/endpoint, not mixed into the regular list.
        api.get(`/workspaces/${activeWorkspace._id}/environments`).then((res) => {
          serverAnswered = true;
          setEnvironments(res.data);
          restoreActiveEnvironment(activeWorkspace._id, res.data);
          db.environments.bulkPut(res.data.map((e: any) => ({ ...e, workspaceId: activeWorkspace._id })));
        }).catch((err) => console.error('Failed to load environments', err));
        api.get(`/workspaces/${activeWorkspace._id}/global-environment`).then((res) => {
          const global = { ...res.data, isGlobal: true };
          setGlobalEnvironment(global);
          db.environments.put({ ...global, workspaceId: activeWorkspace._id });
        }).catch(() => {});

        fetchUserProfileVariables();
      });
    }
  }, [activeWorkspace, setEnvironments, setGlobalEnvironment, fetchUserProfileVariables, restoreActiveEnvironment]);

  const { settings } = useSettingsStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const searchShortcut = settings.shortcuts?.search || 'ctrl+k';
      if (matchesShortcut(e, searchShortcut)) {
        e.preventDefault();
        setIsSearchModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [settings.shortcuts]);

  return (
    <>
      <header className="min-h-[3rem] py-2 border-b border-border bg-surface flex flex-wrap items-center justify-end px-4 gap-x-3 gap-y-2" aria-label="Application toolbar">
        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="p-1.5 hover:bg-border rounded text-text-muted hover:text-text transition-colors"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" /> : <Moon className="w-4 h-4 text-slate-600" aria-hidden="true" />}
        </button>

        {/* Cookies Manager Button */}
        <button
          onClick={() => setIsCookieModalOpen(true)}
          className="p-1.5 hover:bg-border rounded text-text-muted hover:text-text transition-colors flex items-center gap-1 text-xs"
          title="Manage Cookies"
          aria-label="Manage cookies"
        >
          <Cookie className="w-4 h-4 text-primary" aria-hidden="true" />
          <span className="hidden sm:inline" aria-hidden="true">Cookies</span>
        </button>

        <div className="h-4 w-px bg-border my-auto mx-1" aria-hidden="true" />

        {/* Unified Environment Selector & Quick Look */}
        <div className="flex items-center gap-1 bg-surface border border-border rounded pl-2 relative" ref={eyeRef}>
          <label htmlFor="env-select" className="text-xs text-text-muted font-medium">Env:</label>
          <select
            id="env-select"
            data-testid="env-select"
            style={{ colorScheme: theme }}
            className="p-1 text-sm bg-transparent text-text max-w-[120px] truncate focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded cursor-pointer"
            value={activeEnvironmentId || ''}
            onChange={(e) => setActiveEnvironmentId(e.target.value || null)}
            aria-label="Active environment"
          >
            <option value="">No Environment</option>
            {environments.map((env) => (
              <option key={env._id} value={env._id}>{env.name}</option>
            ))}
          </select>

          <div className="h-4 w-px bg-border my-auto mx-1" aria-hidden="true" />

          <button
            className="p-1.5 hover:bg-border rounded-r text-text-muted hover:text-text transition-colors flex items-center gap-1"
            title="Environment Quick Look & Edit"
            aria-label="Environment quick look and edit"
            aria-expanded={isQuickLookOpen}
            aria-haspopup="dialog"
            onClick={() => setIsQuickLookOpen(!isQuickLookOpen)}
          >
            <Eye className="w-4 h-4" aria-hidden="true" />
          </button>

          {isQuickLookOpen && (() => {
            const activeEnv = environments.find(e => e._id === activeEnvironmentId);
            const { globalEnvironment } = useEnvironmentStore.getState();
            const activeVars = activeEnv?.variables.filter(v => v.enabled) || [];
            const globalVars = globalEnvironment?.variables.filter(v => v.enabled) || [];
            const shown = (v: { isSecret?: boolean; currentValue?: string; initialValue?: string }) =>
              v.isSecret && !revealSecrets ? '••••••••' : (v.currentValue || v.initialValue);
            const anySecret = [...activeVars, ...globalVars].some(v => v.isSecret);

            return (
              <div
                className="absolute right-0 top-full mt-2 z-50 w-80 bg-background border border-border rounded-lg shadow-2xl text-xs"
                role="dialog"
                aria-label="Environment variables quick look"
                aria-modal="false"
              >
                <div className="p-3 border-b border-border font-semibold text-text flex justify-between items-center">
                  <span>Environment Variables</span>
                  <div className="flex items-center gap-1">
                    {anySecret && (
                      <button
                        onClick={() => setRevealSecrets(r => !r)}
                        className="p-0.5 text-text-muted hover:text-text"
                        title={revealSecrets ? 'Hide secret values' : 'Show secret values'}
                        aria-label={revealSecrets ? 'Hide secret values' : 'Show secret values'}
                        aria-pressed={revealSecrets}
                      >
                        {revealSecrets ? <EyeOff className="w-3.5 h-3.5" aria-hidden="true" /> : <Eye className="w-3.5 h-3.5" aria-hidden="true" />}
                      </button>
                    )}
                    <button onClick={() => setIsQuickLookOpen(false)} className="p-0.5 text-text-muted hover:text-text" aria-label="Close environment quick look">
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto">
                  {/* Active Environment Variables */}
                  <div className="p-3">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-text-muted uppercase font-bold text-[10px] tracking-wider truncate">{activeEnv?.name || 'No Active Environment'}</h4>
                      <button
                        onClick={() => {
                          openEnvironmentTab(activeEnv?._id || 'global', activeEnv?.name || 'Globals (Common)');
                          setIsQuickLookOpen(false);
                        }}
                        className="text-primary hover:underline text-[10px] flex items-center gap-1"
                        aria-label={`Edit ${activeEnv?.name || 'environment'} variables`}
                      >
                        <SlidersHorizontal className="w-3 h-3" aria-hidden="true" /> Edit
                      </button>
                    </div>
                    {activeVars.length === 0 ? (
                      <div className="text-text-muted italic">No variables</div>
                    ) : (
                      <div className="space-y-1.5">
                        {activeVars.map(v => (
                          <div key={v.key} className="flex justify-between items-center gap-2 group">
                            <span className="text-text-muted font-mono truncate w-1/3" title={v.key}>{v.key}</span>
                            <span className="text-text font-mono truncate w-2/3 text-right" title={v.isSecret && !revealSecrets ? 'Secret value hidden' : (v.currentValue || v.initialValue)}>{shown(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Global Environment Variables */}
                  <div className="p-3 border-t border-border">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-text-muted uppercase font-bold text-[10px] tracking-wider">Globals</h4>
                      <button
                        onClick={() => {
                          openEnvironmentTab('global', 'Globals (Common)');
                          setIsQuickLookOpen(false);
                        }}
                        className="text-primary hover:underline text-[10px] flex items-center gap-1"
                        aria-label="Edit global variables"
                      >
                        <Settings className="w-3 h-3" aria-hidden="true" /> Edit Globals
                      </button>
                    </div>
                    {globalVars.length === 0 ? (
                      <div className="text-text-muted italic">No global variables</div>
                    ) : (
                      <div className="space-y-1.5">
                        {globalVars.map(v => (
                          <div key={v.key} className="flex justify-between items-center gap-2 group">
                            <span className="text-text-muted font-mono truncate w-1/3" title={v.key}>{v.key}</span>
                            <span className="text-text font-mono truncate w-2/3 text-right" title={v.isSecret && !revealSecrets ? 'Secret value hidden' : (v.currentValue || v.initialValue)}>{shown(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        <div className="h-4 w-px bg-border my-auto mx-1" aria-hidden="true" />



        {/* Action Buttons */}
        <div className="flex items-center space-x-1">
          <button
            className="p-1.5 hover:bg-border rounded text-text-muted hover:text-text"
            title="Global Search (Ctrl+K)"
            aria-label="Global search (Ctrl+K)"
            aria-keyshortcuts="Control+K"
            onClick={() => setIsSearchModalOpen(true)}
          >
            <Search className="w-5 h-5" aria-hidden="true" />
          </button>
          <button
            data-testid="settings-btn"
            className="p-1.5 hover:bg-border rounded text-text-muted hover:text-text"
            title="General Settings"
            aria-label="Open general settings"
            onClick={() => setIsSettingsModalOpen(true)}
          >
            <Settings className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </header>
      
      <CookieManagerModal isOpen={isCookieModalOpen} onClose={() => setIsCookieModalOpen(false)} />

      {isSettingsModalOpen && <GlobalSettingsModal onClose={() => setIsSettingsModalOpen(false)} />}
      {isSearchModalOpen && <GlobalSearchModal onClose={() => setIsSearchModalOpen(false)} />}
    </>
  );
}
