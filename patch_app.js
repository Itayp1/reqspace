const fs = require('fs');

const path = 'c:/projects/reqspace/client/src/App.tsx';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('import { SocketSync }')) {
  code = code.replace(
    "import MainLayout from './components/layout/MainLayout';",
    "import MainLayout from './components/layout/MainLayout';\nimport { SocketSync } from './components/common/SocketSync';"
  );
}

code = code.replace(
  "<ForcePasswordChangeModal />",
  "<ForcePasswordChangeModal />\n      <SocketSync />"
);

fs.writeFileSync(path, code, 'utf8');
