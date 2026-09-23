const fs = require('fs');

const path = 'c:/projects/reqspace/client/src/components/request/UrlBar.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  '<div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">',
  '<div className="flex flex-col md:flex-row md:items-center gap-2 px-3 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">'
);

code = code.replace(
  '<div className="flex gap-1">',
  '<div className="flex gap-1 w-full md:w-auto justify-end">'
);

code = code.replace(
  '<div className={`flex items-stretch rounded-md border transition-colors',
  '<div className={`flex flex-1 md:flex-none items-stretch rounded-md border transition-colors'
);

code = code.replace(
  'className="flex items-center justify-center gap-2 px-6 py-2 bg-blue-600',
  'className="flex flex-1 md:flex-none items-center justify-center gap-2 px-6 py-2 bg-blue-600'
);

code = code.replace(
  'className="flex items-center justify-center gap-2 px-6 py-2 bg-red-600',
  'className="flex flex-1 md:flex-none items-center justify-center gap-2 px-6 py-2 bg-red-600'
);

fs.writeFileSync(path, code, 'utf8');
