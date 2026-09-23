const fs = require('fs');
const path = require('path');

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let newContent = content.replace(/reqSpace/g, 'reqSpace');
  newContent = newContent.replace(/ReqSpace/g, 'reqSpace');
  newContent = newContent.replace(/reqspace/g, 'reqspace');
  
  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('Updated', filePath);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts') || fullPath.endsWith('.html')) {
      replaceInFile(fullPath);
    }
  }
}

walkDir('c:/projects/reqspace/client/src');
walkDir('c:/projects/reqspace/client/public');
replaceInFile('c:/projects/reqspace/client/index.html');
