import { describe, it, expect, beforeEach } from 'vitest';
import { useRequestStore } from './requestStore';

describe('requestStore dirty edits', () => {
  beforeEach(() => {
    localStorage.clear();
    useRequestStore.setState({
      tabs: [],
      activeTabId: null,
      activeRequest: null,
      activeResponse: null,
      responsesByTab: {},
    });
  });

  it('keeps a second edit on a dirty tab after switching away and back', () => {
    useRequestStore.getState().newTab();
    const firstId = useRequestStore.getState().activeTabId!;
    useRequestStore.getState().updateActiveRequest({ url: 'https://one.example' });
    useRequestStore.getState().updateActiveRequest({ url: 'https://two.example' });

    useRequestStore.getState().newTab();
    useRequestStore.getState().selectTab(firstId);

    const restored = useRequestStore.getState().activeRequest;
    expect(restored?.url).toBe('https://two.example');
    expect(useRequestStore.getState().tabs.find(t => t.tabId === firstId)?.url).toBe('https://two.example');
  });
});
