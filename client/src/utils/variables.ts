import { useEnvironmentStore } from '../store/environmentStore';
import { useCollectionStore } from '../store/collectionStore';

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

export function resolveAllVariables(text: string, collectionId?: string, iterationData?: Record<string, any>, localVariables?: Map<string, string>): string {
  if (!text) return '';
  let result = resolveDynamicVars(text);

  const { environments, activeEnvironmentId, globalEnvironment, localVariables: storeLocalVars } = useEnvironmentStore.getState();
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

  // Iteration data overrides everything
  if (iterationData) {
    for (const [key, value] of Object.entries(iterationData)) {
      envVars.set(key, String(value));
    }
  }

  // Store local variables override collection and environment
  if (storeLocalVars) {
    for (const v of storeLocalVars) {
      if (v.enabled && v.key) envVars.set(v.key, String(v.value !== undefined ? v.value : (v.currentValue || '')));
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
      return envVars.get(trimmed)!;
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
