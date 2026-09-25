const fs = require('fs');
let c = fs.readFileSync('client/src/components/collection/CollectionExplorer.tsx', 'utf8');

const regexExport = /const exportCollection = \(id: string, name: string\) => \{[\s\S]*?URL\.revokeObjectURL\(url\);\r?\n\s+\};/;

const replacementExport = `const exportCollection = async (id: string, name: string) => {
    try {
      const res = await fetch(\`/api/collections/\${id}/export?includeSecrets=false\`);
      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = \`\${name.replace(/\\s+/g, '_')}.reqSpace_collection.json\`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error', err);
    }
  };`;

c = c.replace(regexExport, replacementExport);
fs.writeFileSync('client/src/components/collection/CollectionExplorer.tsx', c);
console.log('done client export');
