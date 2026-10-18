import React, { useState, useRef, useEffect, useMemo, useCallback, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useCollectionStore } from '../../store/collectionStore';
import type { Collection, Folder, ApiRequest } from '../../store/collectionStore';
import { useRequestStore } from '../../store/requestStore';
import type { ActiveRequest } from '../../store/requestStore';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import { PromptModal } from '../common/PromptModal';
import { ConfirmModal } from '../common/ConfirmModal';
import { MoveRequestModal } from '../request/MoveRequestModal';
import { CollectionRunnerModal } from './CollectionRunnerModal';
import { GroupEditModal } from './GroupEditModal';
import { CopyToWorkspaceModal } from './CopyToWorkspaceModal';
import { DocumentationModal } from './DocumentationModal';
import { ShareLinkModal } from './ShareLinkModal';
import { ForkModal } from './ForkModal';
import { useContextMenu } from '../common/ContextMenuProvider';
import {
  ChevronDown, ChevronRight, Folder as FolderIcon, MoreVertical, Plus, FilePlus, Search, X, AlertTriangle
} from 'lucide-react';

// ג”€ג”€ Shared Types ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

interface PromptConfig {
  isOpen: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  onSubmit: (val: string) => void;
}

interface ConfirmConfig {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

interface MoveConfig {
  isOpen: boolean;
  requestId: string;
  requestName: string;
}

// ג”€ג”€ Action Menu ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

const ActionMenu = ({
  options,
}: {
  options: { label: string; onClick: () => void; danger?: boolean }[];
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        // Return focus to trigger button
        (menuRef.current?.querySelector('[data-testid="action-menu-btn"]') as HTMLElement)?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <div className="relative flex items-center" ref={menuRef} onClick={(e) => e.stopPropagation()}>
      <button
        data-testid="action-menu-btn"
        className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white cursor-pointer"
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        aria-label="Item actions"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <MoreVertical size={14} aria-hidden="true" />
      </button>
      {isOpen && (
        <div
          role="menu"
          aria-label="Item actions menu"
          className="absolute right-0 top-full mt-1 z-[60] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-xl py-1 min-w-[150px]"
        >
          {options.map((opt, idx) => (
            <button
              key={idx}
              role="menuitem"
              data-testid={`action-menu-${opt.label.replace(/\s+/g, '-').toLowerCase()}`}
              className={`w-full text-left px-3 py-2 text-xs cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${opt.danger ? 'text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300' : 'text-gray-800 dark:text-gray-200'}`}
              onClick={(e) => { e.stopPropagation(); opt.onClick(); setIsOpen(false); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};


// ג”€ג”€ Inline Rename Input ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

const InlineRename = ({
  value,
  onSave,
  onCancel,
}: {
  value: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) => {
  const [val, setVal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); if (val.trim()) onSave(val.trim()); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };

  return (
    <input
      ref={inputRef}
      data-testid="inline-rename-input"
      className="flex-1 bg-gray-700 text-gray-100 text-xs px-1 py-0.5 rounded border border-blue-500 outline-none min-w-0"
      value={val}
      onChange={e => setVal(e.target.value)}
      onKeyDown={handleKey}
      onBlur={() => { if (val.trim()) onSave(val.trim()); else onCancel(); }}
      onClick={e => e.stopPropagation()}
    />
  );
};

// ג”€ג”€ Method Color ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

// Actions that write to the workspace; viewers must not be offered them (the
// server would answer 403 "Requires editor role").
const EDITOR_ONLY_ACTIONS = new Set([
  'New Request', 'New Folder', 'Sort A-Z', 'Rename', 'Edit', 'Duplicate',
  'Duplicate / Fork', 'Move to...', 'Delete',
]);

// Ids of the tree items that survive the current filter (null = no filter).
// Folders on the way to a match stay visible and are forced open.
const FilterContext = createContext<Set<string> | null>(null);

const useCanEdit = () => {
  const activeWorkspace = useAuthStore(s => s.activeWorkspace);
  const isSuperAdmin = useAuthStore(s => s.user?.isSuperAdmin);
  return !activeWorkspace || ['editor', 'owner'].includes(activeWorkspace.myRole) || !!isSuperAdmin;
};

const forRole = <T extends { label: string }>(canEdit: boolean, options: T[]) =>
  canEdit ? options : options.filter(o => !EDITOR_ONLY_ACTIONS.has(o.label));

const getMethodColor = (method: string) => {
  switch (method?.toUpperCase()) {
    case 'GET': return 'text-green-500';
    case 'POST': return 'text-yellow-500';
    case 'PUT': return 'text-blue-400';
    case 'DELETE': return 'text-red-500';
    case 'PATCH': return 'text-purple-400';
    default: return 'text-gray-400';
  }
};

// ג”€ג”€ Request Node ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

const RequestNodeImpl = ({
  request,
  onDelete,
  onDuplicate,
  onMove,
}: {
  request: ApiRequest;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onMove: (id: string, name: string) => void;
}) => {
  const navigate = useNavigate();
  const { setActiveRequest, activeRequest } = useRequestStore();
  const { renameRequest } = useCollectionStore();
  const canEdit = useCanEdit();
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { showContextMenu } = useContextMenu();
    
  
  const isActive = activeRequest?._id === request._id;

  const handleClick = async (e: React.MouseEvent) => {
    if (isRenaming) return;
    e.stopPropagation();

    // Already open in a tab: just switch to it. Re-opening it from the tree
    // used to overwrite the tab with the stored copy, silently throwing away
    // any unsaved edits while the tab still claimed to be dirty.
    const { tabs, selectTab } = useRequestStore.getState();
    const openTab = tabs.find(t => t._id === request._id && t.tabType !== 'environment');
    if (openTab?.tabId) {
      selectTab(openTab.tabId);
      navigate('/');
      if (openTab.isDirty) return;
      // A clean tab can still pick up the latest stored version.
      try {
        const res = await api.get(`/requests/${request._id}`);
        const current = useRequestStore.getState().activeRequest;
        if (current?._id === request._id && !current.isDirty) setActiveRequest({ ...res.data, tabId: openTab.tabId });
      } catch {
        // keep what the tab already shows
      }
      return;
    }

    // Fallback stub in case fetch fails or is slow
    const fullRequest = request as any;
    const fallbackReq: ActiveRequest = {
      _id: request._id,
      tabType: 'request',
      collectionId: request.collectionId,
      folderId: request.folderId,
      name: request.name,
      method: request.method || 'GET',
      url: request.url || '',
      params: fullRequest.params || [],
      headers: fullRequest.headers || [],
      auth: fullRequest.auth || { type: 'none' },
      body: fullRequest.body || { mode: 'none' },
      settings: fullRequest.settings,
      preRequestScript: fullRequest.preRequestScript,
      testScript: fullRequest.testScript,
    };

    // Optimistic instant load
    setActiveRequest(fallbackReq);
    navigate('/');

    try {
      const res = await api.get(`/requests/${request._id}`);
      // Only apply if they haven't switched away, and haven't started editing
      // the stub in the meantime.
      const current = useRequestStore.getState().activeRequest;
      if (current?._id === request._id && !current.isDirty) {
        setActiveRequest(res.data);
      }
    } catch (err) {
      console.error('Failed to load full request, using fallback list data');
    }
  };

  const menuOptions = forRole(canEdit, [
    { label: 'Rename', onClick: () => setIsRenaming(true) },
    { label: 'Duplicate', onClick: () => onDuplicate(request._id) },
    { label: 'Move to...', onClick: () => onMove(request._id, request.name) },
    { label: 'Copy to Workspace', onClick: () => {
      const event = new CustomEvent('copy-to-workspace', { detail: { type: 'request', id: request._id, name: request.name } });
      window.dispatchEvent(event);
    }},
    { label: 'Delete', onClick: () => onDelete(request._id, request.name), danger: true },
  ]);

  return (
    <div
      data-testid="node-container"
      draggable={canEdit && !isRenaming}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'request', id: request._id, name: request.name }));
        e.dataTransfer.effectAllowed = 'move';
        setIsDragging(true);
      }}
      onDragEnd={() => setIsDragging(false)}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); showContextMenu({ x: e.clientX, y: e.clientY, items: menuOptions }); }}
      className={`flex items-center group px-2 py-1.5 rounded cursor-pointer transition-opacity ${
        isDragging ? 'opacity-30 bg-gray-800' : ''
      } ${isActive ? 'bg-gray-700 text-white' : 'hover:bg-gray-800 text-gray-400'}`}
      onClick={handleClick}
      onDoubleClick={() => { if (canEdit) setIsRenaming(true); }}
    >
      <span className={`mr-2 text-[10px] font-bold w-8 shrink-0 ${getMethodColor(request.method || 'GET')}`}>
        {(request.method || 'GET').toUpperCase().substring(0, 4)}
      </span>
      {isRenaming ? (
        <InlineRename
          value={request.name}
          onSave={async (name) => { await renameRequest(request._id, name); setIsRenaming(false); }}
          onCancel={() => setIsRenaming(false)}
        />
      ) : (
        <span data-testid={`node-${request.name}`} className="flex-1 truncate text-sm">{request.name}</span>
      )}
      {!isRenaming && (
        <div className="opacity-30 group-hover:opacity-100 flex items-center shrink-0">
          <ActionMenu options={menuOptions} />
        </div>
      )}
    </div>
  );
};

// The tree can hold thousands of rows. The callback props are re-created on every
// parent render but only close over ids/setters, so re-render a row only when its
// request object changes (filter keystrokes no longer re-render every row).
const RequestNode = React.memo(RequestNodeImpl, (prev, next) => prev.request === next.request);

// ג”€ג”€ Folder Node ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

const FolderNode = ({
  folder,
  collectionId,
  onPrompt,
  onDelete,
  onDuplicate,
  onMoveRequest,
}: {
  folder: Folder;
  collectionId: string;
  onPrompt: (config: Omit<PromptConfig, 'isOpen'>) => void;
  onDelete: (type: 'folder' | 'request', id: string, name: string) => void;
  onDuplicate: (type: 'folder', id: string) => void;
  onMoveRequest: (id: string, name: string) => void;
}) => {
  const [isOpenState, setIsOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { showContextMenu } = useContextMenu();
  const canEdit = useCanEdit();
  const visibleIds = useContext(FilterContext);
  const isOpen = isOpenState || !!visibleIds;
  const { foldersByCollection, requestsByFolder, createFolder, createRequest, renameFolder, duplicateRequest, moveRequest, moveFolder, loadFolderChildren } = useCollectionStore();

  const shown = <T extends { _id: string }>(items: T[]) => (visibleIds ? items.filter(i => visibleIds.has(i._id)) : items);
  const childFolders = shown(Array.isArray(foldersByCollection[folder._id]) ? foldersByCollection[folder._id] as Folder[] : []);
  const childRequests = shown(Array.isArray(requestsByFolder[folder._id]) ? requestsByFolder[folder._id] as ApiRequest[] : []);
  const isLoading = requestsByFolder[folder._id] === 'loading' || foldersByCollection[folder._id] === 'loading';
  
  useEffect(() => {
    if (isOpen) {
      loadFolderChildren(collectionId, folder._id);
    }
  }, [isOpen, folder._id, collectionId, loadFolderChildren]);


  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.type === 'request') {
        await moveRequest(data.id, collectionId, folder._id);
        if (!isOpenState) setIsOpen(true);
      } else if (data.type === 'folder' && data.id !== folder._id) {
        await moveFolder(data.id, collectionId, folder._id);
        if (!isOpenState) setIsOpen(true);
      }
    } catch (err) {
      console.error('Drop failed', err);
    }
  };

  const handleSort = async () => {
    const childFolders = Array.isArray(foldersByCollection[folder._id]) ? foldersByCollection[folder._id] as Folder[] : [];
    const childReqs = Array.isArray(requestsByFolder[folder._id]) ? requestsByFolder[folder._id] as ApiRequest[] : [];
    const reorderFolders = childFolders.sort((a, b) => a.name.localeCompare(b.name)).map((f, i) => ({ id: f._id!, order: i }));
    const reorderReqs = childReqs.sort((a, b) => a.name.localeCompare(b.name)).map((r, i) => ({ id: r._id!, order: i }));
    if (reorderFolders.length) await useCollectionStore.getState().reorderItems('folder', reorderFolders);
    if (reorderReqs.length) await useCollectionStore.getState().reorderItems('request', reorderReqs);
  };

  const menuOptions = forRole(canEdit, [
    { label: 'New Request', onClick: () => onPrompt({ title: 'Request name:', placeholder: 'Request name:', onSubmit: async (name) => await createRequest(collectionId, name, folder._id) }) },
    { label: 'New Folder', onClick: () => onPrompt({ title: 'Folder name:', placeholder: 'Folder name:', onSubmit: async (name) => await createFolder(collectionId, name, folder._id) }) },
    { label: 'Sort A-Z', onClick: handleSort },
    { label: 'Rename', onClick: () => setIsRenaming(true) },
    { label: 'Edit', onClick: () => {
      const event = new CustomEvent('edit-group', { detail: { type: 'folder', id: folder._id, name: folder.name } });
      window.dispatchEvent(event);
    }},
    { label: 'Duplicate', onClick: () => onDuplicate('folder', folder._id) },
    { label: 'Delete', onClick: () => onDelete('folder', folder._id, folder.name), danger: true },
  ]);

  return (
    <div className="select-none">
      <div
        data-testid="node-container"
        draggable={canEdit && !isRenaming}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.setData('application/json', JSON.stringify({ type: 'folder', id: folder._id, name: folder.name }));
          e.dataTransfer.effectAllowed = 'move';
          setIsDragging(true);
        }}
        onDragEnd={() => setIsDragging(false)}
        onDragOver={handleDragOver}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); showContextMenu({ x: e.clientX, y: e.clientY, items: menuOptions }); }}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex items-center group px-2 py-1.5 rounded cursor-pointer transition-all ${
          isDragOver
            ? 'bg-blue-600/20 border border-blue-500 text-blue-300'
            : isDragging
            ? 'opacity-30 bg-gray-800'
            : 'hover:bg-gray-800'
        }`}
        onClick={(e) => { if (!isRenaming) { e.stopPropagation(); setIsOpen(!isOpenState); } }}
        onDoubleClick={() => { if (canEdit) setIsRenaming(true); }}
      >
        <span className="mr-1 text-gray-400 shrink-0">
          {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <FolderIcon size={13} className="mr-2 text-gray-300 shrink-0" />
        {isRenaming ? (
          <InlineRename
            value={folder.name}
            onSave={async (name) => { await renameFolder(folder._id, name); setIsRenaming(false); }}
            onCancel={() => setIsRenaming(false)}
          />
        ) : (
          <span data-testid={`node-${folder.name}`} className="flex-1 truncate text-sm">{folder.name}</span>
        )}
        {!isRenaming && (
          <div className="opacity-30 group-hover:opacity-100 flex items-center shrink-0">
            <ActionMenu options={menuOptions} />
          </div>
        )}
      </div>

      {isOpen && (
        <div className="pl-3 ml-2 border-l border-gray-800/50 mt-0.5">
          {isLoading && <div className="text-gray-500 text-xs py-1 px-2 ml-4">Loading...</div>}
          {!isLoading && childFolders.map(childFolder => (
            <FolderNode
              key={childFolder._id}
              folder={childFolder}
              collectionId={collectionId}
              onPrompt={onPrompt}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onMoveRequest={onMoveRequest}
            />
          ))}
          {childRequests.map(req => (
            <RequestNode
              key={req._id}
              request={req}
              // 'request', not 'folder': this used to route a request's Delete
              // to the folder handler, which asked to "Delete Folder" and then
              // sent DELETE /folders/<request id> — nothing was ever removed.
              onDelete={(_id, name) => onDelete('request', _id, name)}
              onDuplicate={() => duplicateRequest(req._id)}
              onMove={onMoveRequest}
            />
          ))}
          {/* Quick Add Request */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-600 hover:text-gray-400 cursor-pointer rounded hover:bg-gray-800 mt-0.5"
            onClick={() => onPrompt({ title: 'Request name:', placeholder: 'My Request', onSubmit: async (name) => await createRequest(collectionId, name, folder._id) })}
            style={{ display: isLoading || !canEdit ? 'none' : 'flex' }}
          >
            <FilePlus size={11} />
            <span>Add Request</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ Collection Node ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

// A workspace with hundreds of collections mounts a node for each, and each asks for its fork status.
// Unthrottled, those requests fill the browser's connection pool and a drag, duplicate or save made
// meanwhile waits behind them, so at most two are in flight at a time.
const FORK_STATUS_CONCURRENCY = 2;
let forkStatusActive = 0;
const forkStatusWaiting: Array<() => void> = [];
function limitForkStatus<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      forkStatusActive++;
      task().then(resolve, reject).finally(() => { forkStatusActive--; forkStatusWaiting.shift()?.(); });
    };
    if (forkStatusActive < FORK_STATUS_CONCURRENCY) run(); else forkStatusWaiting.push(run);
  });
}

const CollectionNodeImpl = ({
  collection,
  isOpen,
  onPrompt,
  onDelete,
  onDuplicate,
  onMoveRequest,
}: {
  collection: Collection;
  isOpen: boolean;
  onPrompt: (config: Omit<PromptConfig, 'isOpen'>) => void;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (type: 'collection', id: string) => void;
  onMoveRequest: (id: string, name: string) => void;
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [forkSyncError, setForkSyncError] = useState<string | null>(null);
  const { showContextMenu } = useContextMenu();
  const { activeWorkspace } = useAuthStore();
  const canEdit = useCanEdit();
  const visibleIds = useContext(FilterContext);
  // Subscribe to this collection's own children only, so a change elsewhere in the tree does not re-render
  // every collection (the actions are stable references and are read once).
  const foldersOfCollection = useCollectionStore(st => st.foldersByCollection[collection._id]);
  const requestsOfCollection = useCollectionStore(st => st.requestsByFolder[collection._id]);
  const { createFolder, createRequest, renameCollection, duplicateRequest, duplicateFolder, moveRequest, moveFolder, loadCollectionChildren } = useCollectionStore.getState();
  const onToggle = useCallback(() => useCollectionStore.getState().toggleCollectionOpen(collection._id), [collection._id]);

  const shown = <T extends { _id: string }>(items: T[]) => (visibleIds ? items.filter(i => visibleIds.has(i._id)) : items);
  const childFolders = shown(Array.isArray(foldersOfCollection) ? foldersOfCollection as Folder[] : []);
  const childRequests = shown(Array.isArray(requestsOfCollection) ? requestsOfCollection as ApiRequest[] : []);
  const isLoading = foldersOfCollection === 'loading' || requestsOfCollection === 'loading';

  useEffect(() => {
    if (isOpen) {
      loadCollectionChildren(collection._id);
    }
  }, [isOpen, collection._id, loadCollectionChildren]);

  // Fetched once per node, not on every open/close — this is a cheap, single
  // indexed lookup, and a broken fork sync previously had zero UI signal
  // (only a console.error on the server).
  useEffect(() => {
    let cancelled = false;
    limitForkStatus(() => cancelled ? Promise.resolve(null) : api.get(`/collections/${collection._id}/fork-status`))
      .then(res => { if (!cancelled && res) setForkSyncError(res.data?.lastSyncError ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [collection._id]);


  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.type === 'request') {
        await moveRequest(data.id, collection._id, null);
        if (!isOpen) onToggle();
      } else if (data.type === 'folder') {
        await moveFolder(data.id, collection._id, null);
        if (!isOpen) onToggle();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSort = async () => {
    const childFolders = Array.isArray(foldersOfCollection) ? foldersOfCollection as Folder[] : [];
    const childReqs = Array.isArray(requestsOfCollection) ? requestsOfCollection as ApiRequest[] : [];
    const reorderFolders = childFolders.sort((a, b) => a.name.localeCompare(b.name)).map((f, i) => ({ id: f._id!, order: i }));
    const reorderReqs = childReqs.sort((a, b) => a.name.localeCompare(b.name)).map((r, i) => ({ id: r._id!, order: i }));
    if (reorderFolders.length) await useCollectionStore.getState().reorderItems('folder', reorderFolders);
    if (reorderReqs.length) await useCollectionStore.getState().reorderItems('request', reorderReqs);
  };

  const menuOptions = forRole(canEdit, [
    { label: 'New Request', onClick: () => onPrompt({ title: 'Request name:', placeholder: 'Request name:', onSubmit: async (name) => await createRequest(collection._id, name) }) },
    { label: 'New Folder', onClick: () => onPrompt({ title: 'Folder name:', placeholder: 'Folder name:', onSubmit: async (name) => await createFolder(collection._id, name) }) },
    { label: 'Sort A-Z', onClick: handleSort },
    { label: 'Rename', onClick: () => setIsRenaming(true) },
    { label: 'Edit', onClick: () => {
      const event = new CustomEvent('edit-group', { detail: { type: 'collection', id: collection._id, name: collection.name } });
      window.dispatchEvent(event);
    }},
    { label: 'Duplicate / Fork', onClick: () => onDuplicate('collection', collection._id) },
    // Smart fork only makes sense from a shared workspace — the server
    // enforces "shared → the fork owner's own personal workspace" (see
    // routes/forks.ts), so offering it from inside the personal workspace
    // itself would just be a menu item that always errors.
    ...(!activeWorkspace?.isPersonal ? [{ label: 'Fork (Auto-sync)', onClick: () => {
      // The smart fork (auto-syncing copy — see ForkModal) vs. the plain
      // one-off duplicate above: this was previously only wired up as an
      // event listener with nothing anywhere dispatching it, making the
      // feature unreachable from the UI.
      const event = new CustomEvent('fork-collection', { detail: { id: collection._id, name: collection.name } });
      window.dispatchEvent(event);
    }}] : []),
    { label: 'Fork to Workspace', onClick: () => {
      const event = new CustomEvent('copy-to-workspace', { detail: { type: 'collection', id: collection._id, name: collection.name } });
      window.dispatchEvent(event);
    }},
    { label: 'Run Collection', onClick: () => {
      const event = new CustomEvent('run-collection', { detail: { id: collection._id, name: collection.name } });
      window.dispatchEvent(event);
    }},
    { label: 'Share via Link', onClick: () => {
      const event = new CustomEvent('share-collection', { detail: { id: collection._id, name: collection.name } });
      window.dispatchEvent(event);
    }},
    { label: 'View Documentation', onClick: () => {
      const event = new CustomEvent('view-documentation', { detail: { id: collection._id, name: collection.name } });
      window.dispatchEvent(event);
    }},
    { label: 'Copy to Workspace', onClick: () => {
      const event = new CustomEvent('copy-to-workspace', { detail: { type: 'collection', id: collection._id, name: collection.name } });
      window.dispatchEvent(event);
    }},
    { label: 'Export', onClick: () => {
      const event = new CustomEvent('export-collection', { detail: { id: collection._id, name: collection.name } });
      window.dispatchEvent(event);
    }},
    { label: 'Delete', onClick: () => onDelete(collection._id, collection.name), danger: true },
  ]);

  return (
    <div className="select-none">
      <div
        data-testid="node-container"
        onDragOver={handleDragOver}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); showContextMenu({ x: e.clientX, y: e.clientY, items: menuOptions }); }}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        className={`flex items-center group px-2 py-1.5 rounded cursor-pointer transition-all ${
          isDragOver
            ? 'bg-blue-600/20 border border-blue-500 text-blue-300'
            : 'hover:bg-gray-800'
        }`}
        onClick={(e) => { if (!isRenaming) { e.stopPropagation(); onToggle(); } }}
        onDoubleClick={() => { if (canEdit) setIsRenaming(true); }}
      >
        <span className="mr-1 text-gray-400 shrink-0">
          {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <FolderIcon size={13} className="mr-2 text-gray-300 shrink-0" />
        {isRenaming ? (
          <InlineRename
            value={collection.name}
            onSave={async (name) => { await renameCollection(collection._id, name); setIsRenaming(false); }}
            onCancel={() => setIsRenaming(false)}
          />
        ) : (
          <span data-testid={`node-${collection.name}`} className="flex-1 truncate text-sm font-medium text-gray-200">{collection.name}</span>
        )}
        {!isRenaming && forkSyncError && (
          <span title={`Fork sync is failing: ${forkSyncError}`} className="shrink-0 mx-1 inline-flex">
            <AlertTriangle
              size={13}
              className="text-amber-400"
              data-testid={`fork-sync-error-${collection.name}`}
            />
          </span>
        )}
        {!isRenaming && (
          <div className="opacity-30 group-hover:opacity-100 flex items-center shrink-0">
            <ActionMenu options={menuOptions} />
          </div>
        )}
      </div>

      {isOpen && (
        <div className="ml-4 border-l border-gray-800 pl-2">
          {isLoading && <div className="text-gray-500 text-xs py-1 px-2 ml-4">Loading...</div>}
          {!isLoading && childFolders.map(folder => (
            <FolderNode
              key={folder._id}
              folder={folder}
              collectionId={collection._id}
              onPrompt={onPrompt}
              onDelete={(type, id, name) => {
                if (type === 'folder') {
                  const ev = new CustomEvent('delete-folder', { detail: { id, name } });
                  window.dispatchEvent(ev);
                } else {
                  const ev = new CustomEvent('delete-request', { detail: { id, name } });
                  window.dispatchEvent(ev);
                }
              }}
              onDuplicate={(_type, id) => duplicateFolder(id, collection._id)}
              onMoveRequest={onMoveRequest}
            />
          ))}
          {childRequests.map(req => (
            <RequestNode
              key={req._id}
              request={req}
              onDelete={(id, name) => {
                const ev = new CustomEvent('delete-request', { detail: { id, name } });
                window.dispatchEvent(ev);
              }}
              onDuplicate={() => duplicateRequest(req._id)}
              onMove={onMoveRequest}
            />
          ))}
          {/* Quick Add Request at bottom of collection */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-600 hover:text-gray-400 cursor-pointer rounded hover:bg-gray-800 mt-0.5"
            onClick={() => onPrompt({ title: 'Request name:', placeholder: 'My Request', onSubmit: async (name) => await createRequest(collection._id, name) })}
            style={{ display: isLoading || !canEdit ? 'none' : 'flex' }}
          >
            <FilePlus size={11} />
            <span>Add Request</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ג”€ג”€ Collection Explorer (Root) ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

// Filter box for the request tree. It owns the text as it is typed and reports a debounced copy (blank
// clears at once), so typing never re-renders the tree itself.
// Re-renders only when its own collection, open state or the (stable) handlers change.
const CollectionNode = React.memo(CollectionNodeImpl);

const TreeFilterInput = ({ onChange }: { onChange: (debounced: string) => void }) => {
  const [value, setValue] = useState('');
  useEffect(() => {
    if (!value.trim()) { onChange(''); return; }
    const t = setTimeout(() => onChange(value), 150);
    return () => clearTimeout(t);
  }, [value, onChange]);
  return (
    <>
      <input
        type="text"
        placeholder="Filter requests..."
        value={value}
        onChange={e => setValue(e.target.value)}
        className="flex-1 bg-transparent text-xs text-gray-300 placeholder-gray-600 outline-none py-1"
      />
      {value && (
        <button onClick={() => setValue('')} className="text-gray-500 hover:text-gray-300">
          <X size={12} />
        </button>
      )}
    </>
  );
};

export const CollectionExplorer: React.FC = () => {
  const {
    collections, foldersByCollection, requestsByFolder,
    createCollection, openCollectionIds, toggleCollectionOpen,
    deleteCollection, deleteFolder, deleteRequest,
    duplicateCollection, duplicateFolder,
    loadWorkspace
  } = useCollectionStore();
  const { activeWorkspace } = useAuthStore();
  const canEdit = useCanEdit();

  const [promptConfig, setPromptConfig] = useState<PromptConfig>({ isOpen: false, title: '', onSubmit: () => {} });
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [moveConfig, setMoveConfig] = useState<MoveConfig>({ isOpen: false, requestId: '', requestName: '' });
  const [runnerConfig, setRunnerConfig] = useState<{ isOpen: boolean; collectionId: string; collectionName: string }>({
    isOpen: false,
    collectionId: '',
    collectionName: '',
  });
  const [variablesConfig, setVariablesConfig] = useState<{ isOpen: boolean; collectionId: string; collectionName: string; type: 'collection' | 'folder' }>({
    isOpen: false,
    collectionId: '',
    collectionName: '',
    type: 'collection',
  });
  const [copyToWorkspaceConfig, setCopyToWorkspaceConfig] = useState<{ isOpen: boolean; type: 'collection' | 'request'; sourceId: string; sourceName: string }>({
    isOpen: false,
    type: 'collection',
    sourceId: '',
    sourceName: '',
  });
  const [docsConfig, setDocsConfig] = useState<{ isOpen: boolean; collectionId: string; collectionName: string }>({
    isOpen: false,
    collectionId: '',
    collectionName: '',
  });
  const [forkConfig, setForkConfig] = useState<{ isOpen: boolean; collectionId: string; collectionName: string }>({ isOpen: false, collectionId: '', collectionName: '' });
  const [shareConfig, setShareConfig] = useState<{ isOpen: boolean; collectionId: string; collectionName: string }>({
    isOpen: false,
    collectionId: '',
    collectionName: '',
  });
  // The tree is filtered from a debounced copy, and the text being typed lives inside TreeFilterInput,
  // so a keystroke does not re-render this (large) component - only the debounced change does.
  const [debouncedFilter, setDebouncedFilter] = useState('');

  // Fetch collections when workspace changes
  useEffect(() => {
    if (activeWorkspace?._id) {
      loadWorkspace(activeWorkspace._id);
    }
  }, [activeWorkspace?._id]);

  // Listen for events from nested nodes
  useEffect(() => {
    const handleDeleteFolder = (e: Event) => {
      const ev = e as CustomEvent;
      setConfirmConfig({
        isOpen: true,
        title: 'Delete Folder',
        message: `Are you sure you want to delete folder "${ev.detail.name}"?`,
        onConfirm: () => { setConfirmConfig(c => ({ ...c, isOpen: false })); deleteFolder(ev.detail.id); },
      });
    };
    const handleDeleteRequest = (e: Event) => {
      const ev = e as CustomEvent;
      setConfirmConfig({
        isOpen: true,
        title: 'Delete Request',
        message: `Are you sure you want to delete request "${ev.detail.name}"?`,
        onConfirm: () => { setConfirmConfig(c => ({ ...c, isOpen: false })); deleteRequest(ev.detail.id); },
      });
    };
    const handleMoveRequest = (e: Event) => {
      const ev = e as CustomEvent;
      setMoveConfig({ isOpen: true, requestId: ev.detail.id, requestName: ev.detail.name });
    };
    const handleExportCollection = (e: Event) => {
      const ev = e as CustomEvent;
      void exportCollection(ev.detail.id, ev.detail.name);
    };
    const handleRunCollection = (e: Event) => {
      const ev = e as CustomEvent;
      setRunnerConfig({ isOpen: true, collectionId: ev.detail.id, collectionName: ev.detail.name });
    };
    const handleEditVariables = (e: Event) => {
      const ev = e as CustomEvent;
      setVariablesConfig({ isOpen: true, collectionId: ev.detail.id, collectionName: ev.detail.name, type: ev.detail.type });
    };
    const handleCopyToWorkspace = (e: Event) => {
      const ev = e as CustomEvent;
      setCopyToWorkspaceConfig({ isOpen: true, type: ev.detail.type, sourceId: ev.detail.id, sourceName: ev.detail.name });
    };
    const handleViewDocumentation = (e: Event) => {
      const { id, name } = (e as CustomEvent).detail;
      setDocsConfig({ isOpen: true, collectionId: id, collectionName: name });
    };
    const handleShareCollection = (e: Event) => {
      const { id, name } = (e as CustomEvent).detail;
      setShareConfig({ isOpen: true, collectionId: id, collectionName: name });
    };
    const handleForkCollection = (e: Event) => {
      const { id, name } = (e as CustomEvent).detail;
      setForkConfig({ isOpen: true, collectionId: id, collectionName: name });
    };

    window.addEventListener('delete-folder', handleDeleteFolder);
    window.addEventListener('delete-request', handleDeleteRequest);
    window.addEventListener('move-request', handleMoveRequest);
    window.addEventListener('export-collection', handleExportCollection);
    window.addEventListener('run-collection', handleRunCollection);
    window.addEventListener('edit-group', handleEditVariables);
    window.addEventListener('copy-to-workspace', handleCopyToWorkspace);
    window.addEventListener('view-documentation', handleViewDocumentation);
    window.addEventListener('share-collection', handleShareCollection);
    window.addEventListener('fork-collection', handleForkCollection);

    return () => {
      window.removeEventListener('delete-folder', handleDeleteFolder);
      window.removeEventListener('delete-request', handleDeleteRequest);
      window.removeEventListener('move-request', handleMoveRequest);
      window.removeEventListener('export-collection', handleExportCollection);
      window.removeEventListener('run-collection', handleRunCollection);
      window.removeEventListener('edit-group', handleEditVariables);
      window.removeEventListener('copy-to-workspace', handleCopyToWorkspace);
      window.removeEventListener('view-documentation', handleViewDocumentation);
      window.removeEventListener('share-collection', handleShareCollection);
      window.removeEventListener('fork-collection', handleForkCollection);
    };
  }, [deleteFolder, deleteRequest, foldersByCollection, requestsByFolder, collections]);



  // The server serialises the whole tree (FEAT-10), so an export no longer
  // depends on which folders the sidebar happens to have loaded, and it
  // round-trips through Import > File.
  const exportCollection = async (id: string, name: string) => {
    try {
      const res = await api.get(`/collections/${id}/export`, { params: { includeSecrets: 'true' } });
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name.replace(/s+/g, '_')}.reqSpace_collection.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      useToastStore.getState().addToast('error', err?.response?.data?.message || 'Export failed');
    }
  };

  const openPrompt = (config: Omit<PromptConfig, 'isOpen'>) => {
    setPromptConfig({
      ...config,
      isOpen: true,
      onSubmit: (val) => {
        setPromptConfig(p => ({ ...p, isOpen: false }));
        Promise.resolve(config.onSubmit(val)).catch((err) => {
          console.error(err);
          useToastStore.getState().addToast('error', err?.response?.data?.message || 'Action failed');
        });
      },
    });
  };

  const handleCollectionDelete = (id: string, name: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Collection',
      message: `Delete "${name}"? All folders and requests inside will be permanently removed.`,
      onConfirm: () => {
        setConfirmConfig(c => ({ ...c, isOpen: false }));
        deleteCollection(id);
      },
    });
  };

  const handleDuplicate = async (type: 'collection' | 'folder', id: string) => {
    if (type === 'collection' && activeWorkspace) {
      await duplicateCollection(id, activeWorkspace._id);
    } else if (type === 'folder') {
      const folder = Object.values(foldersByCollection).flat().find((f: any) => f && f._id === id) as Folder | undefined;
      if (folder) await duplicateFolder(id, folder.collectionId, folder.parentFolderId);
    }
  };

  const handleMoveRequest = (id: string, name: string) => {
    setMoveConfig({ isOpen: true, requestId: id, requestName: name });
  };

  // CollectionNode is memoized, so it gets handlers whose identity never changes and which call the latest ones.
  const handlersRef = useRef({ openPrompt, handleCollectionDelete, handleDuplicate, handleMoveRequest });
  handlersRef.current = { openPrompt, handleCollectionDelete, handleDuplicate, handleMoveRequest };
  const stableHandlers = useMemo(() => ({
    onPrompt: (config: Omit<PromptConfig, 'isOpen'>) => handlersRef.current.openPrompt(config),
    onDelete: (id: string, name: string) => handlersRef.current.handleCollectionDelete(id, name),
    onDuplicate: (type: 'collection' | 'folder', id: string) => handlersRef.current.handleDuplicate(type, id),
    onMoveRequest: (id: string, name: string) => handlersRef.current.handleMoveRequest(id, name),
  }), []);

  const handleCreateCollection = () => {
    if (!activeWorkspace) {
      useToastStore.getState().addToast('error', 'No workspace selected');
      return;
    }
    openPrompt({
      title: 'New Collection',
      placeholder: 'Enter collection name:',
      onSubmit: async (name) => {
        await createCollection(activeWorkspace._id, name);
      },
    });
  };

  // Filter: keep items whose name (requests: name or url) matches, plus the
  // folders/collection leading to them; a matching folder/collection keeps its
  // whole subtree.
  const filterLower = debouncedFilter.trim().toLowerCase();
  const { filteredCollections, visibleIds } = useMemo(() => {
    if (!filterLower) return { filteredCollections: [...collections], visibleIds: null as Set<string> | null };
    const ids = new Set<string>();
    const hit = (text?: string) => !!text && text.toLowerCase().includes(filterLower);
    const visit = (parentKey: string, forceAll: boolean): boolean => {
      let any = false;
      const folders = foldersByCollection[parentKey];
      if (Array.isArray(folders)) {
        for (const f of folders) {
          const all = forceAll || hit(f.name);
          const inside = visit(f._id, all);
          if (all || inside) { ids.add(f._id); any = true; }
        }
      }
      const reqs = requestsByFolder[parentKey];
      if (Array.isArray(reqs)) {
        for (const r of reqs) if (forceAll || hit(r.name) || hit(r.url)) { ids.add(r._id); any = true; }
      }
      return any;
    };
    const matched = collections.filter(col => {
      const all = hit(col.name);
      const inside = visit(col._id, all);
      return all || inside;
    });
    return { filteredCollections: matched, visibleIds: ids };
  }, [filterLower, collections, foldersByCollection, requestsByFolder]);
  filteredCollections.sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <>
      <div className="w-full h-full text-sm text-gray-300 bg-gray-900 flex flex-col">
        {/* Header */}
        <div className="p-3 border-b border-gray-800 font-semibold text-gray-100 flex justify-between items-center">
          <span>Collections</span>
          {canEdit && <button
            data-testid="new-collection-btn"
            className="text-gray-400 hover:text-white transition-colors"
            title="New Collection"
            onClick={handleCreateCollection}
          >
            <Plus size={16} />
          </button>}
        </div>

        {/* Search Input */}
        <div className="px-2 py-1.5 border-b border-gray-800">
          <div className="flex items-center bg-gray-800 rounded px-2 gap-1">
            <Search size={12} className="text-gray-500 shrink-0" />
            <TreeFilterInput onChange={setDebouncedFilter} />
          </div>
        </div>

        {/* Tree */}
        <div className="p-2 flex-1 overflow-y-auto space-y-0.5">
          {collections.length === 0 ? (
            <div className="text-center mt-8 px-4">
              <FolderIcon size={32} className="mx-auto text-gray-700 mb-3" />
              <p className="text-xs text-gray-500 mb-3">No collections yet.</p>
              {canEdit && <button
                data-testid="new-collection-empty-btn"
                onClick={handleCreateCollection}
                className="px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white"
              >
                + Create Collection
              </button>}
            </div>
          ) : filteredCollections.length === 0 ? (
            <div className="text-center mt-8 px-4">
              <p className="text-xs text-gray-500">No results for "{debouncedFilter}"</p>
            </div>
          ) : (
            <FilterContext.Provider value={visibleIds}>
            {filteredCollections.map(collection => (
              <CollectionNode
                key={collection._id}
                collection={collection}
                isOpen={openCollectionIds.has(collection._id) || !!filterLower}
                onPrompt={stableHandlers.onPrompt}
                onDelete={stableHandlers.onDelete}
                onDuplicate={stableHandlers.onDuplicate}
                onMoveRequest={stableHandlers.onMoveRequest}
              />
            ))}
            </FilterContext.Provider>
          )}
        </div>
      </div>

      {/* Modals — portalled to <body>: the sidebar is a transformed container on small screens, which would trap position:fixed overlays inside it. */}
      {createPortal(<>
      {promptConfig.isOpen && (
        <PromptModal
          title={promptConfig.title}
          placeholder={promptConfig.placeholder}
          initialValue={promptConfig.initialValue}
          onSubmit={promptConfig.onSubmit}
          onCancel={() => setPromptConfig(p => ({ ...p, isOpen: false }))}
        />
      )}

      {confirmConfig.isOpen && (
        <ConfirmModal
          title={confirmConfig.title}
          message={confirmConfig.message}
          onConfirm={confirmConfig.onConfirm}
          onCancel={() => setConfirmConfig(c => ({ ...c, isOpen: false }))}
        />
      )}

      {moveConfig.isOpen && (
        <MoveRequestModal
          requestId={moveConfig.requestId}
          requestName={moveConfig.requestName}
          onClose={() => setMoveConfig(m => ({ ...m, isOpen: false }))}
        />
      )}

      {runnerConfig.isOpen && (
        <CollectionRunnerModal
          collectionId={runnerConfig.collectionId}
          collectionName={runnerConfig.collectionName}
          onClose={() => setRunnerConfig(r => ({ ...r, isOpen: false }))}
        />
      )}

      {variablesConfig.isOpen && (
        <GroupEditModal
          type={variablesConfig.type}
          id={variablesConfig.collectionId}
          name={variablesConfig.collectionName}
          onClose={() => setVariablesConfig({ ...variablesConfig, isOpen: false })}
        />
      )}

      {copyToWorkspaceConfig.isOpen && (
        <CopyToWorkspaceModal
          type={copyToWorkspaceConfig.type}
          sourceId={copyToWorkspaceConfig.sourceId}
          sourceName={copyToWorkspaceConfig.sourceName}
          onClose={() => setCopyToWorkspaceConfig({ ...copyToWorkspaceConfig, isOpen: false })}
        />
      )}

      {docsConfig.isOpen && (
        <DocumentationModal
          collectionId={docsConfig.collectionId}
          collectionName={docsConfig.collectionName}
          onClose={() => setDocsConfig({ ...docsConfig, isOpen: false })}
        />
      )}

      {forkConfig.isOpen && (
        <ForkModal
          collectionId={forkConfig.collectionId}
          collectionName={forkConfig.collectionName}
          onClose={() => setForkConfig(f => ({ ...f, isOpen: false }))}
        />
      )}
      {shareConfig.isOpen && (
        <ShareLinkModal
          collectionId={shareConfig.collectionId}
          collectionName={shareConfig.collectionName}
          onClose={() => setShareConfig({ ...shareConfig, isOpen: false })}
        />
      )}
      </>, document.body)}
    </>
  );
};

export default CollectionExplorer;
