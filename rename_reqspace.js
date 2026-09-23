const fs = require('fs');
const path = require('path');

const excludeDirs = ['node_modules', '.git', 'dist', 'dist-electron', 'release', 'test-results', 'playwright-report'];

function replaceContent(content) {
  let newContent = content;
  
  newContent = newContent.replace(/ReqSpaceDB/g, 'ReqSpaceDB');
  newContent = newContent.replace(/reqSpace/g, 'reqSpace');
  newContent = newContent.replace(/reqspace/g, 'reqspace');
  newContent = newContent.replace(/ReqSpace/g, 'ReqSpace');
  newContent = newContent.replace(/reqSpace/g, 'reqSpace');
  newContent = newContent.replace(/REQSPACE/g, 'REQSPACE');
  
  return newContent;
}

const renames = [];

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (excludeDirs.includes(file)) continue;
    
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      walkDir(fullPath);
    } else {
      if (file === 'package-lock.json') continue;
      
      const content = fs.readFileSync(fullPath, 'utf8');
      const newContent = replaceContent(content);
      if (content !== newContent) {
        fs.writeFileSync(fullPath, newContent, 'utf8');
        console.log('Updated content:', fullPath);
      }
    }
    
    // Rename files
    const baseName = path.basename(fullPath);
    if (baseName.toLowerCase().includes('reqspace') || baseName.toLowerCase().includes('api_web')) {
      let newName = baseName.replace(/reqspace/gi, 'reqspace');
      newName = newName.replace(/api_web/gi, 'reqspace');
      const newPath = path.join(path.dirname(fullPath), newName);
      renames.push({ old: fullPath, new: newPath });
    }
  }
}

walkDir('c:/projects/postman');

renames.sort((a, b) => b.old.length - a.old.length);
for (const r of renames) {
  fs.renameSync(r.old, r.new);
  console.log(`Renamed ${r.old} -> ${r.new}`);
}
