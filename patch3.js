const fs = require('fs');
let code = fs.readFileSync('client/src/components/request/UrlBar.tsx', 'utf8');

const target1 = "          const overwrite = window.confirm('A newer version of this request exists on the server. Do you want to overwrite it? Click Cancel to save as new.');\n          if (!overwrite) {\n            updateActiveRequest({ isConflicted: true, isDirty: true }); // revert isDirty so user can decide\n            return;\n          }";
const target2 = "          const overwrite = window.confirm('A newer version of this request exists on the server. Do you want to overwrite it? Click Cancel to save as new.');\r\n          if (!overwrite) {\r\n            updateActiveRequest({ isConflicted: true, isDirty: true }); // revert isDirty so user can decide\r\n            return;\r\n          }";

const replacement = `          setConfirmConfig({
            isOpen: true,
            title: 'Conflict Detected',
            message: 'A newer version of this request exists on the server. Do you want to overwrite it?',
            confirmLabel: 'Overwrite',
            onConfirm: async () => {
              setConfirmConfig((c: any) => ({ ...c, isOpen: false }));
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
              setConfirmConfig((c: any) => ({ ...c, isOpen: false }));
              updateActiveRequest({ isConflicted: true, isDirty: true }); // revert isDirty so user can decide
            }
          });
          return;`;

code = code.replace(target1, replacement).replace(target2, replacement);
fs.writeFileSync('client/src/components/request/UrlBar.tsx', code);
console.log('patched window.confirm');
