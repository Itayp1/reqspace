const fs = require('fs');
let code = fs.readFileSync('c:/projects/reqspace/client/src/store/requestStore.ts', 'utf8');

const regex = /export interface KeyValueItem \{[\s\S]*?\}/;
code = code.replace(regex, `export interface KeyValueItem {
  key: string;
  value: string;
  description?: string;
  enabled: boolean;
  type?: 'text'|'file';
  file?: File;
  fileName?: string;
  fileData?: string;
}`);

fs.writeFileSync('c:/projects/reqspace/client/src/store/requestStore.ts', code, 'utf8');
