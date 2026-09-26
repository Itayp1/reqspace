import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Settings, Users, FolderOpen, Clock, DownloadCloud, SlidersHorizontal, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import CollectionExplorer from '../collection/CollectionExplorer';
import WorkspaceSettingsModal from '../workspace/WorkspaceSettingsModal';
import HistorySidebar from '../history/HistorySidebar';
import ImportModal from '../collection/ImportModal';
import EnvironmentSidebar from '../environment/EnvironmentSidebar';
import api from '../../api/axios';

export default function Sidebar() {
  const { activeWorkspace, workspaces, setActiveWorkspace, user } = useAuthStore();
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'collections' | 'history' | 'environments'>('collections');

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
      window.location.href = '/login';
    } catch(err) {
      console.error(err);
    }
  };

  return (
    <nav aria-label="Application sidebar" className="flex flex-col w-64 bg-surface border-r border-border h-full text-sm select-none">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <Link to="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity" aria-label="Reqspace home">
          <img src="/reqspace-logo.jpg" alt="Reqspace Logo" className="h-8 w-8 rounded-md object-cover border border-border" />
          <span className="font-bold text-lg" aria-hidden="true">Reqspace</span>
        </Link>
        <button 
          className="text-text-muted hover:text-text p-1" 
          title="Import"
          aria-label="Import collection"
          onClick={() => setShowImportModal(true)}
        >
          <DownloadCloud className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="p-2 border-b border-border flex gap-1">
        <label htmlFor="workspace-select" className="sr-only">Select workspace</label>
        <select 
          id="workspace-select"
          data-testid="workspace-select"
          className="flex-1 p-2 bg-background border border-border rounded text-sm outline-none truncate"
          value={activeWorkspace?._id || ''}
          onChange={(e) => {
            const ws = workspaces.find(w => w._id === e.target.value);
            if (ws) setActiveWorkspace(ws);
          }}
        >
          {workspaces.map(ws => (
            <option key={ws._id} value={ws._id}>{ws.name}</option>
          ))}
        </select>
        <button
          data-testid="new-workspace-btn"
          onClick={async () => {
            const { customPrompt } = await import('../../utils/dialog');
            const { useToastStore } = await import('../../store/toastStore');
            const name = await customPrompt('New Workspace', '', 'Enter new workspace name:', 'Create');
            if (name?.trim()) {
              try {
                const { default: api } = await import('../../api/axios');
                const res = await api.post('/workspaces', { name: name.trim() });
                const newWs = { ...res.data, myRole: 'owner' };
                useAuthStore.getState().setWorkspaces([...workspaces, newWs]);
                setActiveWorkspace(newWs);
              } catch (err) {
                console.error('Failed to create workspace', err);
                useToastStore.getState().addToast('error', 'Failed to create workspace');
              }
            }
          }}
          className="p-2 bg-background border border-border rounded hover:bg-border text-text-muted transition flex-shrink-0"
          title="New Workspace"
          aria-label="Create new workspace"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        </button>
        <button 
          data-testid="workspace-settings-btn"
          onClick={() => setShowWorkspaceModal(true)}
          className="p-2 bg-background border border-border rounded hover:bg-border text-text-muted transition flex-shrink-0"
          title="Workspace Settings"
          aria-label="Workspace settings and members"
        >
          <Users className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex border-b border-border" role="tablist" aria-label="Sidebar panels">
        <button 
          role="tab"
          aria-selected={activeTab === 'collections'}
          aria-controls="panel-collections"
          id="tab-collections"
          className={`flex-1 p-2 flex items-center justify-center gap-1.5 text-xs border-b-2 ${activeTab === 'collections' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text'}`}
          onClick={() => setActiveTab('collections')}
        >
          <FolderOpen className="w-3.5 h-3.5" aria-hidden="true" /> Collections
        </button>
        <button 
          role="tab"
          aria-selected={activeTab === 'environments'}
          aria-controls="panel-environments"
          id="tab-environments"
          data-testid="tab-environments"
          className={`flex-1 p-2 flex items-center justify-center gap-1.5 text-xs border-b-2 ${activeTab === 'environments' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text'}`}
          onClick={() => setActiveTab('environments')}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" /> Envs
        </button>
        <button 
          role="tab"
          aria-selected={activeTab === 'history'}
          aria-controls="panel-history"
          id="tab-history"
          data-testid="tab-history"
          className={`flex-1 p-2 flex items-center justify-center gap-1.5 text-xs border-b-2 ${activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text'}`}
          onClick={() => setActiveTab('history')}
        >
          <Clock className="w-3.5 h-3.5" aria-hidden="true" /> History
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
        <div id="panel-collections" role="tabpanel" aria-labelledby="tab-collections" hidden={activeTab !== 'collections'} className="flex-1 flex flex-col min-h-0">
          {activeTab === 'collections' && <CollectionExplorer />}
        </div>
        <div id="panel-environments" role="tabpanel" aria-labelledby="tab-environments" hidden={activeTab !== 'environments'} className="flex-1 flex flex-col min-h-0">
          {activeTab === 'environments' && <EnvironmentSidebar />}
        </div>
        <div id="panel-history" role="tabpanel" aria-labelledby="tab-history" hidden={activeTab !== 'history'} className="flex-1 flex flex-col min-h-0">
          {activeTab === 'history' && <HistorySidebar />}
        </div>
      </div>

      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold" aria-hidden="true">
              {user?.name.charAt(0).toUpperCase()}
            </div>
            <div className="text-sm">
              <div className="font-semibold">{user?.name}</div>
              <div className="text-xs text-text-muted capitalize">{activeWorkspace?.myRole}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {user?.isSuperAdmin && (
              <Link data-testid="admin-dashboard-link" to="/admin" className="p-1 hover:bg-border rounded text-text-muted hover:text-text transition-colors" title="System Settings" aria-label="System administration settings">
                <Settings className="w-5 h-5" aria-hidden="true" />
              </Link>
            )}
            <button 
              data-testid="logout-btn"
              onClick={handleLogout}
              className="p-1 hover:bg-red-500/10 rounded text-text-muted hover:text-red-400 transition-colors"
              title="Logout"
              aria-label="Log out of your account"
            >
              <LogOut className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {showWorkspaceModal && <WorkspaceSettingsModal onClose={() => setShowWorkspaceModal(false)} />}
      {showImportModal && <ImportModal onClose={() => setShowImportModal(false)} />}
    </nav>
  );
}

