const fs = require('fs');

let path = 'c:/projects/reqspace/client/src/components/collection/CollectionExplorer.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  "return y < rect.height / 2 ? 'before' : 'after';",
  "return y < rect.height / 2 ? 'before' : 'after';"
);
code = code.replace(
  "if (y < rect.height * 0.25 && allowedTypes.includes('before')) return 'before';\n    if (y > rect.height * 0.75 && allowedTypes.includes('after')) return 'after';\n    return 'inside';",
  "if (y < rect.height * 0.35 && allowedTypes.includes('before')) return 'before';\n    if (y > rect.height * 0.65 && allowedTypes.includes('after')) return 'after';\n    return 'inside';"
);

fs.writeFileSync(path, code, 'utf8');

// Patch TopBar.tsx
path = 'c:/projects/reqspace/client/src/components/layout/TopBar.tsx';
code = fs.readFileSync(path, 'utf8');

code = code.replace(
  '<option value="">No Environment</option>',
  '<option className="bg-white dark:bg-gray-800 text-black dark:text-white" value="">No Environment</option>'
);
code = code.replace(
  '<option key={env._id} value={env._id}>{env.name}</option>',
  '<option className="bg-white dark:bg-gray-800 text-black dark:text-white" key={env._id} value={env._id}>{env.name}</option>'
);

// Eye icon slow fix
code = code.replace(
  'const activeVars = activeEnv?.variables.filter(v => v.enabled) || [];',
  'const activeVars = (activeEnv?.variables.filter(v => v.enabled) || []).slice(0, 50);'
);
code = code.replace(
  'const globalVars = globalEnvironment?.variables.filter(v => v.enabled) || [];',
  'const globalVars = (globalEnvironment?.variables.filter(v => v.enabled) || []).slice(0, 50);'
);

fs.writeFileSync(path, code, 'utf8');

// Patch UrlBar.tsx
path = 'c:/projects/reqspace/client/src/components/request/UrlBar.tsx';
code = fs.readFileSync(path, 'utf8');

code = code.replace(
  '<option key={m} value={m}>{m}</option>',
  '<option className="bg-white dark:bg-gray-800 text-black dark:text-white" key={m} value={m}>{m}</option>'
);

fs.writeFileSync(path, code, 'utf8');
