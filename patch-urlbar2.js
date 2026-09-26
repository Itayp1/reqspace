const fs = require('fs');
let code = fs.readFileSync('client/src/components/request/UrlBar.tsx', 'utf8');

if (!code.includes('import { ConfirmModal }')) {
  code = code.replace(/import \{ CodeGenModal \} from '\.\/CodeGenModal';/, "import { CodeGenModal } from './CodeGenModal';\nimport { ConfirmModal } from '../common/ConfirmModal';");
}

if (!code.includes('confirmConfig')) {
  code = code.replace(/const \[isSaveModalOpen, setIsSaveModalOpen\] = useState\(false\);/, "const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);\n  const [confirmConfig, setConfirmConfig] = useState<any>({ isOpen: false, title: '', message: '', confirmLabel: '', onConfirm: () => {}, onCancel: () => {} });");
}

const target = "const overwrite = window.confirm('A newer version of this request exists on the server. Do you want to overwrite it? Click Cancel to save as new.');";
const replacement = `setConfirmConfig({
            isOpen: true,
            title: 'Conflict Detected',
            message: 'A newer version of this request exists on the server. Do you want to overwrite it?',
            confirmLabel: 'Overwrite',
            onConfirm: async () => {
              setConfirmConfig(c => ({ ...c, isOpen: false }));
              try {
                const res = await api.put(\`/requests/\${activeRequest._id}\`, activeRequest);
                updateActiveRequest({ updatedAt: res.data.updatedAt, isConflicted: false });
                import('../../db').then(({ db }) => {
                  if (activeRequest._id) db.requests.update(activeRequest._id, { updatedAt: res.data.updatedAt });
                });
              } catch (err) {
                console.error('Failed to update request', err);
              }
            },
            onCancel: () => {
              setConfirmConfig(c => ({ ...c, isOpen: false }));
              updateActiveRequest({ isConflicted: true, isDirty: true });
            }
          });
          return;`;

const fullBlockStart = code.indexOf(target);
if (fullBlockStart !== -1) {
  // We need to replace from target down to the end of the put block
  const blockStart = code.lastIndexOf('if (remoteReq.updatedAt', fullBlockStart);
  
  // Just use Regex to replace the confirm logic and the PUT below it
  code = code.replace(/const overwrite = window\.confirm[\s\S]*?db\.requests\.update.*?\}\);\n\s*\}\);/m, replacement);
}

if (!code.includes('<ConfirmModal {...confirmConfig} />')) {
  code = code.replace(/<SaveRequestModal\s+isOpen=\{isSaveModalOpen\}/, "{confirmConfig.isOpen && <ConfirmModal {...confirmConfig} />}\n      <SaveRequestModal\n        isOpen={isSaveModalOpen}");
}

fs.writeFileSync('client/src/components/request/UrlBar.tsx', code);
console.log('patched');
