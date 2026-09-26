import { describe, it, expect, beforeEach } from 'vitest';
import { useRequestStore } from './requestStore';

describe('requestStore', () => {
  beforeEach(() => {
    localStorage.clear();
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
    const persistedStr = localStorage.getItem('request-storage');
    expect(persistedStr).toBeDefined();
    if (persistedStr) {
      const persisted = JSON.parse(persistedStr);
      const tab = persisted.state.tabs[0];
      expect(tab.auth.type).toBe('bearer');
      expect(tab.auth.bearer).toBeUndefined();
      expect(tab.headers.find((h: any) => h.key === 'Authorization')?.value).toBe('');
    }
  });
});
