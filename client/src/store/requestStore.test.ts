import { describe, it, expect, beforeEach } from 'vitest';
import { useRequestStore } from './requestStore';
import { switchUserScope } from './userScope';

switchUserScope('u-test');

describe('requestStore', () => {
  beforeEach(() => {
    localStorage.removeItem('request-storage:u-test');
    useRequestStore.setState({ tabs: [], activeTabId: null, activeRequest: null });
  });

  it('strips secrets on persist', () => {
    useRequestStore.getState().newTab();
    const req = useRequestStore.getState().activeRequest;
    if (req) {
      useRequestStore.getState().updateActiveRequest({
        auth: { type: 'bearer', bearer: { token: 'supersecret' } },
        headers: [{ key: 'Authorization', value: 'Bearer supersecret', enabled: true, type: 'text' }]
      });
    }

    // Force partialize/persist
    const persistedStr = localStorage.getItem('request-storage:u-test');
    expect(persistedStr).toBeDefined();
    if (persistedStr) {
      const persisted = JSON.parse(persistedStr);
      const tab = persisted.state.tabs[0];
      expect(tab.auth.type).toBe('bearer');
      expect(tab.auth.bearer).toBeUndefined();
      expect(tab.headers.find((h: any) => h.key === 'Authorization')?.value).toBe('');
    }
  });

  it('keeps open tabs per user and never shows them to another user', () => {
    useRequestStore.getState().newTab();
    expect(useRequestStore.getState().tabs).toHaveLength(1);
    expect(localStorage.getItem('request-storage:u-test')).toBeTruthy();

    switchUserScope('u-other');
    expect(useRequestStore.getState().tabs).toHaveLength(0);

    useRequestStore.getState().newTab();
    useRequestStore.getState().newTab();
    expect(JSON.parse(localStorage.getItem('request-storage:u-other')!).state.tabs).toHaveLength(2);

    switchUserScope('u-test');
    expect(useRequestStore.getState().tabs).toHaveLength(1);
  });
});
