import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../store/authStore';
import { clearSessionFlag, hasSessionFlag, SESSION_FLAG_COOKIE } from './sessionFlag';
import { handleUnauthorizedSession, sessionLocation } from './unauthorizedSession';

function wipeCookies() {
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim();
    if (name) document.cookie = `${name}=; Max-Age=0; path=/`;
  });
}

describe('session flag cookie', () => {
  beforeEach(wipeCookies);
  afterEach(() => {
    wipeCookies();
    vi.restoreAllMocks();
  });

  it('is absent when no cookie is set', () => {
    expect(hasSessionFlag()).toBe(false);
  });

  it('is present when the server cookie is set among others', () => {
    document.cookie = 'theme=dark; path=/';
    document.cookie = `${SESSION_FLAG_COOKIE}=1; path=/`;
    expect(hasSessionFlag()).toBe(true);
  });

  it('does not match a cookie whose name merely ends with the flag name', () => {
    document.cookie = `not_${SESSION_FLAG_COOKIE}=1; path=/`;
    expect(hasSessionFlag()).toBe(false);
  });

  it('clearSessionFlag removes it', () => {
    document.cookie = `${SESSION_FLAG_COOKIE}=1; path=/`;
    clearSessionFlag();
    expect(hasSessionFlag()).toBe(false);
  });

  it('a 401 handled by the unauthorized listener drops the stale flag', () => {
    vi.spyOn(sessionLocation, 'get').mockImplementation(() => ({
      pathname: '/login',
      assign: vi.fn(),
    }));
    useAuthStore.setState({ user: null, isAuthenticated: true, activeWorkspace: null, workspaces: [] });
    document.cookie = `${SESSION_FLAG_COOKIE}=1; path=/`;

    handleUnauthorizedSession();

    expect(hasSessionFlag()).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
