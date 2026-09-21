const fs = require('fs');

const path = 'client/src/components/workspace/WorkspaceSettingsModal.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Remove settings state & useSettingsStore
content = content.replace(/const { settings, updateSettings } = useSettingsStore\(\);\n/, '');
content = content.replace(/import { useSettingsStore } from '\.\.\/\.\.\/store\/settingsStore';\n/, '');

// 2. Fix activeTab
content = content.replace(/useState<'general' \| 'members' \| 'settings'>\('general'\)/, "useState<'general' | 'members'>('general')");

// 3. Remove Settings tab button
const btnRegex = /<button[\s\S]*?onClick=\{\(\) => setActiveTab\('settings'\)\}[\s\S]*?<\/button>/;
content = content.replace(btnRegex, '');

// 4. Remove Settings tab content
const contentRegex = /\{activeTab === 'settings' && \([\s\S]*?(?=\s*<\/div>\s*<\/div>\s*<\/div>,\s*document\.body)/;
content = content.replace(contentRegex, '');

// 5. Change "Settings" title back to "Workspace Settings" if it was changed
content = content.replace(/<h2 className="text-lg font-bold">Settings<\/h2>/, '<h2 className="text-lg font-bold">Workspace Settings</h2>');

fs.writeFileSync(path, content);
