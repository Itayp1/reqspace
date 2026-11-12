import { loginSchema, registerSchema } from '../schemas/auth.schemas';

describe('loginSchema email handling', () => {
  it('trims surrounding spaces (A1.6)', () => {
    const r = loginSchema.safeParse({ email: '  a@b.com  ', password: 'x' });
    expect(r.success && r.data.email).toBe('a@b.com');
  });
  it('accepts a bare username', () => {
    expect(loginSchema.safeParse({ email: 'admin', password: 'x' }).success).toBe(true);
  });
  it.each(['a@', '@b.com', 'a@b'])('rejects malformed email %s (A1.7)', (email) => {
    expect(loginSchema.safeParse({ email, password: 'x' }).success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('trims email and name, rejects overlong names (A2.5)', () => {
    const ok = registerSchema.safeParse({ name: ' Bob ', email: ' b@c.com ', password: '12345678' });
    expect(ok.success && ok.data.email).toBe('b@c.com');
    expect(ok.success && ok.data.name).toBe('Bob');
    expect(registerSchema.safeParse({ name: 'n'.repeat(3000), email: 'b@c.com', password: '12345678' }).success).toBe(false);
  });
});
