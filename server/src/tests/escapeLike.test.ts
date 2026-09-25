import { escapeLike, MAX_SEARCH_LENGTH } from '../utils/escapeLike';

// No Sequelize connection is initialised in this suite, so escapeLike falls back
// to the backslash form — which is the correct one for sqlite, postgres and
// mysql, the three supported backends.
describe('escapeLike', () => {
  const cases: Array<[string, string, string]> = [
    ['a bare percent', '%', '\\%'],
    ['an underscore', 'a_b', 'a\\_b'],
    ['a backslash', 'a\\b', 'a\\\\b'],
    ['wildcard soup', '%_%', '\\%\\_\\%'],
    ['plain text', 'users', 'users'],
    ['text with spaces', 'get users', 'get users'],
    ['an email fragment', 'a@b.com', 'a@b.com'],
  ];

  it.each(cases)('escapes %s', (_name, input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });

  it('leaves no unescaped wildcard behind', () => {
    const escaped = escapeLike('%_\\%');
    // Every % and _ must be preceded by a backslash.
    expect(escaped).not.toMatch(/(^|[^\\])%/);
    expect(escaped).not.toMatch(/(^|[^\\])_/);
  });

  it('caps search terms at a sane length', () => {
    expect(MAX_SEARCH_LENGTH).toBeLessThanOrEqual(100);
  });
});
