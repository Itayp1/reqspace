const fs = require('fs');
const content = fs.readFileSync('IGNORE.md', 'utf8').split('## B ')[1];
const words = content.match(/[a-zA-Z0-9_\-\/]+\.(tsx?|ts|js|jsx)/g) || [];
const words2 = content.match(/[A-Za-z0-9_]+Modal\b/g) || [];
const allWords = [...new Set([...words, ...words2])];

allWords.forEach(file => {
  const name = file.includes('/') ? file.split('/').pop() : file;
  let found = false;
  
  const searchDir = (dir) => {
    if (found) return;
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = dir + '/' + item;
      if (fs.statSync(fullPath).isDirectory()) {
        if (!fullPath.includes('node_modules')) searchDir(fullPath);
      } else {
        if (item === name || item === name + '.tsx' || item === name + '.ts') found = true;
      }
    }
  };
  searchDir('client/src');
  searchDir('server/src');
  if (!found) console.log('Missing:', file);
});
