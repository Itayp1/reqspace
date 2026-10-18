/**
 * Small JSONPath evaluator for the response filter: `$`, `.key`, `['key']`,
 * `[0]`, `[-1]`, `.*` / `[*]` and recursive descent (`..key`, `..*`, `..[0]`).
 * Returns every match; throws on a malformed expression.
 */
type Step = { recursive: boolean; kind: 'key' | 'index' | 'wildcard'; key?: string; index?: number };

function parse(expr: string): Step[] {
  let s = expr.trim();
  if (s.startsWith('$')) s = s.slice(1);
  else if (s && s[0] !== '.' && s[0] !== '[') s = '.' + s; // allow bare "a.b"
  const steps: Step[] = [];
  let i = 0;
  while (i < s.length) {
    let recursive = false;
    if (s.startsWith('..', i)) { recursive = true; i += 2; }
    else if (s[i] === '.') i += 1;
    else if (s[i] !== '[') throw new Error(`Unexpected "${s[i]}" at ${i}`);

    if (s[i] === '[') {
      const end = s.indexOf(']', i);
      if (end < 0) throw new Error('Missing ]');
      const inner = s.slice(i + 1, end).trim();
      i = end + 1;
      if (inner === '*') steps.push({ recursive, kind: 'wildcard' });
      else if (/^-?\d+$/.test(inner)) steps.push({ recursive, kind: 'index', index: parseInt(inner, 10) });
      else if (/^(['"]).*\1$/.test(inner)) steps.push({ recursive, kind: 'key', key: inner.slice(1, -1) });
      else throw new Error(`Unsupported selector [${inner}]`);
    } else if (s[i] === '*') {
      steps.push({ recursive, kind: 'wildcard' });
      i += 1;
    } else {
      let j = i;
      while (j < s.length && s[j] !== '.' && s[j] !== '[') j++;
      const key = s.slice(i, j);
      if (!key) throw new Error('Empty key');
      steps.push({ recursive, kind: 'key', key });
      i = j;
    }
  }
  return steps;
}

function children(node: any, step: Step): any[] {
  if (node === null || typeof node !== 'object') return [];
  if (step.kind === 'wildcard') return Array.isArray(node) ? node : Object.values(node);
  if (step.kind === 'index') {
    if (!Array.isArray(node)) return [];
    const idx = step.index! < 0 ? node.length + step.index! : step.index!;
    return idx >= 0 && idx < node.length ? [node[idx]] : [];
  }
  return Object.prototype.hasOwnProperty.call(node, step.key!) ? [node[step.key!]] : [];
}

function descendants(node: any): any[] {
  const out = [node];
  if (node !== null && typeof node === 'object') {
    for (const c of Array.isArray(node) ? node : Object.values(node)) out.push(...descendants(c));
  }
  return out;
}

export function queryJsonPath(root: unknown, expr: string): unknown[] {
  let current: any[] = [root];
  for (const step of parse(expr)) {
    const next: any[] = [];
    for (const node of current) {
      for (const base of step.recursive ? descendants(node) : [node]) next.push(...children(base, step));
    }
    current = next;
  }
  return current;
}

/** True when the expression can yield several results (wildcard or recursive descent). */
export function isMultiPath(expr: string): boolean {
  try {
    return parse(expr).some((st) => st.recursive || st.kind === 'wildcard');
  } catch {
    return false;
  }
}
