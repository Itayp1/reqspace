import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../store/authStore';
import { installUnauthorizedSessionListener, sessionLocation } from './unauthorizedSession';

const user = {
  id: 'u1',
  name: 'Test User',
  email: 'test@example.com',
  isSuperAdmin: false,
};

describe('unauthorized session', () => {
  const assign = vi.fn();

  beforeEach(() => {
    assign.mockClear();
    // jsdom will not navigate and Location.assign cannot be replaced.
    // The handler still reads pathname from the real location object.
    vi.spyOn(sessionLocation, 'get').mockImplementation(() => ({
      pathname: window.location.pathname,
      assign,
    }));
    installUnauthorizedSessionListener();
    useAuthStore.setState({
      user,
      isAuthenticated: true,
      activeWorkspace: null,
      workspaces: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/');
  });

  it('clears the auth user and navigates to /login when unauthorized on /', () => {
    window.history.pushState({}, '', '/');

    window.dispatchEvent(new CustomEvent('unauthorized'));

    expect(window.location.pathname).toBe('/');
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('does not navigate again when unauthorized on /login', () => {
    window.history.pushState({}, '', '/login');

    window.dispatchEvent(new CustomEvent('unauthorized'));

    expect(window.location.pathname).toBe('/login');
    expect(assign).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
