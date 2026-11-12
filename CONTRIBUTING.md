# Contributing

Thanks for helping. Bug reports, fixes and small focused features are welcome.

## Setup

```bash
npm ci && npm ci --prefix server && npm ci --prefix client
npm run dev            # see the README for server and client ports
```

## Making a change

1. Open an issue first for anything larger than a small fix.
2. For a bug: add a Playwright test under `tests/e2e/reproductions/` that fails, then fix it, then run the full suite.
3. Keep the change minimal and unrelated files untouched.
4. Run `npx playwright test` (and `node scripts/run-server-e2e.js` for server changes) before opening a pull request.
5. Commit messages: `fix(<id>): short description` or `feat(<area>): short description`.

Every pull request is reviewed by a maintainer before it is merged. Releases of the desktop app are built only by
GitHub Actions; see the README for how versions and releases work.

## Conduct

Be respectful and constructive. Harassment is not tolerated.
