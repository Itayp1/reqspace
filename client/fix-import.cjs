const fs = require('fs');
let c = fs.readFileSync('client/src/components/collection/ImportModal.tsx', 'utf8');

const regexImport = /const importReqSpaceCollection = async \(json: any\) => \{[\s\S]*?await fetchCollectionsData\(activeWorkspace\._id\);\r?\n\s+\};/;

const replacementImport = `const importReqSpaceCollection = async (json: any) => {
    if (!activeWorkspace) return;
    const { fetchCollectionsData } = useCollectionStore.getState();
    await api.post('/collections/import', { workspaceId: activeWorkspace._id, collection: json });
    await fetchCollectionsData(activeWorkspace._id);
  };`;

c = c.replace(regexImport, replacementImport);
fs.writeFileSync('client/src/components/collection/ImportModal.tsx', c);
console.log('done client import route');
