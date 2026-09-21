import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Settings, Code2, Users, FolderOpen, Clock, DownloadCloud, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import CollectionExplorer from '../collection/CollectionExplorer';
import WorkspaceSettingsModal from '../workspace/WorkspaceSettingsModal';
import HistorySidebar from '../history/HistorySidebar';
import ImportModal from '../collection/ImportModal';
import EnvironmentSidebar from '../environment/EnvironmentSidebar';

export default function Sidebar() {
  const { activeWorkspace, workspaces, setActiveWorkspace, user } = useAuthStore();
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'collections' | 'history' | 'environments'>('collections');

  return (
    <div className="flex flex-col w-64 bg-surface border-r border-border h-full text-sm select-none">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <Link to="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
          <img src="/reqspace-logo.jpg" alt="Reqspace Logo" className="h-8 w-8 rounded-md object-cover border border-border" />
          <span className="font-bold text-lg">Reqspace</span>
        </Link>
        <button 
          className="text-text-muted hover:text-text p-1" 
          title="Import"
          onClick={() => setShowImportModal(true)}
        >
          <DownloadCloud className="w-4 h-4" />
        </button>
      </div>

      <div className="p-2 border-b border-border flex gap-1">
        <select 
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
          onClick={async () => {
            const name = window.prompt('Enter new workspace name:');
            if (name?.trim()) {
              try {
                const { default: api } = await import('../../api/axios');
                const res = await api.post('/workspaces', { name: name.trim() });
                const newWs = { ...res.data, myRole: 'owner' };
                useAuthStore.getState().setWorkspaces([...workspaces, newWs]);
                setActiveWorkspace(newWs);
              } catch (err) {
                console.error('Failed to create workspace', err);
                alert('Failed to create workspace');
              }
            }
          }}
          className="p-2 bg-background border border-border rounded hover:bg-border text-text-muted transition flex-shrink-0"
          title="New Workspace"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        </button>
        <button 
          onClick={() => setShowWorkspaceModal(true)}
          className="p-2 bg-background border border-border rounded hover:bg-border text-text-muted transition flex-shrink-0"
          title="Workspace Settings"
        >
          <Users className="w-4 h-4" />
        </button>
      </div>

      <div className="flex border-b border-border">
        <button 
          className={`flex-1 p-2 flex items-center justify-center gap-1.5 text-xs border-b-2 ${activeTab === 'collections' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text'}`}
          onClick={() => setActiveTab('collections')}
        >
          <FolderOpen className="w-3.5 h-3.5" /> Collections
        </button>
        <button 
          className={`flex-1 p-2 flex items-center justify-center gap-1.5 text-xs border-b-2 ${activeTab === 'environments' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text'}`}
          onClick={() => setActiveTab('environments')}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" /> Envs
        </button>
        <button 
          className={`flex-1 p-2 flex items-center justify-center gap-1.5 text-xs border-b-2 ${activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text'}`}
          onClick={() => setActiveTab('history')}
        >
          <Clock className="w-3.5 h-3.5" /> History
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
        {activeTab === 'collections' && <CollectionExplorer />}
        {activeTab === 'environments' && <EnvironmentSidebar />}
        {activeTab === 'history' && <HistorySidebar />}
      </div>

      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold">
              {user?.name.charAt(0).toUpperCase()}
            </div>
            <div className="text-sm">
              <div className="font-semibold">{user?.name}</div>
              <div className="text-xs text-text-muted capitalize">{activeWorkspace?.myRole}</div>
            </div>
          </div>
          {user?.isSuperAdmin && (
            <Link to="/admin" className="p-1 hover:bg-border rounded">
              <Settings className="w-5 h-5 text-text-muted" />
            </Link>
          )}
        </div>
      </div>

      {showWorkspaceModal && <WorkspaceSettingsModal onClose={() => setShowWorkspaceModal(false)} />}
      {showImportModal && <ImportModal onClose={() => setShowImportModal(false)} />}
    </div>
  );
}


