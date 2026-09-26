import React, { useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useRequestStore } from '../../store/requestStore';
import { Plus, X, Settings } from 'lucide-react';

export const RequestTabBar: React.FC = () => {
  // Selector + shallow compare: this bar only needs the tab list/active id
  // and stable action refs — without this it re-renders on every keystroke
  // typed anywhere in the request editor (URL, headers, body, scripts...),
  // since those all flow through the same store's activeRequest/tabs fields.
  const { tabs, activeTabId, selectTab, closeTab, newTab, closeAllToRight, closeAllToLeft, closeOtherTabs, reorderTabs } = useRequestStore(
    useShallow((state) => ({
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      selectTab: state.selectTab,
      closeTab: state.closeTab,
      newTab: state.newTab,
      closeAllToRight: state.closeAllToRight,
      closeAllToLeft: state.closeAllToLeft,
      closeOtherTabs: state.closeOtherTabs,
      reorderTabs: state.reorderTabs,
    }))
  );
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, tabId: string } | null>(null);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<{ id: string, pos: 'before'|'after' } | null>(null);

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

  
  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    e.dataTransfer.setData('text/plain', tabId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedTabId(tabId);
  };

  const handleDragOver = (e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    if (tabId === draggedTabId) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pos = x < rect.width / 2 ? 'before' : 'after';
    
    setDragOverTabId({ id: tabId, pos });
  };

  const handleDragLeave = () => {
    setDragOverTabId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedTabId || draggedTabId === targetId || !dragOverTabId) {
      setDraggedTabId(null);
      setDragOverTabId(null);
      return;
    }
    
    reorderTabs(draggedTabId, targetId, dragOverTabId.pos);
    setDraggedTabId(null);
    setDragOverTabId(null);
  };

  const handleClose = async (e: React.MouseEvent, tab: any) => {
    e.stopPropagation();
    if (tab.isDirty) {
      const { customConfirm } = await import('../../utils/dialog');
      if (!(await customConfirm('Unsaved Changes', 'You have unsaved changes. Are you sure you want to close this tab without saving?', 'Close anyway'))) {
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
              data-testid={`tab-${tab.tabId}`}
              draggable
              onDragStart={(e) => handleDragStart(e, tab.tabId!)}
                onDragOver={(e) => handleDragOver(e, tab.tabId!)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, tab.tabId!)}
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
                <div data-testid="conflict-indicator" className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="Conflicted with server version" />
              )}
              {tab.isDirty && !tab.isConflicted && (
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" title="Unsaved changes" />
              )}
              
              <div className="flex items-center">
                <button
                  data-testid="close-tab-btn"
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
          data-testid="new-tab-btn"
          onClick={newTab}
          className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-800 rounded transition-colors ml-1"
          title="New Request Tab"
        >
          <Plus size={14} />
        </button>
        <button
          data-testid="new-connection-btn"
          onClick={useRequestStore.getState().newConnectionTab}
          className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-800 rounded transition-colors ml-1 text-xs"
          title="New Connection Tab"
        >
          +Conn
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
