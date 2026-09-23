import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { ConsoleDrawer } from './ConsoleDrawer';
import { useConsoleStore } from '../../store/consoleStore';
import { Terminal, Menu, X } from 'lucide-react';

export default function MainLayout() {
  const { isOpen, toggleIsOpen, logs } = useConsoleStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col md:flex-row h-screen bg-background text-text overflow-hidden relative">
      {/* Mobile Header with Hamburger */}
      <div className="md:hidden flex items-center justify-between p-3 bg-surface border-b border-border z-10 shrink-0">
        <span className="font-bold">reqSpace</span>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1 text-text-muted hover:text-text">
          {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Overlay */}
      {isSidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-30" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar with mobile overlay */}
      <div className={`
        fixed md:relative top-0 bottom-0 left-0 z-40 transform transition-transform duration-300 ease-in-out md:transform-none bg-surface flex
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <Sidebar />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative z-0">
        <TopBar />
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-hidden">
            <Outlet />
          </div>
          <ConsoleDrawer />
        </div>
        {/* Bottom Status Bar */}
        <div className="h-6 bg-gray-900 border-t border-gray-800 flex items-center justify-between px-3 text-[11px] text-gray-400 select-none shrink-0">
          <button
            onClick={toggleIsOpen}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-gray-800 transition-colors ${
              isOpen ? 'text-blue-400 font-semibold' : 'text-gray-400'
            }`}
          >
            <Terminal size={11} />
            <span>Console</span>
            {logs.length > 0 && (
              <span className="bg-gray-800 px-1 rounded text-[10px] text-gray-300">
                {logs.length}
              </span>
            )}
          </button>
          <div className="flex items-center gap-3 text-gray-500">
            <span>Online</span>
          </div>
        </div>
      </div>
    </div>
  );
}
