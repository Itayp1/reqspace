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
  }[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    const handleResize = () => onClose();
    const handleClick = () => onClose();
    const handleScroll = () => onClose();
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('click', handleClick);
    window.addEventListener('scroll', handleScroll, true);

    // Ensure menu stays within viewport (clamp both edges, not just overflow correction)
    const menuWidth = 160;
    const menuHeight = items.length * 36;
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
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [x, y, items, onClose]);

  return createPortal(
    <div
      className="fixed z-[9999] w-40 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-md"
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => (
        <button
          key={i}
          className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
            item.danger ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200'
          }`}
          onClick={() => {
            item.onClick();
            onClose();
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  );
}
