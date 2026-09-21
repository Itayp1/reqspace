const fs = require('fs');

function fixAdminPage() {
  const path = 'client/src/pages/AdminPage.tsx';
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace(
    /key=\{m\.userId\._id\}/g,
    'key={m.userId?._id || Math.random()}'
  );
  content = content.replace(
    /\{m\.userId\.name\}/g,
    '{m.userId?.name || "Deleted User"}'
  );
  content = content.replace(
    /\{m\.userId\.email\}/g,
    '{m.userId?.email || "N/A"}'
  );
  content = content.replace(
    /handleRemove\(m\.userId\._id\)/g,
    'handleRemove(m.userId?._id)'
  );
  content = content.replace(
    /handleChangeRole\(m\.userId\._id/g,
    'handleChangeRole(m.userId?._id'
  );
  fs.writeFileSync(path, content);
}

function fixWorkspaceSettings() {
  const path = 'client/src/components/workspace/WorkspaceSettingsModal.tsx';
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace(
    /key=\{m\.userId\._id\}/g,
    'key={m.userId?._id || Math.random()}'
  );
  content = content.replace(
    /\{m\.userId\.name\}/g,
    '{m.userId?.name || "Deleted User"}'
  );
  content = content.replace(
    /\{m\.userId\.email\}/g,
    '{m.userId?.email || "N/A"}'
  );
  content = content.replace(
    /\{m\.userId\?\.name\?\.charAt\(0\)\.toUpperCase\(\) \|\| '\?'\}/g,
    "{m.userId?.name ? m.userId.name.charAt(0).toUpperCase() : '?'}"
  );
  // Also fix the charAt because the original was {m.userId.name?.charAt(0).toUpperCase()}
  content = content.replace(
    /\{m\.userId\.name\?\.charAt\(0\)\.toUpperCase\(\)\}/g,
    "{m.userId?.name ? m.userId.name.charAt(0).toUpperCase() : '?'}"
  );
  content = content.replace(
    /handleRemove\(m\.userId\._id\)/g,
    'handleRemove(m.userId?._id)'
  );
  content = content.replace(
    /m\.userId\._id/g,
    'm.userId?._id'
  );
  fs.writeFileSync(path, content);
}

fixAdminPage();
fixWorkspaceSettings();
