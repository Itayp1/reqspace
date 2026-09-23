const fs = require('fs');

const path = 'c:/projects/reqspace/client/src/store/requestStore.ts';
let code = fs.readFileSync(path, 'utf8');

// Add interface definition
code = code.replace(
  "closeOtherTabs: (tabId: string) => void;",
  "closeOtherTabs: (tabId: string) => void;\n  reorderTabs: (draggedId: string, targetId: string, pos: 'before'|'after') => void;"
);

// Add implementation
const impl = `      reorderTabs: (draggedId, targetId, pos) => set((state) => {
        const tabs = [...state.tabs];
        const draggedIdx = tabs.findIndex(t => t.tabId === draggedId);
        if (draggedIdx === -1) return state;
        const [draggedTab] = tabs.splice(draggedIdx, 1);
        
        const targetIdx = tabs.findIndex(t => t.tabId === targetId);
        if (targetIdx === -1) {
          tabs.push(draggedTab);
          return { tabs };
        }
        
        const insertIdx = pos === 'before' ? targetIdx : targetIdx + 1;
        tabs.splice(insertIdx, 0, draggedTab);
        return { tabs };
      }),
`;

code = code.replace(
  "undo: () => set((state) => {",
  impl + "\n      undo: () => set((state) => {"
);

fs.writeFileSync(path, code, 'utf8');
