const fs = require('fs');

const settingsPath = 'c:/projects/reqspace/client/src/components/common/GlobalSettingsModal.tsx';
let settingsCode = fs.readFileSync(settingsPath, 'utf8');

// Remove history toggle from GlobalSettingsModal
const toggleRegex = /<div className="flex items-center justify-between">\s*<div>\s*<label htmlFor="saveHistory"[^>]*>Save Request History<\/label>[\s\S]*?<\/div>[\s\S]*?<input[\s\S]*?id="saveHistory"[\s\S]*?\/>\s*<\/div>/;
settingsCode = settingsCode.replace(toggleRegex, '');

fs.writeFileSync(settingsPath, settingsCode, 'utf8');
