const fs = require('fs');

// Patch UrlBar.tsx
let urlBarCode = fs.readFileSync('c:/projects/reqspace/client/src/components/request/UrlBar.tsx', 'utf8');

const saveLogic = `  const handleSaveClick = async (isAutoSave = false) => {
    if (!activeRequest) return;
    const canSave = !activeWorkspace || ['editor', 'owner'].includes(activeWorkspace.myRole) || useAuthStore.getState().user?.isSuperAdmin;
    if (!canSave) {
      if (!isAutoSave) alert('You do not have permission to save requests in this workspace.');
      return;
    }
    
    let requestToSave = JSON.parse(JSON.stringify(activeRequest));
    if (requestToSave.body?.mode === 'form-data' && activeRequest.body?.formData) {
       requestToSave.body.formData = await Promise.all(activeRequest.body.formData.map(async (item) => {
         if (item.type === 'file' && item.file) {
           if (item.file.size > 1024 * 1024) {
             throw new Error('File "' + item.file.name + '" exceeds 1MB limit for saving in the database.');
           }
           const base64 = await fileToBase64(item.file);
           return { ...item, fileName: item.file.name, fileData: base64, file: undefined };
         }
         return item;
       }));
    }
    
    if (JSON.stringify(requestToSave).length > 5 * 1024 * 1024) {
       if (!isAutoSave) alert('Cannot save request: Total request payload exceeds the 5MB limit.');
       return;
    }
`;

urlBarCode = urlBarCode.replace(
  `  const handleSaveClick = async (isAutoSave = false) => {
    if (!activeRequest) return;
    const canSave = !activeWorkspace || ['editor', 'owner'].includes(activeWorkspace.myRole) || useAuthStore.getState().user?.isSuperAdmin;
    if (!canSave) {
      if (!isAutoSave) alert('You do not have permission to save requests in this workspace.');
      return;
    }`,
  saveLogic
);

urlBarCode = urlBarCode.replace(
  "        const res = await api.put(`/requests/${activeRequest._id}`, activeRequest);",
  "        try { const res = await api.put(`/requests/${activeRequest._id}`, requestToSave); activeRequest.updatedAt = res.data.updatedAt; } catch(err) { console.error(err); alert(err?.response?.data?.message || 'Failed to save'); throw err; }\n        const res = { data: { updatedAt: activeRequest.updatedAt } };"
);

urlBarCode = urlBarCode.replace(
  "db.requests.update(activeRequest._id, { ...activeRequest });",
  "db.requests.update(activeRequest._id, requestToSave);"
);

// We need to catch the throw from the map! Let's wrap the logic.
// Ah, actually my Promise.all inside handleSaveClick throws, so I must catch it.
urlBarCode = urlBarCode.replace(
  "    let requestToSave = JSON.parse(JSON.stringify(activeRequest));",
  "    let requestToSave = JSON.parse(JSON.stringify(activeRequest));\n    try {"
);
urlBarCode = urlBarCode.replace(
  "       if (!isAutoSave) alert('Cannot save request: Total request payload exceeds the 5MB limit.');\n       return;\n    }",
  "       if (!isAutoSave) alert('Cannot save request: Total request payload exceeds the 5MB limit.');\n       return;\n    } } catch (e: any) { alert(e.message); return; }"
);


urlBarCode = urlBarCode.replace(
  "            const base64 = await fileToBase64(item.file);\n            formDataPayload.push({ type: 'file', key: item.key, filename: item.file.name, content: base64.split(',')[1] });",
  "            const base64 = await fileToBase64(item.file);\n            formDataPayload.push({ type: 'file', key: item.key, filename: item.file.name, content: base64.split(',')[1] });\n          } else if (item.type === 'file' && item.fileData) {\n            formDataPayload.push({ type: 'file', key: item.key, filename: item.fileName || item.key, content: item.fileData.split(',')[1] });"
);

fs.writeFileSync('c:/projects/reqspace/client/src/components/request/UrlBar.tsx', urlBarCode, 'utf8');

// Patch SaveRequestModal.tsx
let saveModalCode = fs.readFileSync('c:/projects/reqspace/client/src/components/request/SaveRequestModal.tsx', 'utf8');
const fileHelper = "import { fileToBase64 } from '../../utils/fileToBase64';\n";
saveModalCode = fileHelper + saveModalCode;

const smLogic = `
      // Check files
      let bodyToSave = activeRequest.body || { mode: 'none' };
      if (bodyToSave.mode === 'form-data' && bodyToSave.formData) {
         try {
           bodyToSave.formData = await Promise.all(bodyToSave.formData.map(async (item: any) => {
             if (item.type === 'file' && item.file instanceof File) {
               if (item.file.size > 1024 * 1024) {
                 throw new Error('File "' + item.file.name + '" exceeds 1MB limit for saving in the database.');
               }
               const base64 = await fileToBase64(item.file);
               return { ...item, fileName: item.file.name, fileData: base64, file: undefined };
             }
             return item;
           }));
         } catch (e: any) {
           alert(e.message);
           setLoading(false);
           return;
         }
      }

      const payload: Record<string, any> = {
        name,
        method: activeRequest.method || 'GET',
        url: activeRequest.url || '',
        params: activeRequest.params || [],
        headers: activeRequest.headers || [],
        auth: activeRequest.auth || { type: 'none' },
        body: bodyToSave,
        folderId: folderId || null
      };

      if (JSON.stringify(payload).length > 5 * 1024 * 1024) {
         alert('Cannot save request: Total request payload exceeds the 5MB limit.');
         setLoading(false);
         return;
      }
`;

saveModalCode = saveModalCode.replace(
  `      // Build a clean payload (not spreading activeRequest directly to avoid TS issues with delete)
      const payload: Record<string, any> = {
        name,
        method: activeRequest.method || 'GET',
        url: activeRequest.url || '',
        params: activeRequest.params || [],
        headers: activeRequest.headers || [],
        auth: activeRequest.auth || { type: 'none' },
        body: activeRequest.body || { mode: 'none' },
        folderId: folderId || null
      };`,
  smLogic
);

fs.writeFileSync('c:/projects/reqspace/client/src/components/request/SaveRequestModal.tsx', saveModalCode, 'utf8');

// Patch KeyValueEditor.tsx
let kvCode = fs.readFileSync('c:/projects/reqspace/client/src/components/request/KeyValueEditor.tsx', 'utf8');
kvCode = kvCode.replace(
  `                    {item.type === 'file' ? (
                      <input
                        type="file"
                        className="w-full p-1 text-xs outline-none bg-transparent"`,
  `                    {item.type === 'file' ? (
                      <div className="w-full p-1 flex items-center gap-2">
                        {(item as any).fileData && !(item as any).file ? (
                           <div className="flex items-center justify-between w-full text-xs">
                             <span className="truncate text-blue-400">[(Saved) {(item as any).fileName}]</span>
                             <button onClick={() => updateItem(i, 'fileData', null)} className="text-gray-400 hover:text-white px-2 py-0.5 border border-gray-600 rounded">Replace</button>
                           </div>
                        ) : (
                          <input
                            type="file"
                            className="w-full text-xs outline-none bg-transparent"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const newItems = [...items];
                                newItems[i] = { ...newItems[i], file };
                                onChange(newItems);
                              }
                            }}
                          />
                        )}
                      </div>
                    ) : (`
);
// Make sure it doesn't leave the old input closing tag around.
kvCode = kvCode.replace(
  `                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const newItems = [...items];
                            newItems[i] = { ...newItems[i], file };
                            onChange(newItems);
                          }
                        }}
                      />
                    ) : (`,
  "" // Handled in the replacement above
);

fs.writeFileSync('c:/projects/reqspace/client/src/components/request/KeyValueEditor.tsx', kvCode, 'utf8');
