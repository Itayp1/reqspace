import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ContextMenuProps {
  x: number;
  y: number;
  items: {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
    /** Draw a divider above this item (groups create / manage / share / delete). */
    separator?: boolean;
  }[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    const handleResize = () => onClose();
    const handleClick = () => onClose();
    const handleScroll = () => onClose();
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    window.addEventListener('click', handleClick);
    window.addEventListener('scroll', handleScroll, true);

    // Ensure menu stays within viewport (clamp both edges, not just overflow correction)
    const menuWidth = 160;
    const menuHeight = Math.min(items.length * 36 + items.filter(i => i.separator).length * 9 + 8, window.innerHeight - 8);
    let newX = x;
    let newY = y;

    if (x + menuWidth > window.innerWidth) {
      newX = x - menuWidth;
    }
    if (y + menuHeight > window.innerHeight) {
      newY = y - menuHeight;
    }
    newX = Math.max(4, Math.min(newX, window.innerWidth - menuWidth - 4));
    newY = Math.max(4, Math.min(newY, window.innerHeight - menuHeight - 4));
    setPosition({ x: newX, y: newY });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [x, y, items, onClose]);

  return createPortal(
    <div
      role="menu"
      className="fixed z-[9999] w-40 py-1 max-h-[calc(100vh-8px)] overflow-y-auto bg-background border border-border shadow-xl rounded-md"
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => (
        <React.Fragment key={i}>
        {item.separator && i > 0 && <div role="separator" data-testid="context-menu-separator" className="my-1 border-t border-border" />}
        <button
          role="menuitem"
          data-testid="context-menu-item"
          className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-surface focus-visible:outline-none focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary transition-colors ${
            item.danger ? 'text-red-600 dark:text-red-400' : 'text-text'
          }`}
          onClick={() => {
            item.onClick();
            onClose();
          }}
        >
          {item.icon}
          {item.label}
        </button>
        </React.Fragment>
      ))}
    </div>,
    document.body
  );
}
