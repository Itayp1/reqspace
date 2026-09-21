import React, { createContext, useContext, useState } from 'react';
import { ContextMenu } from './ContextMenu';

interface ContextMenuConfig {
  x: number;
  y: number;
  items: { label: string; onClick: () => void; danger?: boolean; icon?: React.ReactNode }[];
}

interface ContextMenuContextType {
  showContextMenu: (config: ContextMenuConfig) => void;
  hideContextMenu: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextType | null>(null);

export const useContextMenu = () => {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) throw new Error('useContextMenu must be used within ContextMenuProvider');
  return ctx;
};

export const ContextMenuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<ContextMenuConfig | null>(null);

  return (
    <ContextMenuContext.Provider value={{ showContextMenu: setConfig, hideContextMenu: () => setConfig(null) }}>
      {children}
      {config && (
        <ContextMenu
          x={config.x}
          y={config.y}
          items={config.items}
          onClose={() => setConfig(null)}
        />
      )}
    </ContextMenuContext.Provider>
  );
};
