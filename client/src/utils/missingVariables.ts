export interface MissingVariable { name: string; usedIn: string[] }

interface Source { label: string; fields: Record<string, unknown> }

const FIELD_LABELS: Record<string, string> = {
  url: 'URL', params: 'Params', headers: 'Headers', auth: 'Auth', body: 'Body',
  preRequestScript: 'Pre-request script', testScript: 'Tests',
};

// Disabled params/headers are not sent, so a variable only they use is not needed.
const sendable = (v: unknown) => (Array.isArray(v) ? v.filter((i) => i?.enabled !== false) : v);

/**
 * `{{name}}` references in the run's requests, their folders and the collection that no scope has a
 * record for. A record counts even when its value is empty (or it is disabled): only a name with no
 * record anywhere is reported. Dynamic `{{$x}}` names, iteration-data columns and names a script
 * assigns (`pm.environment.set('x', ...)`) are never reported.
 */
export function findMissingVariables(
  sources: Source[],
  definedKeys: Iterable<string>,
): MissingVariable[] {
  const defined = new Set(definedKeys);
  const found = new Map<string, Set<string>>();
  const scriptSet = new Set<string>();

  for (const { label, fields } of sources) {
    for (const [field, raw] of Object.entries(fields)) {
      if (raw == null || raw === '') continue;
      const text = typeof raw === 'string' ? raw : JSON.stringify(sendable(raw));
      if (field === 'preRequestScript' || field === 'testScript') {
        for (const m of text.matchAll(/\.set\(\s*['"]([^'"]+)['"]/g)) scriptSet.add(m[1].trim());
      }
      for (const m of text.matchAll(/\{\{([^{}]+)\}\}/g)) {
        const name = m[1].trim();
        if (!name || name.startsWith('$')) continue;
        const where = `${label} › ${FIELD_LABELS[field] ?? field}`;
        (found.get(name) ?? found.set(name, new Set()).get(name)!).add(where);
      }
    }
  }

  return [...found]
    .filter(([name]) => !defined.has(name) && !scriptSet.has(name))
    .map(([name, where]) => ({ name, usedIn: [...where] }));
}
