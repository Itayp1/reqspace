import { create } from 'zustand';

export interface ConsoleLogEntry {
  id: string;
  timestamp: string;
  type: 'request' | 'log' | 'error' | 'warn';
  method?: string;
  url?: string;
  status?: number;
  time?: number;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  message?: string;
}

interface ConsoleStore {
  isOpen: boolean;
  logs: ConsoleLogEntry[];
  setIsOpen: (isOpen: boolean) => void;
  toggleIsOpen: () => void;
  addLog: (log: Omit<ConsoleLogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
}

export const useConsoleStore = create<ConsoleStore>((set) => ({
  isOpen: false,
  logs: [],
  setIsOpen: (isOpen) => set({ isOpen }),
  toggleIsOpen: () => set((state) => ({ isOpen: !state.isOpen })),
  addLog: (log) => set((state) => ({
    logs: [
      ...state.logs,
      {
        ...log,
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
      }
    ]
  })),
  clearLogs: () => set({ logs: [] }),
}));
