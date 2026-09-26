# Review Notes: Smart Fork & User Profile Variables

This document outlines the architectural choices and code changes for two major features added to the ReqSpace platform. This is intended to provide context for AI code review (Sonnet / Opus).

## 1. Smart Fork with Auto-Sync

**Goal:** Allow users to fork a collection (to their own workspace or another) and receive upstream updates automatically—but *only* for items they haven't modified themselves.

### Architecture & DB Changes
- **Tables added via Migration 010:**
  - `collection_forks`: Maps a `forkedCollectionId` to its `sourceCollectionId`. Tracks `forkedByUserId` and `lastSyncAt`.
  - `fork_item_hashes`: Stores the MD5 hash (the "base hash") of every item (collection, folder, request) at the exact moment it was forked or last synced.

### Sync Logic (MD5 Approach)
- **Hash Generation:** We hash only the "logical content" of a request (URL, method, body, headers, scripts). We explicitly *do not* hash metadata like `name` or `order`, so a user can rename a forked request without breaking sync.
- **Sync Execution (`server/src/routes/forks.ts`):** 
  - Runs asynchronously when an upstream request is saved (`syncForksOfCollection`).
  - For each item in the upstream source:
    - If it's missing in the fork (newly added upstream) -> Add it to the fork.
    - If it exists in both -> Compute the current hash of the item in the fork.
      - If `currentForkHash === baseHash`: The fork owner hasn't touched it. Update it to match upstream, and update `baseHash`.
      - If `currentForkHash !== baseHash`: The fork owner modified it. Leave it alone.
  - Deletions upstream are handled similarly: if the fork owner didn't touch it, delete it from the fork; otherwise, keep it.

### Frontend Integration
- **`ForkModal.tsx`**: A new modal allowing users to name their fork, select a target workspace, and optionally copy environment variables.
- **`CollectionExplorer.tsx`**: Replaced the previous basic "Fork to Workspace" behavior with the new `ForkModal`.
- **Sockets (`SocketSync.tsx`)**: The server emits `collection:fork-synced` upon a successful async sync. The client listens to this and automatically calls `fetchCollectionsData` to refresh the UI seamlessly.

---

## 2. User Profile Variables (Cross-Workspace)

**Goal:** Provide a place for users to store personal variables (like `myPhone`, `myEmail`, API keys) that persist across *all* workspaces they are part of.

### Architecture & DB Changes
- **Table added via Migration 011:**
  - `user_profile_variables`: Stores variables keyed strictly by `userId` (unlike `local_variables` which is `workspaceId` + `userId`).

### Variable Resolution Chain
- **`client/src/utils/variables.ts`**: Inserted Profile Variables into the resolution chain.
- **Priority Order (Highest to Lowest):**
  1. Runtime local (`pm.variables.set`)
  2. Local Variables (per-workspace)
  3. **User Profile Variables (cross-workspace) <- NEW**
  4. Collection Variables
  5. Active Environment
  6. Global Environment
  7. Dynamic Variables (`$guid`, etc.)

### Frontend Integration
- **Store Updates (`environmentStore.ts`)**: Added `userProfileVariables` array and `fetchUserProfileVariables` action. Triggered on app load inside `TopBar.tsx`.
- **UI (`LocalVariablesEditor.tsx`)**: Refactored the local variables editor to use a shared `<VariableTable />` component wrapped in Tabs: "Local Variables" and "👤 Profile Variables".

## Review Focus Areas
- Check for race conditions in the async `syncForksOfCollection` if multiple users save the source collection rapidly.
- Ensure Sequelize index configurations for the new tables (`collection_forks`, `fork_item_hashes`) look optimal for heavy read loads during sync.
- Verify the TypeScript interfaces used for `headers`, `params`, `body` in the hash generation correctly handle object-to-string edge cases.
