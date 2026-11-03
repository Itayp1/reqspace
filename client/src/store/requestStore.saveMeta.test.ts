import { describe, it, expect, beforeEach } from 'vitest';
import { useRequestStore } from './requestStore';

describe('requestStore save metadata', () => {
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

  it('does not re-dirty the tab when a save writes updatedAt', () => {
    useRequestStore.getState().newTab();
    useRequestStore.getState().updateActiveRequest({ url: 'https://one.example' });
    expect(useRequestStore.getState().activeRequest?.isDirty).toBe(true);

    useRequestStore.getState().markSaved();
    useRequestStore.getState().updateActiveRequest({
      updatedAt: 1767225600000,
      isConflicted: false,
      isDirty: false,
    });

    const req = useRequestStore.getState().activeRequest!;
    expect(req.isDirty).toBe(false);
    expect(req.url).toBe('https://one.example');
    expect(req.updatedAt).toBe(1767225600000);

    const tab = useRequestStore.getState().tabs.find(t => t.tabId === req.tabId)!;
    expect(tab.isDirty).toBe(false);
    expect(tab.updatedAt).toBe(1767225600000);
  });
});
