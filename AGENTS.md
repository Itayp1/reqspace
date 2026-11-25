# Agent Instructions

## Finishing a development task
When development work is finished, always do these in order:

1. **Bump only the last number of the version** (e.g. 1.2.0 -> 1.2.1; never the first or middle number) in the root `package.json` (`npm version patch --no-git-tag-version`; the lockfile is `pnpm-lock.yaml` and does not carry the app version), and commit it as `chore: release <version>`.
2. **Merge the project into `master`** (switch to `master`, merge the working branch).
3. **Push `master`** to `origin`.

See `CLAUDE.md` for the test and bug-fix rules, which still apply before this step.
