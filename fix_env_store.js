const fs = require('fs');

const path = 'c:/projects/reqspace/client/src/store/environmentStore.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  'isGlobal: boolean;',
  'isGlobal: boolean;\n  order?: number;'
);

code = code.replace(
  'setGlobalEnvironment: (env: Environment | null) => void;',
  'setGlobalEnvironment: (env: Environment | null) => void;\n  reorderEnvironments: (items: { id: string; order: number }[]) => Promise<void>;'
);

code = code.replace(
  'setGlobalEnvironment: (globalEnvironment) => set({ globalEnvironment }),',
  `setGlobalEnvironment: (globalEnvironment) => set({ globalEnvironment }),
  reorderEnvironments: async (items) => {
    set(state => ({
      environments: state.environments.map(env => {
        const item = items.find(i => i.id === env._id);
        return item ? { ...env, order: item.order } : env;
      }).sort((a, b) => (a.order || 0) - (b.order || 0))
    }));
    const api = (await import('../api/axios')).default;
    await api.put('/environments/reorder', { items });
  },`
);

fs.writeFileSync(path, code, 'utf8');
