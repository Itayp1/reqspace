const fs = require('fs');

const path = 'c:/projects/reqspace/client/src/components/layout/TopBar.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  '<div className="h-12 border-b border-border bg-surface flex items-center justify-end px-4 gap-3">',
  '<div className="min-h-[3rem] py-2 border-b border-border bg-surface flex flex-wrap items-center justify-end px-4 gap-x-3 gap-y-2">'
);

fs.writeFileSync(path, code, 'utf8');
