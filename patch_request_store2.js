const fs = require('fs');

const path = 'c:/projects/reqspace/client/src/store/requestStore.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  "updateActiveRequest: (updates: Partial<ActiveRequest>) => void;",
  "updateActiveRequest: (updates: Partial<ActiveRequest>) => void;\n  updateTab: (tabId: string, updates: Partial<ActiveRequest>) => void;"
);

code = code.replace(
  "updateActiveRequest: (updates) => set((state) => {",
  `updateTab: (tabId, updates) => set((state) => {
        const tabs = state.tabs.map(t => t.tabId === tabId ? { ...t, ...updates } : t);
        return { tabs };
      }),
      updateActiveRequest: (updates) => set((state) => {`
);

fs.writeFileSync(path, code, 'utf8');
