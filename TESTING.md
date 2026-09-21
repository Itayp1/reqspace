# Postman Clone - Testing Guide

This project contains a comprehensive automated test suite utilizing [Playwright](https://playwright.dev/). The suite is designed to cover the entire feature set, including role-based access control (RBAC), UI stability, authentication mechanisms, and core workflows.

## Prerequisites
Ensure the server and client are built and running. The tests run against the local instance by default (e.g., `http://localhost:3005`).
```bash
# Build the client & server
npm run build --prefix client
npm run build --prefix server

# Start the application
pm2 restart postman-clone
# OR node server/dist/index.js
```

## Running the Tests

To execute the entire test suite (including the comprehensive matrix of ~300 test scenarios):
```bash
npx playwright test
```

### Specific Suites
You can run specific test files if you are only working on a particular component:

- **Comprehensive Permissions & Features (300+ scenarios):**
  ```bash
  npx playwright test tests/comprehensive-permissions.spec.ts
  ```
- **Core E2E User Journey:**
  ```bash
  npx playwright test tests/postman.spec.ts
  ```
- **Specific Feature Segments:**
  ```bash
  npx playwright test tests/features-part1.spec.ts
  # Part 2, Part 3, etc.
  ```

## Test Structure & Maintenance Reference

If the code changes in the future, you may need to update the corresponding tests:

1. **`comprehensive-permissions.spec.ts`**
   - **What it covers:** The full Role matrix (`viewer`, `runner`, `tester`, `editor`, `admin`, `owner`) cross-multiplied by all Actions (`create_collection`, `edit_request`, `run_request`, `delete_workspace`, etc.). Also covers UI zoom/resize stability tests and the `UID` Header Auth flow.
   - **When to update:** If you add a new role, modify minimum permission levels for actions, or change the authentication `uid` header logic.
2. **`postman.spec.ts`**
   - **What it covers:** The main E2E flow (Register -> Create Workspace -> Create Collection -> Add Request -> Send Request -> View Response).
   - **When to update:** If the main user journey changes, or if critical DOM elements (like the New Request button) are renamed or restructured.
3. **`features-part[1-5].spec.ts`**
   - **What they cover:** UI specific interactions, form validations, Collection Explorer rendering, and Environment tabs.
   - **When to update:** If you change how tabs open/close, modify the layout, or alter how variables are injected.

## Debugging Tests
If a test fails, you can run it with the UI mode to visually inspect the failure:
```bash
npx playwright test --ui
```
