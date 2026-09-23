const fs = require('fs');

const path = 'c:/projects/reqspace/client/src/components/collection/CollectionExplorer.tsx';
let code = fs.readFileSync(path, 'utf8');

// Replacements to support light/dark mode
code = code.replace(/text-gray-300/g, 'text-text');
code = code.replace(/bg-gray-900/g, 'bg-surface');
code = code.replace(/bg-gray-800/g, 'bg-background border border-border');
code = code.replace(/text-gray-400/g, 'text-text-muted');
code = code.replace(/hover:bg-gray-700/g, 'hover:bg-border');
code = code.replace(/hover:text-white/g, 'hover:text-text');
code = code.replace(/bg-white dark:bg-gray-800/g, 'bg-surface');
code = code.replace(/border-gray-200 dark:border-gray-700/g, 'border-border');
code = code.replace(/bg-gray-100 dark:hover:bg-gray-700/g, 'bg-border');
code = code.replace(/hover:bg-gray-100 dark:hover:bg-gray-700/g, 'hover:bg-border');
code = code.replace(/text-gray-800 dark:text-gray-200/g, 'text-text');
code = code.replace(/text-gray-600/g, 'text-text');
code = code.replace(/bg-gray-700/g, 'bg-border');
code = code.replace(/text-gray-100/g, 'text-text');
code = code.replace(/bg-background border border-border/g, 'bg-background'); // cleanup double borders if any
code = code.replace(/bg-background/g, 'bg-background');

fs.writeFileSync(path, code, 'utf8');
