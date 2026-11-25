import { useEnvironmentStore } from '../store/environmentStore';
import { useCollectionStore } from '../store/collectionStore';

export const DYNAMIC_VARS = ['$guid', '$randomUUID', '$timestamp', '$isoTimestamp', '$randomInt', '$randomBoolean', '$randomFirstName', '$randomLastName', '$randomEmail', '$randomColor', '$randomWord'];

/** Names offered by `{{` completion and "Add ENV": enabled global, active-environment and profile variables, then the dynamic ones. */
export function listVariableNames(): { env: string[]; dynamic: string[] } {
  const { environments, activeEnvironmentId, globalEnvironment, userProfileVariables } = useEnvironmentStore.getState();
  const vars = [
    ...(globalEnvironment?.variables || []),
    ...(environments.find(e => e._id === activeEnvironmentId)?.variables || []),
    ...(userProfileVariables || []),
  ].filter(v => v.enabled && v.key);
  return { env: Array.from(new Set(vars.map(v => v.key))), dynamic: DYNAMIC_VARS };
}

export interface NameSuggestion { name: string; tag: string; group: 0 | 1 | 2 }

/**
 * Variable names to offer while typing a variable NAME: the ones already in the list being edited
 * (`current`), then other scopes (global, profile, other environments, collections), then the dynamic ones.
 * `skip` = the scope being edited ('global', 'profile' or an environment id) so it is not suggested twice.
 */
export function suggestVariableNames(query: string, current: string[], currentLabel: string, skip?: string): NameSuggestion[] {
  const { environments, globalEnvironment, userProfileVariables } = useEnvironmentStore.getState();
  const collections = useCollectionStore.getState().collections;
  const seen = new Set<string>();
  const out: NameSuggestion[] = [];
  const add = (names: (string | undefined)[], tag: string, group: 0 | 1 | 2) => {
    for (const name of names) {
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({ name, tag, group });
    }
  };
  add(current, currentLabel, 0);
  if (skip !== 'global') add((globalEnvironment?.variables || []).map(v => v.key), 'Global', 1);
  if (skip !== 'profile') add((userProfileVariables || []).map(v => v.key), 'Profile', 1);
  for (const e of environments) if (e._id !== skip) add((e.variables || []).map(v => v.key), e.name, 1);
  for (const c of collections) add(((c as any).variables || []).map((v: any) => v.key), 'Collection', 1);
  add(DYNAMIC_VARS, 'Dynamic', 2);
  const q = query.trim().toLowerCase();
  const match = out.filter(s => s.name.toLowerCase().includes(q) && s.name.toLowerCase() !== q);
  const rank = (s: NameSuggestion) => s.group * 2 + (s.name.toLowerCase().startsWith(q) ? 0 : 1);
  return match.sort((a, b) => rank(a) - rank(b)).slice(0, 40); // Array.sort is stable
}

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

export type VarScope = 'profile' | 'environment' | 'global';
export interface VarHit { scope: VarScope; value: string; secret: boolean }

/** Every scope that defines `name`, highest precedence first (profile > environment > global). The first hit wins. */
export function resolveWithSource(name: string): VarHit[] {
  const { environments, activeEnvironmentId, globalEnvironment, userProfileVariables } = useEnvironmentStore.getState();
  const activeEnv = environments.find(e => e._id === activeEnvironmentId);
  const last = (vars?: any[]) => vars?.filter(v => v.enabled && v.key === name).pop();
  const hits: VarHit[] = [];
  const add = (scope: VarScope, v: any, value: string) => v && hits.push({ scope, value, secret: v.type === 'secret' || !!v.isSecret });
  const p = last(userProfileVariables);
  add('profile', p, String(p?.value !== undefined ? p.value : (p?.currentValue || '')));
  const e = last(activeEnv?.variables);
  add('environment', e, e?.currentValue || e?.initialValue || '');
  const g = last(globalEnvironment?.variables);
  add('global', g, g?.currentValue || g?.initialValue || '');
  return hits;
}

export function resolveAllVariables(text: string, collectionId?: string, iterationData?: Record<string, any>, localVariables?: Map<string, string>): string {
  if (!text) return '';
  let result = resolveDynamicVars(text);

  const { environments, activeEnvironmentId, globalEnvironment, userProfileVariables } = useEnvironmentStore.getState();
  const activeEnv = environments.find(e => e._id === activeEnvironmentId);

  const envVars = new Map<string, string>();
  if (globalEnvironment?.variables) {
    for (const v of globalEnvironment.variables) {
      if (v.enabled && v.key) envVars.set(v.key, v.currentValue || v.initialValue || '');
    }
  }
  if (activeEnv?.variables) {
    for (const v of activeEnv.variables) {
      if (v.enabled && v.key) envVars.set(v.key, v.currentValue || v.initialValue || '');
    }
  }

  // Collection variables override environment & global variables
  if (collectionId) {
    const { collections } = useCollectionStore.getState();
    const col = collections.find(c => c._id === collectionId);
    if (col?.variables) {
      for (const v of col.variables) {
        if (v.enabled && v.key) envVars.set(v.key, v.value || '');
      }
    }
  }

  // Profile variables are the user's own cross-workspace values, so they sit
  // above collection/environment.
  if (userProfileVariables) {
    for (const v of userProfileVariables) {
      if (v.enabled && v.key) envVars.set(v.key, String(v.value !== undefined ? v.value : (v.currentValue || '')));
    }
  }

  // Iteration data overrides every stored scope (collection, environment, profile)
  if (iterationData) {
    for (const [key, value] of Object.entries(iterationData)) {
      envVars.set(key, String(value));
    }
  }

  // Runtime local variables override everything
  if (localVariables) {
    for (const [key, value] of localVariables.entries()) {
      envVars.set(key, String(value));
    }
  }

  result = result.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
    const trimmed = varName.trim();
    if (trimmed.startsWith('$')) return match; // already handled
    if (envVars.has(trimmed)) {
      // A variable's value may itself hold dynamic ({{$guid}}) placeholders.
      return resolveDynamicVars(envVars.get(trimmed)!);
    }
    return match;
  });

  // Support ReqSpace-style path variables like :id in URLs
  result = result.replace(/(^|[^a-zA-Z0-9_]):([a-zA-Z0-9_]+)/g, (match, prefix, varName) => {
    if (envVars.has(varName)) {
      return prefix + envVars.get(varName)!;
    }
    return match;
  });

  return result;
}
