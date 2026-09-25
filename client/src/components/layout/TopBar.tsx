import { useEffect, useState, useRef } from 'react';
import { Search, Eye, Settings, Cookie, Sun, Moon, SlidersHorizontal } from 'lucide-react';
import { useEnvironmentStore } from '../../store/environmentStore';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import api from '../../api/axios';
import { useRequestStore } from '../../store/requestStore';
import { CookieManagerModal } from '../common/CookieManagerModal';
// import { CaptureTrafficModal } from './CaptureTrafficModal';
import GlobalSettingsModal from '../common/GlobalSettingsModal';
import GlobalSearchModal from '../common/GlobalSearchModal';

export default function TopBar() {
  const { activeWorkspace } = useAuthStore();
  const { environments, activeEnvironmentId, setActiveEnvironmentId, setEnvironments, setGlobalEnvironment, fetchLocalVariables } = useEnvironmentStore();
  const { openEnvironmentTab } = useRequestStore();
  const [isCookieModalOpen, setIsCookieModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('reqspace_theme') as 'dark' | 'light') || 'dark';
  });
  const [isQuickLookOpen, setIsQuickLookOpen] = useState(false);
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
        // Optimistic local load
        db.environments.where('workspaceId').equals(activeWorkspace._id).toArray().then(localEnvs => {
          const globals = localEnvs.filter(e => e.isGlobal);
          const locals = localEnvs.filter(e => !e.isGlobal);
          if (globals.length > 0) setGlobalEnvironment(globals[0]);
          setEnvironments(locals);
        });

        // Background server fetch
        api.get(`/workspaces/${activeWorkspace._id}/environments`).then((res) => {
          const globals = res.data.filter((e: any) => e.isGlobal);
          const locals = res.data.filter((e: any) => !e.isGlobal);
          if (globals.length > 0) setGlobalEnvironment(globals[0]);
          setEnvironments(locals);
          db.environments.bulkPut(res.data.map((e: any) => ({ ...e, workspaceId: activeWorkspace._id })));
        });
        
        fetchLocalVariables(activeWorkspace._id);
      });
    }
  }, [activeWorkspace, setEnvironments, setGlobalEnvironment, fetchLocalVariables]);

  const { settings } = useSettingsStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const searchShortcut = settings.shortcuts?.search || 'ctrl+k';
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const shortcutMatch = searchShortcut.includes('ctrl') ? (isCtrlOrCmd && key === searchShortcut.split('+')[1]) : (key === searchShortcut);
      
      if (shortcutMatch) {
        e.preventDefault();
        setIsSearchModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [settings.shortcuts]);

  return (
    <>
      <div className="min-h-[3rem] py-2 border-b border-border bg-surface flex flex-wrap items-center justify-end px-4 gap-x-3 gap-y-2">
        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="p-1.5 hover:bg-border rounded text-text-muted hover:text-text transition-colors"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>

        {/* Cookies Manager Button */}
        <button
          onClick={() => setIsCookieModalOpen(true)}
          className="p-1.5 hover:bg-border rounded text-text-muted hover:text-text transition-colors flex items-center gap-1 text-xs"
          title="Manage Cookies"
        >
          <Cookie className="w-4 h-4 text-orange-400" />
          <span className="hidden sm:inline">Cookies</span>
        </button>

        <div className="h-4 w-px bg-border my-auto mx-1" />

        {/* Unified Environment Selector & Quick Look */}
        <div className="flex items-center gap-1 bg-surface border border-border rounded pl-2 relative" ref={eyeRef}>
          <span className="text-xs text-text-muted font-medium">Env:</span>
          <select
            data-testid="env-select"
            className="p-1 text-sm bg-transparent text-text max-w-[120px] truncate focus:outline-none cursor-pointer"
            value={activeEnvironmentId || ''}
            onChange={(e) => setActiveEnvironmentId(e.target.value || null)}
          >
            <option value="">No Environment</option>
            {environments.map((env) => (
              <option key={env._id} value={env._id}>{env.name}</option>
            ))}
          </select>

          <div className="h-4 w-px bg-border my-auto mx-1" />

          <button
            className="p-1.5 hover:bg-border rounded-r text-text-muted hover:text-text transition-colors flex items-center gap-1"
            title="Environment Quick Look & Edit"
            onClick={() => setIsQuickLookOpen(!isQuickLookOpen)}
          >
            <Eye className="w-4 h-4" />
          </button>

          {isQuickLookOpen && (() => {
            const activeEnv = environments.find(e => e._id === activeEnvironmentId);
            const { globalEnvironment } = useEnvironmentStore.getState();
            const activeVars = activeEnv?.variables.filter(v => v.enabled) || [];
            const globalVars = globalEnvironment?.variables.filter(v => v.enabled) || [];

            return (
              <div className="absolute right-0 top-full mt-2 z-50 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl text-xs">
                <div className="p-3 border-b border-gray-700 font-semibold text-gray-100 flex justify-between items-center">
                  <span>Environment Variables</span>
                  <button onClick={() => setIsQuickLookOpen(false)} className="text-gray-400 hover:text-white">✕</button>
                </div>
                
                <div className="max-h-64 overflow-y-auto">
                  {/* Active Environment Variables */}
                  <div className="p-3">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-gray-400 uppercase font-bold text-[10px] tracking-wider">{activeEnv?.name || 'No Active Environment'}</h4>
                      <button 
                        onClick={() => {
                          openEnvironmentTab(activeEnv?._id || 'global', activeEnv?.name || 'Globals (Common)');
                          setIsQuickLookOpen(false);
                        }}
                        className="text-orange-400 hover:text-orange-300 text-[10px] flex items-center gap-1"
                      >
                        <SlidersHorizontal className="w-3 h-3" /> Edit
                      </button>
                    </div>
                    {activeVars.length === 0 ? (
                      <div className="text-gray-500 italic">No variables</div>
                    ) : (
                      <div className="space-y-1.5">
                        {activeVars.map(v => (
                          <div key={v.key} className="flex justify-between items-center group">
                            <span className="text-gray-300 font-mono truncate w-1/3" title={v.key}>{v.key}</span>
                            <span className="text-green-400 font-mono truncate w-2/3 text-right" title={v.currentValue || v.initialValue}>{v.isSecret ? '••••••••' : (v.currentValue || v.initialValue)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Global Environment Variables */}
                  <div className="p-3 border-t border-gray-700">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-gray-400 uppercase font-bold text-[10px] tracking-wider">Globals</h4>
                      <button 
                        onClick={() => {
                          openEnvironmentTab('global', 'Globals (Common)');
                          setIsQuickLookOpen(false);
                        }}
                        className="text-blue-400 hover:text-blue-300 text-[10px] flex items-center gap-1"
                      >
                        <Settings className="w-3 h-3" /> Edit Globals
                      </button>
                    </div>
                    {globalVars.length === 0 ? (
                      <div className="text-gray-500 italic">No global variables</div>
                    ) : (
                      <div className="space-y-1.5">
                        {globalVars.map(v => (
                          <div key={v.key} className="flex justify-between items-center group">
                            <span className="text-gray-300 font-mono truncate w-1/3" title={v.key}>{v.key}</span>
                            <span className="text-blue-400 font-mono truncate w-2/3 text-right" title={v.currentValue || v.initialValue}>{v.isSecret ? '••••••••' : (v.currentValue || v.initialValue)}</span>
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

        <div className="h-4 w-px bg-border my-auto mx-1" />



        {/* Action Buttons */}
        <div className="flex items-center space-x-1">
          <button
            className="p-1.5 hover:bg-border rounded text-text-muted hover:text-text"
            title="Global Search (Ctrl+K)"
            onClick={() => setIsSearchModalOpen(true)}
          >
            <Search className="w-5 h-5" />
          </button>
          <button
            data-testid="settings-btn"
            className="p-1.5 hover:bg-border rounded text-text-muted hover:text-text"
            title="General Settings"
            onClick={() => setIsSettingsModalOpen(true)}
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      <CookieManagerModal isOpen={isCookieModalOpen} onClose={() => setIsCookieModalOpen(false)} />

      {isSettingsModalOpen && <GlobalSettingsModal onClose={() => setIsSettingsModalOpen(false)} />}
      {isSearchModalOpen && <GlobalSearchModal onClose={() => setIsSearchModalOpen(false)} />}
    </>
  );
}
