import api from '../api/axios';
import { useAuthStore } from '../store/authStore';
import { useEnvironmentStore } from '../store/environmentStore';
import type { VarScope } from './variables';

/** Sets `name` to `value` in one scope, creating the variable there if it is not defined in it yet. */
export async function saveVariable(scope: VarScope, name: string, value: string): Promise<void> {
  const env = useEnvironmentStore.getState();
  const upsert = (vars: any[], patch: object, created: object) =>
    vars.some(v => v.key === name) ? vars.map(v => (v.key === name ? { ...v, ...patch } : v)) : [...vars, { key: name, enabled: true, type: 'default', ...created }];
  const both = { initialValue: value, currentValue: value };

  if (scope === 'profile') {
    const vars = upsert(env.userProfileVariables, { value }, { value });
    const res = await api.put('/user-profile-variables', { variables: vars });
    env.setUserProfileVariables(res.data.variables || vars);
  } else if (scope === 'environment') {
    const cur = env.environments.find(e => e._id === env.activeEnvironmentId)!;
    const res = await api.put(`/environments/${cur._id}`, { name: cur.name, variables: upsert(cur.variables, both, both) });
    env.applyEnvironmentUpserted(res.data);
  } else {
    const workspaceId = useAuthStore.getState().activeWorkspace!._id;
    const res = await api.put(`/workspaces/${workspaceId}/global-environment`, { variables: upsert(env.globalEnvironment?.variables || [], both, both) });
    env.setGlobalEnvironment({ ...res.data, isGlobal: true });
  }
}
