# Workspace invites: what is still open

Shipped in 1.6.15 (`dev`). Remaining:

- Run the full suite: `pnpm exec playwright test`.
- Run the electron project: `pnpm exec playwright test --project=electron`. There is no electron-specific test for the "Join with Invite Link" paste flow yet.
- Manual browser QA of the six checks (invite-link section, create/revoke, invalid email, `/invite/:token`, unknown token, picker "Join with Invite Link").
- Confirm the Docker Hub tag `1.6.15` was published and the Actions run is green.
- Rate limit on `/api/invite-links/:token*` is not covered by a test (limiters are off in e2e; needs the `@ratelimit` run).
