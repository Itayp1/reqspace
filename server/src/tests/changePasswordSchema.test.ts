import { changePasswordSchema } from '../schemas/auth.schemas';

// TEST-1 trap: the forced first-login password change (mustChangePassword)
// is exempt from proving the current password — see routes/auth.ts's
// handler. Making currentPassword required in the schema rejects that
// request with 400 before the handler's own exemption ever runs, which
// breaks both ForcePasswordChangeModal.tsx (which only ever sends
// newPassword) and the Playwright/e2e fixtures that walk the seeded
// admin/admin superadmin through it.
describe('changePasswordSchema', () => {
  it('allows a bare newPassword (the forced first-login change)', () => {
    const result = changePasswordSchema.safeParse({ newPassword: 'admin123456' });
    expect(result.success).toBe(true);
  });

  it('still accepts currentPassword when provided (the normal change)', () => {
    const result = changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'admin123456' });
    expect(result.success).toBe(true);
  });

  it('still requires newPassword', () => {
    const result = changePasswordSchema.safeParse({ currentPassword: 'old' });
    expect(result.success).toBe(false);
  });
});
