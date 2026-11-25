import { describe, it, expect } from 'vitest';
import { cleanSettings } from './requestPayload';

describe('cleanSettings', () => {
  it('saves connection passwords and tokens with the request', () => {
    const out = cleanSettings({
      tabType: 'connection',
      connection: { kafkaTopic: 't', sioAuth: '{"token":"a"}', secrets: { kafkaPassword: 'pw', wsToken: 'tok' } },
    }) as any;
    expect(out.connection.secrets).toEqual({ kafkaPassword: 'pw', wsToken: 'tok' });
    expect(out.connection.sioAuth).toBe('{"token":"a"}');
  });
});
