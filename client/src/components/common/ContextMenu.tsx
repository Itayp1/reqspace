import React, { useEffect, useRef, useState } from 'react';
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
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => onClose();
    const handleClick = () => onClose();
    const handleScroll = () => onClose();
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // A right/middle click elsewhere fires no 'click', so also close on any press outside the menu, and on blur (alt-tab, iframe).
    const handlePointerDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('blur', handleResize);
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
      document.removeEventListener('mousedown', handlePointerDown, true);
      window.removeEventListener('blur', handleResize);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [x, y, items, onClose]);

  return createPortal(
    <div
      ref={menuRef}
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
          className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary transition-colors ${
            item.danger
              ? 'text-red-600 dark:text-red-400 hover:bg-red-500/15 focus-visible:bg-red-500/15 hover:text-red-700 focus-visible:text-red-700 dark:hover:text-red-300 dark:focus-visible:text-red-300'
              : 'text-text hover:bg-primary/15 focus-visible:bg-primary/15 hover:text-primary-strong focus-visible:text-primary-strong dark:hover:text-primary dark:focus-visible:text-primary'
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
