// Pure (no stores) so the sandbox worker can import it for pm.*.replaceIn.
export function resolveDynamicVars(text: string): string {
  if (!text) return '';
  return text.replace(/\{\{(\$[^}]+)\}\}/g, (_, varName) => {
    switch (varName) {
      case '$guid':
      case '$randomUUID':
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
      case '$timestamp':
        return String(Math.floor(Date.now() / 1000));
      case '$isoTimestamp':
        return new Date().toISOString();
      case '$randomInt':
        return String(Math.floor(Math.random() * 1000));
      case '$randomBoolean':
        return String(Math.random() > 0.5);
      case '$randomFirstName': {
        const names = ['Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace', 'Henry'];
        return names[Math.floor(Math.random() * names.length)];
      }
      case '$randomLastName': {
        const names = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller'];
        return names[Math.floor(Math.random() * names.length)];
      }
      case '$randomEmail': {
        const user = Math.random().toString(36).substring(2, 8);
        return `${user}@example.com`;
      }
      case '$randomColor':
        return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
      case '$randomWord': {
        const words = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'test', 'sample'];
        return words[Math.floor(Math.random() * words.length)];
      }
      default:
        return `{{${varName}}}`;
    }
  });
}
