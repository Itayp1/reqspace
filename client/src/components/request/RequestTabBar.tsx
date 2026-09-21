import React, { useState, useEffect } from 'react';
import { useRequestStore } from '../../store/requestStore';
import { Plus, X, Settings } from 'lucide-react';

export const RequestTabBar: React.FC = () => {
  const { tabs, activeTabId, selectTab, closeTab, newTab, closeAllToRight, closeAllToLeft, closeOtherTabs } = useRequestStore();
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, tabId: string } | null>(null);

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const getMethodColor = (method?: string) => {
    switch (method?.toUpperCase()) {
      case 'GET': return 'text-green-500';
      case 'POST': return 'text-yellow-500';
      case 'PUT': return 'text-blue-400';
      case 'DELETE': return 'text-red-500';
      case 'PATCH': return 'text-purple-400';
      default: return 'text-gray-400';
    }
  };

  const handleClose = (e: React.MouseEvent, tab: any) => {
    e.stopPropagation();
    if (tab.isDirty) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to close this tab without saving?')) {
        return;
      }
    }
    closeTab(tab.tabId!);
  };

  return (
    <div className="flex items-center bg-gray-100 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 overflow-x-auto scrollbar-hide px-2 h-9 select-none relative">
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {tabs.map((tab) => {
          const isActive = tab.tabId === activeTabId;
          
          return (
            <div
              key={tab.tabId}
              onAuxClick={(e) => {
                 if (e.button === 1) handleClose(e, tab);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.tabId! });
              }}
              onClick={() => selectTab(tab.tabId!)}
              className={`group relative flex items-center gap-2 px-3 py-1 text-xs rounded-t cursor-pointer border-t-2 transition-colors max-w-[180px] shrink-0 ${
                isActive
                  ? 'bg-white dark:bg-gray-900 border-blue-500 text-gray-900 dark:text-gray-100 font-medium shadow-xs'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-gray-900/50'
              }`}
            >
              {tab.tabType === 'environment' ? (
                <Settings className="w-3 h-3 text-orange-500 shrink-0" />
              ) : (
                <span className={`text-[10px] font-bold ${getMethodColor(tab.method)} shrink-0`}>
                  {tab.method || 'GET'}
                </span>
              )}
              <span className="truncate flex-1 font-sans">{tab.name}</span>
              {tab.isConflicted && (
                <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="Conflicted with server version" />
              )}
              {tab.isDirty && !tab.isConflicted && (
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" title="Unsaved changes" />
              )}
              
              <div className="flex items-center">
                <button
                  onClick={(e) => handleClose(e, tab)}
                  className="opacity-50 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-opacity"
                  title="Close Tab"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          );
        })}

        <button
          onClick={newTab}
          className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-800 rounded transition-colors ml-1"
          title="New Request Tab"
        >
          <Plus size={14} />
        </button>
      </div>

      {contextMenu && (
        <div 
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg py-1 min-w-[160px] text-sm text-gray-700 dark:text-gray-200"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <div className="px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer" onClick={() => { closeTab(contextMenu.tabId); setContextMenu(null); }}>Close Tab</div>
          <div className="px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer" onClick={() => { closeOtherTabs(contextMenu.tabId); setContextMenu(null); }}>Close Other Tabs</div>
          <div className="px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer" onClick={() => { closeAllToRight(contextMenu.tabId); setContextMenu(null); }}>Close All to the Right</div>
          <div className="px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer" onClick={() => { closeAllToLeft(contextMenu.tabId); setContextMenu(null); }}>Close All to the Left</div>
        </div>
      )}
    </div>
  );
};

export default RequestTabBar;
