const fs = require('fs');
const content = fs.readFileSync('IGNORE.md', 'utf8');
const files = content.match(/[\w\.\/]+\.(tsx|ts)/g) || [];
files.forEach(file => {
  const name = file.split('/').pop();
  let found = false;
  
  const searchDir = (dir) => {
    if (found) return;
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = dir + '/' + item;
      if (fs.statSync(fullPath).isDirectory()) {
        if (!fullPath.includes('node_modules')) searchDir(fullPath);
      } else {
        if (item === name) found = true;
      }
    }
  };
  searchDir('client/src');
  searchDir('server/src');
  if (!found) console.log('Missing:', file);
});
