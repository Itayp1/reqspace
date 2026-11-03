import { Response } from 'express';
import { setCookieToken, clearAuthCookie, SESSION_FLAG_COOKIE } from '../middleware/auth';

function mockRes() {
  const res = { cookie: jest.fn(), clearCookie: jest.fn() };
  return res as unknown as Response & typeof res;
}

describe('session flag cookie', () => {
  it('sets an httpOnly token and a script-readable flag with no identity in it', () => {
    const res = mockRes();
    setCookieToken(res, 'jwt-value', 7);

    const calls = res.cookie.mock.calls as [string, string, Record<string, unknown>][];
    const token = calls.find(([name]) => name === 'token')!;
    const flag = calls.find(([name]) => name === SESSION_FLAG_COOKIE)!;

    expect(token[1]).toBe('jwt-value');
    expect(token[2].httpOnly).toBe(true);

    expect(flag[1]).toBe('1');
    expect(flag[2].httpOnly).toBe(false);
    expect(flag[2].sameSite).toBe('lax');
    expect(flag[2].path).toBe('/');
    // Expires together with the session it mirrors.
    expect(flag[2].maxAge).toBe(token[2].maxAge);
  });

  it('clears both cookies with the attributes they were set with', () => {
    const res = mockRes();
    clearAuthCookie(res);

    const calls = res.clearCookie.mock.calls as [string, Record<string, unknown>][];
    expect(calls.map(([name]) => name).sort()).toEqual(['token', SESSION_FLAG_COOKIE].sort());
    expect(calls.find(([n]) => n === 'token')![1].httpOnly).toBe(true);
    expect(calls.find(([n]) => n === SESSION_FLAG_COOKIE)![1].httpOnly).toBe(false);
  });
});
