const fs = require('fs');
const path = 'client/src/components/workspace/WorkspaceSettingsModal.tsx';
let content = fs.readFileSync(path, 'utf8');

// Restore the X button
content = content.replace(
  /<h2 className="text-lg font-bold">Workspace Settings<\/h2>\s*<\/div>/,
  '<h2 className="text-lg font-bold">Workspace Settings</h2>\n          <button onClick={onClose} className="p-1 hover:bg-border rounded"><X className="w-5 h-5" /></button>\n        </div>'
);

// We need to restore the tabs container since I might have deleted it!
content = content.replace(
  /<\/div>\s*<div className="flex-1 overflow-y-auto p-4">/,
  '</div>\n\n        <div className="flex border-b border-border">\n          <button \n            className={px-4 py-2 font-medium }\n            onClick={() => setActiveTab(\'general\')}\n          >\n            Workspace\n          </button>\n          <button \n            className={px-4 py-2 font-medium }\n            onClick={() => setActiveTab(\'members\')}\n          >\n            Members\n          </button>\n        </div>\n\n        <div className="flex-1 overflow-y-auto p-4">'
);

fs.writeFileSync(path, content);
