const fs = require('fs');

const path = 'c:/projects/reqspace/client/src/components/environment/EnvironmentTabEditor.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  "const handleSave = async () => {\n    if (!env) return;\n    try {",
  "const handleSave = async () => {\n    if (!env) return;\n    try {\n      if (activeRequest.isConflicted) {\n        const overwrite = window.confirm('A newer version of this environment exists on the server. Do you want to overwrite it?');\n        if (!overwrite) return;\n      }"
);

fs.writeFileSync(path, code, 'utf8');
