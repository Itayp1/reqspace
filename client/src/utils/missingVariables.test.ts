import { describe, it, expect } from 'vitest';
import { findMissingVariables } from './missingVariables';

describe('findMissingVariables', () => {
  it('reports only names with no record; empty values and disabled records count as defined', () => {
    const out = findMissingVariables(
      [{ label: 'Login', fields: { url: '{{base}}/x/{{empty}}', headers: [{ key: 'A', value: '{{tok}}', enabled: true }, { key: 'B', value: '{{off}}', enabled: false }], body: '{"a":"{{$guid}} {{ col }}"}' } }],
      ['empty', 'col'],
    );
    expect(out.map((m) => m.name).sort()).toEqual(['base', 'tok']);
    expect(out.find((m) => m.name === 'tok')!.usedIn).toEqual(['Login › Headers']);
  });

  it('skips names a script assigns', () => {
    const out = findMissingVariables(
      [{ label: 'R', fields: { preRequestScript: "pm.environment.set('token', 'x')", url: '{{token}}' } }],
      [],
    );
    expect(out).toEqual([]);
  });
});
