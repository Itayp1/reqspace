# Agent Instructions

## Finishing a development task
When development work is finished, always do these in order:

1. **Bump the MINOR version** (e.g. 1.2.0 -> 1.3.0, PATCH reset to 0) in the root `package.json` and `package-lock.json` (`npm version minor --no-git-tag-version`), and commit it as `chore: release <version>`.
2. **Merge the project into `master`** (switch to `master`, merge the working branch).
3. **Push `master`** to `origin`.

See `CLAUDE.md` for the test and bug-fix rules, which still apply before this step.
