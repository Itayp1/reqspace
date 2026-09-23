const fs = require('fs');
let code = fs.readFileSync('c:/projects/reqspace/client/src/components/collection/CollectionExplorer.tsx', 'utf8');

code = code.replace(
  "const handleDropAction = async (\n  targetType: 'collection' | 'folder' | 'request',\n  targetId: string,\n  targetCollectionId: string,\n  targetParentFolderId: string | null,\n  dropPos: 'before' | 'after' | 'inside',\n  store: any\n) => {",
  "const handleDropAction = async (\n  targetType: 'collection' | 'folder' | 'request',\n  targetId: string,\n  targetCollectionId: string,\n  targetParentFolderId: string | null,\n  dropPos: 'before' | 'after' | 'inside',\n  _storeArg: any\n) => {\n  const getStore = () => useCollectionStore.getState();"
);

code = code.replace(/store\.moveRequest/g, "getStore().moveRequest");
code = code.replace(/store\.moveFolder/g, "getStore().moveFolder");
code = code.replace(/store\.collections/g, "getStore().collections");
code = code.replace(/store\.reorderItems/g, "getStore().reorderItems");
code = code.replace(/store\.requests/g, "getStore().requests");
code = code.replace(/store\.folders/g, "getStore().folders");

fs.writeFileSync('c:/projects/reqspace/client/src/components/collection/CollectionExplorer.tsx', code, 'utf8');
