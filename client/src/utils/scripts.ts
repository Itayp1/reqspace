import { useEnvironmentStore } from '../store/environmentStore';
import { useCollectionStore } from '../store/collectionStore';
import { useConsoleStore } from '../store/consoleStore';
import { executeInSandbox } from '../sandbox/execute';

function snapshotContext(collectionId?: string, iterationData?: Record<string, any>, localVariables = new Map<string, string>()) {
  const { environments, activeEnvironmentId, globalEnvironment } = useEnvironmentStore.getState();
  const activeEnv = environments.find((e) => e._id === activeEnvironmentId);
  const environment: Record<string, string> = {};
  for (const v of activeEnv?.variables || []) if (v.enabled !== false) environment[v.key] = v.currentValue;
  const globals: Record<string, string> = {};
  for (const v of globalEnvironment?.variables || []) if (v.enabled !== false) globals[v.key] = v.currentValue;
  const collectionVariables: Record<string, string> = {};
  if (collectionId) {
    const col = useCollectionStore.getState().collections.find((c) => c._id === collectionId);
    for (const v of col?.variables || []) collectionVariables[v.key] = v.value;
  }
  const locals = Object.fromEntries(localVariables.entries());
  return { environment, globals, collectionVariables, iterationData: iterationData || {}, locals };
}

function applyMutations(mutations: Array<{ scope: string; key: string; value: string }>, collectionId?: string, localVariables?: Map<string, string>) {
  for (const m of mutations) {
    if (m.scope === 'environment') {
      const { environments, activeEnvironmentId, setEnvironments } = useEnvironmentStore.getState();
      const activeEnv = environments.find((e) => e._id === activeEnvironmentId);
      if (!activeEnv) continue;
      const existing = activeEnv.variables.find((v) => v.key === m.key);
      const variables = existing
        ? activeEnv.variables.map((v) => v.key === m.key ? { ...v, currentValue: m.value } : v)
        : [...activeEnv.variables, { key: m.key, initialValue: m.value, currentValue: m.value, isSecret: false, enabled: true }];
      setEnvironments(environments.map((e) => e._id === activeEnv._id ? { ...e, variables } : e));
    }
    if (m.scope === 'globals') {
      const { globalEnvironment, setGlobalEnvironment } = useEnvironmentStore.getState();
      if (!globalEnvironment) continue;
      const existing = globalEnvironment.variables.find((v) => v.key === m.key);
      const variables = existing
        ? globalEnvironment.variables.map((v) => v.key === m.key ? { ...v, currentValue: m.value } : v)
        : [...globalEnvironment.variables, { key: m.key, initialValue: m.value, currentValue: m.value, isSecret: false, enabled: true }];
      setGlobalEnvironment({ ...globalEnvironment, variables });
    }
    if (m.scope === 'local' && localVariables) localVariables.set(m.key, m.value);
    if (m.scope === 'collection' && collectionId) {
      const { collections, setCollections } = useCollectionStore.getState();
      setCollections(collections.map((c) => {
        if (c._id !== collectionId) return c;
        const vars = c.variables || [];
        const existing = vars.find((v: any) => v.key === m.key);
        const variables = existing ? vars.map((v: any) => v.key === m.key ? { ...v, value: m.value } : v) : [...vars, { key: m.key, value: m.value, enabled: true }];
        return { ...c, variables };
      }));
    }
  }
}

function logOutcome(logs: Array<{ level: string; args: any[] }>) {
  for (const entry of logs) {
    const message = entry.args.map((a) => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    useConsoleStore.getState().addLog({ type: entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warn' : 'log', message });
  }
}

export async function runPreRequestScript(script?: string, collectionId?: string, iterationData?: Record<string, any>, localVariables = new Map<string, string>()) {
  if (!script || !script.trim()) return { nextRequest: undefined as string | null | undefined };
  const outcome = await executeInSandbox(script, snapshotContext(collectionId, iterationData, localVariables));
  applyMutations(outcome.mutations, collectionId, localVariables);
  logOutcome(outcome.logs);
  return { nextRequest: outcome.nextRequest };
}

export async function runTestScript(
  script: string | undefined,
  response: { status: number; statusText: string; headers: Record<string, string>; body: string; time: number },
  collectionId?: string,
  iterationData?: Record<string, any>,
  localVariables = new Map<string, string>(),
) {
  if (!script || !script.trim()) return undefined;
  const outcome = await executeInSandbox(script, {
    ...snapshotContext(collectionId, iterationData, localVariables),
    response,
  });
  applyMutations(outcome.mutations, collectionId, localVariables);
  logOutcome(outcome.logs);
  return { testResults: outcome.testResults, visualizerData: outcome.visualizerData, nextRequest: outcome.nextRequest };
}
