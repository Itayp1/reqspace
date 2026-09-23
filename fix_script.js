const fs = require('fs');
let code = fs.readFileSync('c:/projects/reqspace/fix_dnd_new.js', 'utf8');
code = code.replace(/let content = fs\.readFileSync\(path, 'utf8'\);/g, "let content = fs.readFileSync(path, 'utf8').replace(/\\r\\n/g, '\\n');");
code = code.replace(/function replaceOrThrow\(search, replace, name\) \{/g, "function replaceOrThrow(search, replace, name) { search = search.replace(/\\r\\n/g, '\\n'); replace = replace.replace(/\\r\\n/g, '\\n');");
fs.writeFileSync('c:/projects/reqspace/fix_dnd_new.js', code, 'utf8');
