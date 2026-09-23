const fs = require('fs');

const path = 'c:/projects/reqspace/client/src/components/environment/EnvironmentTabEditor.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  "if (activeRequest.isConflicted) {",
  "if (activeRequest?.isConflicted) {"
);

fs.writeFileSync(path, code, 'utf8');
