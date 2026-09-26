import request from 'supertest';
import { app } from '../index';
import { UserRepository } from '../repositories/UserRepository';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { v4 as uuidv4 } from 'uuid';

describe('SEC-1: Self-registered users are not superadmins', () => {
  let cookie: string;
  const testEmail = `bob.${uuidv4()}@example.com`;

  beforeAll(async () => {
    // Wait for app to be ready (it starts DB on import, we just wait a bit or it's already ready)
    await new Promise(r => setTimeout(r, 1000));
    const conf = await SystemConfigRepository.ensure();
    if (conf && !conf.auth.allowSelfRegistration) {
      await SystemConfigRepository.updateConfig({ auth: { ...conf.auth, allowSelfRegistration: true } });
    }
  });

  it('should register a user with isSuperAdmin=false and verify they cannot access admin routes', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Bob Outsider',
        email: testEmail,
        password: 'Password123!'
      });

    expect(res.status).toBe(201);
    expect(res.body.user.isSuperAdmin).toBe(false);

    cookie = res.headers['set-cookie']?.[0]?.split(';')[0];
    
    const dbUser = await UserRepository.findByEmail(testEmail);
    expect(dbUser?.isSuperAdmin).toBe(false);

    const adminRes = await request(app)
      .get('/api/admin/users')
      .set('Cookie', cookie);
    
    expect(adminRes.status).toBe(403);
  });
});
