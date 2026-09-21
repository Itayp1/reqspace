import { useEffect, useState, useRef } from 'react';
import { Search, Eye, Settings, Cookie, Sun, Moon, SlidersHorizontal, Radio } from 'lucide-react';
import { useEnvironmentStore } from '../../store/environmentStore';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import api from '../../api/axios';
import { useRequestStore } from '../../store/requestStore';
import { CookieManagerModal } from '../common/CookieManagerModal';
import { CaptureTrafficModal } from './CaptureTrafficModal';
import GlobalSettingsModal from '../common/GlobalSettingsModal';
import GlobalSearchModal from '../common/GlobalSearchModal';

export default function TopBar() {
  const { activeWorkspace } = useAuthStore();
  const { environments, activeEnvironmentId, setActiveEnvironmentId, setEnvironments, setGlobalEnvironment } = useEnvironmentStore();
  const { openEnvironmentTab } = useRequestStore();
  const [isCookieModalOpen, setIsCookieModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('postman_theme') as 'dark' | 'light') || 'dark';
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
    localStorage.setItem('postman_theme', theme);
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
      });
    }
  }, [activeWorkspace, setEnvironments, setGlobalEnvironment]);

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
      <div className="h-12 border-b border-border bg-surface flex items-center justify-end px-4 gap-3">
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

        <div className="flex items-center gap-2">
          <select
            className="p-1 text-sm border border-border rounded bg-background text-text max-w-[150px] truncate"
            value={activeEnvironmentId || ''}
            onChange={(e) => setActiveEnvironmentId(e.target.value || null)}
          >
            <option value="">No Environment</option>
            {environments.map((env) => (
              <option key={env._id} value={env._id}>{env.name}</option>
            ))}
          </select>

          {/* Manage Environments Button */}
          <button
            className="p-1 hover:bg-border rounded text-text-muted hover:text-text transition-colors"
            title="Manage Environments"
            onClick={() => {
              const env = environments.find(e => e._id === activeEnvironmentId);
              openEnvironmentTab(activeEnvironmentId || 'global', env?.name || 'Globals (Common)');
            }}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-border my-auto mx-1" />

          {/* Capture Traffic Button */}
          <button
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-orange-500/10 text-orange-500 border border-orange-500/20 rounded hover:bg-orange-500/20 transition-colors"
            onClick={() => setIsCaptureModalOpen(true)}
          >
            <Radio size={14} className="animate-pulse" />
            Capture Traffic
          </button>

          <button
            className="p-1 hover:bg-border rounded text-text-muted hover:text-text ml-1"
            title="Manage Cookies"
            onClick={() => setIsCookieModalOpen(true)}
          >
            <Cookie className="w-4 h-4" />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          {/* Quick Look Eye */}
          <div className="relative" ref={eyeRef}>
            <button
              className="p-1 hover:bg-border rounded text-text-muted hover:text-text"
              title="Environment Quick Look"
              onClick={() => setIsQuickLookOpen(!isQuickLookOpen)}
            >
              <Eye className="w-5 h-5" />
            </button>

            {isQuickLookOpen && (() => {
              const activeEnv = environments.find(e => e._id === activeEnvironmentId);
              const { globalEnvironment } = useEnvironmentStore.getState();
              const activeVars = activeEnv?.variables.filter(v => v.enabled) || [];
              const globalVars = globalEnvironment?.variables.filter(v => v.enabled) || [];

              return (
                <div className="absolute right-0 top-full mt-2 z-50 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl text-xs">
                  <div className="p-3 border-b border-gray-700 font-semibold text-gray-100 flex justify-between items-center">
                    <span>Environment Quick Look</span>
                    <button onClick={() => setIsQuickLookOpen(false)} className="text-gray-400 hover:text-white">✕</button>
                  </div>
                  
                  <div className="max-h-64 overflow-y-auto">
                    {/* Active Environment Variables */}
                    <div className="p-3">
                      <h4 className="text-gray-400 uppercase font-bold mb-2 text-[10px] tracking-wider">{activeEnv?.name || 'No Active Environment'}</h4>
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
                      <h4 className="text-gray-400 uppercase font-bold mb-2 text-[10px] tracking-wider">Globals</h4>
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

                  <div className="p-2 border-t border-gray-700 text-right">
                    <button
                      onClick={() => { 
                        const env = environments.find(e => e._id === activeEnvironmentId);
                        openEnvironmentTab(activeEnvironmentId || 'global', env?.name || 'Globals (Common)'); 
                        setIsQuickLookOpen(false); 
                      }}
                      className="text-xs text-orange-400 hover:text-orange-300"
                    >
                      Manage Environments →
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>

          <button
            className="p-1 hover:bg-border rounded text-text-muted hover:text-text"
            title="Global Search (Ctrl+K)"
            onClick={() => setIsSearchModalOpen(true)}
          >
            <Search className="w-5 h-5" />
          </button>
          <button
            className="p-1 hover:bg-border rounded text-text-muted hover:text-text"
            title="General Settings"
            onClick={() => setIsSettingsModalOpen(true)}
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      <CookieManagerModal isOpen={isCookieModalOpen} onClose={() => setIsCookieModalOpen(false)} />
      {isCaptureModalOpen && <CaptureTrafficModal onClose={() => setIsCaptureModalOpen(false)} />}
      {isSettingsModalOpen && <GlobalSettingsModal onClose={() => setIsSettingsModalOpen(false)} />}
      {isSearchModalOpen && <GlobalSearchModal onClose={() => setIsSearchModalOpen(false)} />}
    </>
  );
}
