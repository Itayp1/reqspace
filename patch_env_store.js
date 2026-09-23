const fs = require('fs');

const path = 'c:/projects/reqspace/client/src/store/environmentStore.ts';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('fetchEnvironments:')) {
  code = code.replace(
    "reorderEnvironments: (items: { id: string; order: number }[]) => Promise<void>;",
    "reorderEnvironments: (items: { id: string; order: number }[]) => Promise<void>;\n  fetchEnvironments: (workspaceId: string) => Promise<void>;"
  );

  code = code.replace(
    "setGlobalEnvironment: (globalEnvironment) => set({ globalEnvironment }),",
    `setGlobalEnvironment: (globalEnvironment) => set({ globalEnvironment }),
  fetchEnvironments: async (workspaceId) => {
    try {
      const api = (await import('../api/axios')).default;
      const res = await api.get(\`/workspaces/\${workspaceId}/environments\`);
      const globals = res.data.filter((e: any) => e.isGlobal);
      const locals = res.data.filter((e: any) => !e.isGlobal);
      set({ globalEnvironment: globals.length > 0 ? globals[0] : null, environments: locals });
    } catch(err) {}
  },`
  );

  fs.writeFileSync(path, code, 'utf8');
}
