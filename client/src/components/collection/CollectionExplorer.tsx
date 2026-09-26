import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCollectionStore } from '../../store/collectionStore';
import type { Collection, Folder, ApiRequest } from '../../store/collectionStore';
import { useRequestStore } from '../../store/requestStore';
import type { ActiveRequest } from '../../store/requestStore';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
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
  ChevronDown, ChevronRight, Folder as FolderIcon, MoreVertical, Plus, FilePlus, Search, X
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

const RequestNode = ({
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
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { showContextMenu } = useContextMenu();
    
  
  const isActive = activeRequest?._id === request._id;

  const handleClick = async (e: React.MouseEvent) => {
    if (isRenaming) return;
    e.stopPropagation();
    
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
      preRequestScript: fullRequest.preRequestScript,
      testScript: fullRequest.testScript,
    };

    // Optimistic instant load
    setActiveRequest(fallbackReq);
    navigate('/');

    try {
      const res = await api.get(`/requests/${request._id}`);
      // Only apply if they haven't switched away
      if (useRequestStore.getState().activeRequest?._id === request._id) {
        setActiveRequest(res.data);
      }
    } catch (err) {
      console.error('Failed to load full request, using fallback list data');
    }
  };

  const menuOptions = [
    { label: 'Rename', onClick: () => setIsRenaming(true) },
    { label: 'Duplicate', onClick: () => onDuplicate(request._id) },
    { label: 'Move to...', onClick: () => onMove(request._id, request.name) },
    { label: 'Copy to Workspace', onClick: () => {
      const event = new CustomEvent('copy-to-workspace', { detail: { type: 'request', id: request._id, name: request.name } });
      window.dispatchEvent(event);
    }},
    { label: 'Delete', onClick: () => onDelete(request._id, request.name), danger: true },
  ];

  return (
    <div
      data-testid="node-container"
      draggable={!isRenaming}
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
      onDoubleClick={() => setIsRenaming(true)}
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
  onDelete: (type: 'folder', id: string, name: string) => void;
  onDuplicate: (type: 'folder', id: string) => void;
  onMoveRequest: (id: string, name: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { showContextMenu } = useContextMenu();
  const { folders, requests, createFolder, createRequest, renameFolder, duplicateRequest, moveRequest, moveFolder } = useCollectionStore();

  const childFolders = folders.filter(f => f.parentFolderId === folder._id).sort((a, b) => (a.order || 0) - (b.order || 0));
  const childRequests = requests.filter(r => r.folderId === folder._id).sort((a, b) => (a.order || 0) - (b.order || 0));

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
        if (!isOpen) setIsOpen(true);
      } else if (data.type === 'folder' && data.id !== folder._id) {
        await moveFolder(data.id, collectionId, folder._id);
        if (!isOpen) setIsOpen(true);
      }
    } catch (err) {
      console.error('Drop failed', err);
    }
  };

  const handleSort = async () => {
    const childFolders = folders.filter(f => f.parentFolderId === folder._id);
    const childReqs = requests.filter(r => r.folderId === folder._id);
    const reorderFolders = childFolders.sort((a, b) => a.name.localeCompare(b.name)).map((f, i) => ({ id: f._id!, order: i }));
    const reorderReqs = childReqs.sort((a, b) => a.name.localeCompare(b.name)).map((r, i) => ({ id: r._id!, order: i }));
    if (reorderFolders.length) await useCollectionStore.getState().reorderItems('folder', reorderFolders);
    if (reorderReqs.length) await useCollectionStore.getState().reorderItems('request', reorderReqs);
  };

  const menuOptions = [
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
  ];

  return (
    <div className="select-none">
      <div
        data-testid="node-container"
        draggable={!isRenaming}
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
        onClick={(e) => { if (!isRenaming) { e.stopPropagation(); setIsOpen(!isOpen); } }}
        onDoubleClick={() => setIsRenaming(true)}
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
          {childFolders.map(childFolder => (
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
              onDelete={(_id, name) => onDelete('folder', _id, name)}
              onDuplicate={() => duplicateRequest(req._id)}
              onMove={onMoveRequest}
            />
          ))}
          {/* Quick Add Request */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-600 hover:text-gray-400 cursor-pointer rounded hover:bg-gray-800 mt-0.5"
            onClick={() => onPrompt({ title: 'Request name:', placeholder: 'My Request', onSubmit: async (name) => await createRequest(collectionId, name, folder._id) })}
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

const CollectionNode = ({
  collection,
  isOpen,
  onToggle,
  onPrompt,
  onDelete,
  onDuplicate,
  onMoveRequest,
}: {
  collection: Collection;
  isOpen: boolean;
  onToggle: () => void;
  onPrompt: (config: Omit<PromptConfig, 'isOpen'>) => void;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (type: 'collection', id: string) => void;
  onMoveRequest: (id: string, name: string) => void;
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const { showContextMenu } = useContextMenu();
  const { folders, requests, createFolder, createRequest, renameCollection, duplicateRequest, duplicateFolder, moveRequest, moveFolder } = useCollectionStore();

  const childFolders = folders.filter(f => f.collectionId === collection._id && !f.parentFolderId).sort((a, b) => (a.order || 0) - (b.order || 0));
  const childRequests = requests.filter(r => r.collectionId === collection._id && !r.folderId).sort((a, b) => (a.order || 0) - (b.order || 0));

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
    const childFolders = folders.filter(f => f.collectionId === collection._id && !f.parentFolderId);
    const childReqs = requests.filter(r => r.collectionId === collection._id && !r.folderId);
    const reorderFolders = childFolders.sort((a, b) => a.name.localeCompare(b.name)).map((f, i) => ({ id: f._id!, order: i }));
    const reorderReqs = childReqs.sort((a, b) => a.name.localeCompare(b.name)).map((r, i) => ({ id: r._id!, order: i }));
    if (reorderFolders.length) await useCollectionStore.getState().reorderItems('folder', reorderFolders);
    if (reorderReqs.length) await useCollectionStore.getState().reorderItems('request', reorderReqs);
  };

  const menuOptions = [
    { label: 'New Request', onClick: () => onPrompt({ title: 'Request name:', placeholder: 'Request name:', onSubmit: async (name) => await createRequest(collection._id, name) }) },
    { label: 'New Folder', onClick: () => onPrompt({ title: 'Folder name:', placeholder: 'Folder name:', onSubmit: async (name) => await createFolder(collection._id, name) }) },
    { label: 'Sort A-Z', onClick: handleSort },
    { label: 'Rename', onClick: () => setIsRenaming(true) },
    { label: 'Edit', onClick: () => {
      const event = new CustomEvent('edit-group', { detail: { type: 'collection', id: collection._id, name: collection.name } });
      window.dispatchEvent(event);
    }},
    { label: 'Duplicate / Fork', onClick: () => onDuplicate('collection', collection._id) },
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
  ];

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
        onDoubleClick={() => setIsRenaming(true)}
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
        {!isRenaming && (
          <div className="opacity-30 group-hover:opacity-100 flex items-center shrink-0">
            <ActionMenu options={menuOptions} />
          </div>
        )}
      </div>

      {isOpen && (
        <div className="ml-4 border-l border-gray-800 pl-2">
          {childFolders.map(folder => (
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

export const CollectionExplorer: React.FC = () => {
  const {
    collections, folders, requests,
    createCollection, openCollectionIds, toggleCollectionOpen,
    deleteCollection, deleteFolder, deleteRequest,
    duplicateCollection, duplicateFolder,
  } = useCollectionStore();
  const { activeWorkspace } = useAuthStore();

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
  const [searchFilter, setSearchFilter] = useState('');

  // Fetch collections when workspace changes
  useEffect(() => {
    if (activeWorkspace?._id) {
      useCollectionStore.getState().fetchCollectionsData(activeWorkspace._id);
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
      exportCollection(ev.detail.id, ev.detail.name);
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
  }, [deleteFolder, deleteRequest, folders, requests, collections]);



  const exportCollection = (id: string, name: string) => {
    const collection = collections.find(c => c._id === id);
    if (!collection) return;
    const colFolders = folders.filter(f => f.collectionId === id);
    const colRequests = requests.filter(r => r.collectionId === id);

    // Build ReqSpace Collection v2.1 format
    const buildItems = (parentFolderId: string | null): any[] => {
      const items: any[] = [];
      // Add sub-folders
      const subFolders = colFolders.filter(f => f.parentFolderId === parentFolderId);
      for (const folder of subFolders) {
        items.push({
          name: folder.name,
          item: buildItems(folder._id),
        });
      }
      // Add requests
      const reqs = colRequests.filter(r => r.folderId === parentFolderId);
      for (const rawReq of reqs) {
        const req: any = rawReq;
        
        const header = (req.headers || []).filter((h: any) => h.key).map((h: any) => {
          const out: any = {
            key: h.key,
            value: h.value || '',
            description: h.description || '',
          };
          if (!h.enabled) out.disabled = true;
          return out;
        });

        let body: any = undefined;
        if (req.body && req.body.mode !== 'none') {
          body = { mode: req.body.mode };
          if (req.body.mode === 'raw') {
            body.raw = req.body.raw || '';
            body.options = { raw: { language: req.body.rawLanguage === 'json' ? 'json' : 'text' } };
          } else if (req.body.mode === 'urlencoded') {
            body.urlencoded = (req.body.urlencoded || []).filter((i: any) => i.key).map((i: any) => {
              const out: any = { key: i.key, value: i.value || '' };
              if (!i.enabled) out.disabled = true;
              return out;
            });
          } else if (req.body.mode === 'form-data') {
            body.formdata = (req.body.formData || []).filter((i: any) => i.key).map((i: any) => {
              const out: any = { key: i.key, value: i.value || '', type: i.type || 'text' };
              if (!i.enabled) out.disabled = true;
              return out;
            });
          }
        }
        
        let urlObj: any = req.url || '';
        if ((req.params && req.params.length > 0) || req.url) {
          urlObj = { raw: req.url || '' };
          try {
            const parsed = new URL(req.url || 'http://localhost');
            urlObj.protocol = parsed.protocol.replace(':', '');
            urlObj.host = parsed.hostname.split('.');
            if (parsed.port) urlObj.port = parsed.port;
            urlObj.path = parsed.pathname.split('/').filter(x => x);
          } catch (e) {
            // keep raw only
          }
          if (req.params && req.params.length > 0) {
            urlObj.query = req.params.filter((p: any) => p.key).map((p: any) => {
              const out: any = {
                key: p.key,
                value: p.value || '',
                description: p.description || ''
              };
              if (!p.enabled) out.disabled = true;
              return out;
            });
          }
        }

        const item: any = {
          name: req.name,
          request: {
            method: req.method || 'GET',
            url: urlObj,
            header,
            body,
          },
        };
        
        const reqEvents = [];
        if (req.preRequestScript) {
          reqEvents.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: req.preRequestScript.split('\n') } });
        }
        if (req.testScript) {
          reqEvents.push({ listen: 'test', script: { type: 'text/javascript', exec: req.testScript.split('\n') } });
        }
        if (reqEvents.length > 0) {
          item.event = reqEvents;
        }

        if (body && ['GET', 'HEAD', 'OPTIONS'].includes(req.method?.toUpperCase())) {
          item.protocolProfileBehavior = { disableBodyPruning: true };
        }

        items.push(item);
      }
      return items;
    };

    const reqSpaceCollection: any = {
      info: { name: collection.name, schema: 'https://schema.getreqSpace.com/json/collection/v2.1.0/collection.json' },
      item: buildItems(null),
    };
    
    if (collection.variables && collection.variables.length > 0) {
      reqSpaceCollection.variable = collection.variables.map(v => ({
        key: v.key,
        value: v.value || '',
        type: 'string'
      }));
    }
    
    const events = [];
    if (collection.preRequestScript) {
      events.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: collection.preRequestScript.split('\n') } });
    }
    if (collection.testScript) {
      events.push({ listen: 'test', script: { type: 'text/javascript', exec: collection.testScript.split('\n') } });
    }
    if (events.length > 0) {
      reqSpaceCollection.event = events;
    }

    const blob = new Blob([JSON.stringify(reqSpaceCollection, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '_')}.reqSpace_collection.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openPrompt = (config: Omit<PromptConfig, 'isOpen'>) => {
    setPromptConfig({
      ...config,
      isOpen: true,
      onSubmit: (val) => {
        config.onSubmit(val);
        setPromptConfig(p => ({ ...p, isOpen: false }));
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
      const folder = folders.find(f => f._id === id);
      if (folder) await duplicateFolder(id, folder.collectionId, folder.parentFolderId);
    }
  };

  const handleMoveRequest = (id: string, name: string) => {
    setMoveConfig({ isOpen: true, requestId: id, requestName: name });
  };

  const handleCreateCollection = () => {
    if (!activeWorkspace) return;
    openPrompt({
      title: 'Enter collection name:',
      placeholder: 'Enter collection name:',
      onSubmit: async (name) => {
        await createCollection(activeWorkspace._id, name);
      },
    });
  };

  // Filter: show a collection if its name OR any request name/url matches
  const filterLower = searchFilter.trim().toLowerCase();
  const filteredCollections = filterLower
    ? collections.filter(col => {
        if (col.name.toLowerCase().includes(filterLower)) return true;
        const colRequests = requests.filter(r => r.collectionId === col._id);
        if (colRequests.some(r => r.name?.toLowerCase().includes(filterLower) || r.url?.toLowerCase().includes(filterLower))) return true;
        const colFolders = folders.filter(f => f.collectionId === col._id);
        if (colFolders.some(f => f.name?.toLowerCase().includes(filterLower))) return true;
        return false;
      })
    : collections;
  filteredCollections.sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <>
      <div className="w-full h-full text-sm text-gray-300 bg-gray-900 flex flex-col">
        {/* Header */}
        <div className="p-3 border-b border-gray-800 font-semibold text-gray-100 flex justify-between items-center">
          <span>Collections</span>
          <button
            data-testid="new-collection-btn"
            className="text-gray-400 hover:text-white transition-colors"
            title="New Collection"
            onClick={handleCreateCollection}
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Search Input */}
        <div className="px-2 py-1.5 border-b border-gray-800">
          <div className="flex items-center bg-gray-800 rounded px-2 gap-1">
            <Search size={12} className="text-gray-500 shrink-0" />
            <input
              type="text"
              placeholder="Filter requests..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              className="flex-1 bg-transparent text-xs text-gray-300 placeholder-gray-600 outline-none py-1"
            />
            {searchFilter && (
              <button onClick={() => setSearchFilter('')} className="text-gray-500 hover:text-gray-300">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Tree */}
        <div className="p-2 flex-1 overflow-y-auto space-y-0.5">
          {collections.length === 0 ? (
            <div className="text-center mt-8 px-4">
              <FolderIcon size={32} className="mx-auto text-gray-700 mb-3" />
              <p className="text-xs text-gray-500 mb-3">No collections yet.</p>
              <button
                data-testid="new-collection-empty-btn"
                onClick={handleCreateCollection}
                className="px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white"
              >
                + Create Collection
              </button>
            </div>
          ) : filteredCollections.length === 0 ? (
            <div className="text-center mt-8 px-4">
              <p className="text-xs text-gray-500">No results for "{searchFilter}"</p>
            </div>
          ) : (
            filteredCollections.map(collection => (
              <CollectionNode
                key={collection._id}
                collection={collection}
                isOpen={openCollectionIds.has(collection._id) || !!filterLower}
                onToggle={() => toggleCollectionOpen(collection._id)}
                onPrompt={openPrompt}
                onDelete={handleCollectionDelete}
                onDuplicate={handleDuplicate}
                onMoveRequest={handleMoveRequest}
              />
            ))
          )}
        </div>
      </div>

      {/* Modals */}
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
    </>
  );
};

export default CollectionExplorer;
