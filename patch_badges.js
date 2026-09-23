const fs = require('fs');

const path = 'c:/projects/reqspace/client/src/components/request/RequestEditor.tsx';
let code = fs.readFileSync(path, 'utf8');

// We need to import useCollectionStore if not already imported
if (!code.includes('useCollectionStore')) {
  code = code.replace(
    "import { useRequestStore } from '../../store/requestStore';",
    "import { useRequestStore } from '../../store/requestStore';\nimport { useCollectionStore } from '../../store/collectionStore';"
  );
}

// Replace the badge helpers
const badgeLogicSearch = `  // Badge helpers
  const activeParamCount = (activeRequest.params || []).filter(p => p.enabled && p.key).length;
  const activeHeaderCount = (activeRequest.headers || []).filter(h => h.enabled && h.key).length;
  const hasAuth = activeRequest.auth?.type && activeRequest.auth.type !== 'none';
  const hasBody = activeRequest.body?.mode && activeRequest.body.mode !== 'none';
  const hasPreScript = !!activeRequest.preRequestScript?.trim();
  const hasTests = !!activeRequest.testScript?.trim();

  const tabBadge = (tab: TabType): string | null => {
    if (tab === 'Params' && activeParamCount > 0) return String(activeParamCount);
    if (tab === 'Headers' && activeHeaderCount > 0) return String(activeHeaderCount);
    if (tab === 'Authorization' && hasAuth) return '●';
    if (tab === 'Body' && hasBody) return '●';
    if (tab === 'Pre-request Script' && hasPreScript) return '●';
    if (tab === 'Tests' && hasTests) return '●';
    return null;
  };`;

const badgeLogicReplace = `  // Badge & Dirty helpers
  const savedRequest = useCollectionStore(state => state.requests.find(r => r._id === activeRequest._id));
  
  const isDirtyJSON = (a: any, b: any) => {
    const cleanA = JSON.parse(JSON.stringify(a || {}));
    const cleanB = JSON.parse(JSON.stringify(b || {}));
    return JSON.stringify(cleanA) !== JSON.stringify(cleanB);
  };

  const checkDirty = (tab: TabType) => {
    if (!activeRequest.isDirty) return false;
    if (!savedRequest) return true; // new request, everything is dirty if the request is dirty
    
    switch (tab) {
      case 'Params':
        return isDirtyJSON(activeRequest.params, savedRequest.params);
      case 'Headers':
        return isDirtyJSON(activeRequest.headers, savedRequest.headers);
      case 'Authorization':
        return isDirtyJSON(activeRequest.auth, savedRequest.auth);
      case 'Body': {
        const cleanA = { ...activeRequest.body };
        if (cleanA.formData) cleanA.formData = cleanA.formData.map(i => ({ ...i, file: undefined }));
        const cleanB = { ...savedRequest.body };
        if (cleanB.formData) cleanB.formData = cleanB.formData.map(i => ({ ...i, file: undefined }));
        return isDirtyJSON(cleanA, cleanB);
      }
      case 'Pre-request Script':
        return (activeRequest.preRequestScript || '') !== (savedRequest.preRequestScript || '');
      case 'Tests':
        return (activeRequest.testScript || '') !== (savedRequest.testScript || '');
      case 'Settings':
        return isDirtyJSON(activeRequest.settings, savedRequest.settings);
      default:
        return false;
    }
  };

  const activeParamCount = (activeRequest.params || []).filter(p => p.enabled && p.key).length;
  const activeHeaderCount = (activeRequest.headers || []).filter(h => h.enabled && h.key).length;

  const tabBadge = (tab: TabType) => {
    const isDirty = checkDirty(tab);
    let count: string | null = null;
    
    if (tab === 'Params' && activeParamCount > 0) count = String(activeParamCount);
    if (tab === 'Headers' && activeHeaderCount > 0) count = String(activeHeaderCount);
    
    return { count, isDirty };
  };`;

code = code.replace(badgeLogicSearch, badgeLogicReplace);

// Now update the render logic for the badge
const renderLogicSearch = `              {badge && (
                <span className={\`text-xs font-mono rounded \${activeTab === tab ? 'text-orange-500' : 'text-gray-400'}\`}>
                  {badge}
                </span>
              )}`;

const renderLogicReplace = `              {badge.count && (
                <span className={\`text-xs font-mono rounded \${activeTab === tab ? 'text-orange-500' : 'text-gray-400'}\`}>
                  {badge.count}
                </span>
              )}
              {badge.isDirty && (
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0 ml-0.5" title="Unsaved changes in this tab" />
              )}`;

code = code.replace(renderLogicSearch, renderLogicReplace);

// Let's also fix the mapping where it uses badge
code = code.replace('const badge = tabBadge(tab);', 'const badge = tabBadge(tab);');

fs.writeFileSync(path, code, 'utf8');
