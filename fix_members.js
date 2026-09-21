const fs = require('fs');

const path = 'client/src/components/workspace/WorkspaceSettingsModal.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace setMembers(res.data.members) with a refresh call.
// First, inject the refresh function after useEffect
const refreshFunc = 
  const refreshMembers = async () => {
    try {
      const res = await api.get(\/workspaces/\\);
      setMembers(res.data.members || []);
    } catch (e) {
      console.error(e);
    }
  };
;

content = content.replace(
  /useEffect\(\(\) => \{[\s\S]*?\}, \[activeWorkspace\]\);/,
  match => match + '\n' + refreshFunc
);

// Replace setMembers(res.data.members) inside handleAddMember
content = content.replace(
  /const res = await api\.post\([\s\S]*?;\n\s*setMembers\(res\.data\.members\);/g,
  match => match.replace('setMembers(res.data.members);', 'await refreshMembers();')
);

// Replace setMembers(res.data.members) inside handleRemove
content = content.replace(
  /const res = await api\.delete\([\s\S]*?;\n\s*setMembers\(res\.data\.members\);/g,
  match => match.replace('setMembers(res.data.members);', 'await refreshMembers();')
);

// Replace setMembers(res.data.members) inside PUT (role change)
content = content.replace(
  /const res = await api\.put\(\\/workspaces\/\\/members\/\\[\s\S]*?;\n\s*setMembers\(res\.data\.members\);/g,
  match => match.replace('setMembers(res.data.members);', 'await refreshMembers();')
);

fs.writeFileSync(path, content);
