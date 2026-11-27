# Spec inventory B (files 97-192 of sorted spec list)

### tests/e2e/reproductions/QA-24-cors-loopback-origin.spec.ts
- describes: none
- tests: 2 ; dev client port allowed on localhost and 127.0.0.1; unrelated origin refused
- fixture: request
- login: none (anonymous GET /api/auth/config with Origin header)
- state: read-only; no writes, no serial
- topic: cors

### tests/e2e/reproductions/QA-26-conflict-dialog-detail.spec.ts
- describes: none
- tests: 1 ; conflict dialog shows when the newer version was saved
- fixture: page
- login: ui-login new user via registerUser
- state: new unique user, its personal workspace, a collection and request (UI + API PUT to make it stale); no serial
- topic: conflict

### tests/e2e/reproductions/QA-26-conflict-shows-updater.spec.ts
- describes: none
- tests: 1 ; conflict dialog names the last editor and time
- fixture: page
- login: ui-login new user via registerUser (name "Alice Editor")
- state: new user, workspace collection and request via API; no serial
- topic: conflict

### tests/e2e/reproductions/QA-28-workspace-plural.spec.ts
- describes: none
- tests: 1 ; Admin workspaces table uses singular for a count of 1
- fixture: page
- login: ui-login admin (loginAdminUi) and ui-login new user (registerUser)
- state: admin view; new user creates a workspace list entry; no serial
- topic: admin

### tests/e2e/reproductions/QA-30-31-admin-users-and-logs.spec.ts
- describes: none
- tests: 2 ; QA-30 no Revoke Admin button on own admin row; QA-31 audit log Resource shows workspace name not id
- fixture: page
- login: ui-login admin (loginAdminUi) + api login admin (apiAsAdmin)
- state: global admin data (users list, audit log); API writes a workspace/resource for the audit entry; no serial
- topic: admin

### tests/e2e/reproductions/QA-35-runner-data-file-label.spec.ts
- describes: none
- tests: 1 ; Run Collection data-file picker shows English "Choose file" label
- fixture: page
- login: ui-login new user via registerUser
- state: new user, collection via UI; no serial
- topic: runner

### tests/e2e/reproductions/QA-44-tree-drag-reorder.spec.ts
- describes: none
- tests: 1 ; [QA-44] drag request onto sibling reorders and persists
- fixture: page
- login: ui-login new user via registerUser
- state: new user, collection + 3 requests via API; no serial
- topic: tree

### tests/e2e/reproductions/QA-46-comment-live-sync.spec.ts
- describes: none
- tests: 1 ; a comment posted in another browser appears live in the open Comments tab
- fixture: page (also uses browser for a second context)
- login: ui-login new user (registerUser) and loginUi for the second context
- state: two new users, collection + request, comment rows, socket sync; no serial
- topic: comments

### tests/e2e/reproductions/QA-47-viewer-readonly-editor.spec.ts
- describes: none
- tests: 1 ; a viewer gets a read-only URL bar and a "View only" note
- fixture: page
- login: ui-login new user via registerUser (viewer share role set up via UI/API)
- state: new users, collection, share/role rows; no serial
- topic: rbac

### tests/e2e/reproductions/QA-54-65-form-validation-messages.spec.ts
- describes: none
- tests: 3 ; login empty submit shows in-app message; register empty submit shows in-app message; register short password names the rule
- fixture: page
- login: none (signed-out pages; validation fails before any request)
- state: no DB writes; test.use allowFpErrors for 40x
- topic: validation

### tests/e2e/reproductions/QA-64b-duplicate-keeps-raw-url.spec.ts
- describes: none
- tests: 1 ; QA-64b tree Duplicate and Duplicate Tab keep {{baseUrl}}
- fixture: page
- login: ui-login new user via registerUser
- state: new user, collection and request; no serial
- topic: tree

### tests/e2e/reproductions/QA-75-register-double-submit.spec.ts
- describes: none
- tests: 1 ; double-clicking Create Account sends one register request
- fixture: page
- login: none (register route is intercepted with page.route; no real account)
- state: no DB writes; test.use allowFpErrors for 400
- topic: register

### tests/e2e/reproductions/QA-76-permissions-modal-escape.spec.ts
- describes: none
- tests: 1 ; Escape closes the Manage Permissions modal, inner confirm first
- fixture: page
- login: ui-login admin (loginAdminUi) + api login admin (apiAsAdmin)
- state: admin; workspace permissions created via API; no serial
- topic: rbac

### tests/e2e/reproductions/QA-77-save-copy-default-collection.spec.ts
- describes: none
- tests: 1 ; QA-77 Duplicate Tab then Save defaults to the original collection
- fixture: page
- login: ui-login new user via registerUser
- state: new user, collection and request; no serial
- topic: save-as

### tests/e2e/reproductions/admin-env-ux.spec.ts
- describes: admin screen exit, shortcuts and environment UX
- tests: 4 ; admin screen Close button returns to app; Ctrl+Z reverts unsaved admin setting and Ctrl+S saves; undefined {{variable}} asks, Run Anyway remembered; environment editor shows active env and switches it
- fixture: page
- login: ui-login admin (loginAdminUi) and ui-login new user (registerUser) per test
- state: admin global settings (Ctrl+S saves an admin setting); new users with environments; no serial
- topic: admin

### tests/e2e/reproductions/admin-sees-all-workspaces.spec.ts
- describes: none
- tests: 1 ; admin workspace list includes private workspaces of other users
- fixture: neither (bare async, uses Playwright request contexts)
- login: api login (apiAs for owner via anonymous request context register + login; apiAsAdmin)
- state: creates a new owner user and a private workspace; reads admin list; no serial
- topic: admin

### tests/e2e/reproductions/admin-user-search-wildcards.spec.ts
- describes: none
- tests: 1 ; admin user search finds an email that contains an underscore
- fixture: neither
- login: api login admin (apiAsAdmin)
- state: creates a user with underscore in email; admin user search; no serial
- topic: admin

### tests/e2e/reproductions/console-resizable.spec.ts
- describes: none
- tests: 1 ; Console height changed by dragging top edge and with keyboard
- fixture: page
- login: ui-login new user via registerUser
- state: new user; no serial
- topic: ui-layout

### tests/e2e/reproductions/context-menu-stays-open.spec.ts
- describes: none
- tests: 1 ; right-click menu closes when right-clicking elsewhere or window loses focus
- fixture: page
- login: ui-login new user via registerUser
- state: new user, collection via API; no serial
- topic: context-menu

### tests/e2e/reproductions/cors-clear-message.spec.ts
- describes: none
- tests: 1 ; [CORS] request blocked by CORS says so and points to the extension
- fixture: page
- login: ui-login new user via registerUser
- state: new user, collection and request pointing at a local node:http server it starts on a random port; no serial
- topic: cors

### tests/e2e/reproductions/ctrl-s-saves-everywhere.spec.ts
- describes: none
- tests: 2 ; Ctrl+S saves profile variables; Ctrl+S saves Workspace Settings
- fixture: page
- login: ui-login new user via registerUser (each test)
- state: new users; profile variables and personal workspace settings; no serial
- topic: shortcuts

### tests/e2e/reproductions/dirty-indicator-reverted-edits.spec.ts
- describes: none
- tests: 2 ; request tab type then delete header leaves tab clean; environment tab adding unfilled row leaves tab clean
- fixture: page
- login: ui-login new user via registerUser (each test)
- state: new users, request and environment; no serial
- topic: dirty-state

### tests/e2e/reproductions/errors-console-and-auth-capture.spec.ts
- describes: error capture
- tests: 2 ; console.error/warn stored as client "console" fault; 401 on normal API call stored on server and client
- fixture: page
- login: none in page (anonymous page); api login admin (apiAsAdmin) to read the error log
- state: writes fperrors rows (allowFpErrors for 401/console probes); global error log; no serial
- topic: errors

### tests/e2e/reproductions/fperror-resolve-audit.spec.ts
- describes: none
- tests: 1 ; resolving an error group with a 64-char fingerprint succeeds and writes its audit row
- fixture: neither
- login: api login admin (apiAsAdmin)
- state: fperrors group and audit_log rows (DELETE/resolve); global; no serial
- topic: errors

### tests/e2e/reproductions/global-search-reveal-folder.spec.ts
- describes: none
- tests: 1 ; [global-search] picking a nested folder expands the tree to it
- fixture: page
- login: ui-login new user via registerUser
- state: new user, collection with nested folders via API; no serial
- topic: search

### tests/e2e/reproductions/history-binary-response.spec.ts
- describes: none
- tests: 2 ; history accepts a response body containing NUL characters; NUL in an id or name is still refused
- fixture: neither
- login: api login admin (apiAsAdmin)
- state: writes history entries into the admin's workspace; global admin data; no serial
- topic: history

### tests/e2e/reproductions/history-restore-raw-url.spec.ts
- describes: none
- tests: 1 ; history restore keeps {{baseUrl}} and names the tab after the request
- fixture: page
- login: ui-login new user via registerUser
- state: new user, collection, request, history entry; no serial
- topic: history

### tests/e2e/reproductions/history-workspace-cap.spec.ts
- describes: none
- tests: 1 ; history over per-workspace cap drops oldest entries (including a concurrent save burst)
- fixture: page
- login: ui-login new user via registerUser; api login admin (apiAsAdmin) imported and called once at start
- state: new user, writes ~many history rows to hit cap; global cap setting touched via admin; no serial
- topic: history

### tests/e2e/reproductions/import-curl-unclosed-quote.spec.ts
- describes: none
- tests: 1 ; cURL import is disabled with a parse error until the command is valid
- fixture: page
- login: ui-login new user via registerUser
- state: new user; no writes; no serial
- topic: import

### tests/e2e/reproductions/login-session-cookie-blocked.spec.ts
- describes: session cookie dropped by the browser
- tests: 1 ; the login page explains it instead of entering a broken app
- fixture: page
- login: none (route mocks /api/auth/me to 401)
- state: no DB writes; test.use allowFpErrors for 401
- topic: login

### tests/e2e/reproductions/oauth-concurrent-state.spec.ts
- describes: OAuth state is per sign-in attempt
- tests: 2 ; two sign-ins in same browser can both complete; state endpoint is not cacheable
- fixture: page
- login: none UI; mock IdP (startMockIdp) and API calls to /api/auth/state and /api/auth/custom
- state: beforeAll enables the custom OAuth provider (global config), afterAll disables it; global, must not run in parallel with other OAuth specs; no describe.serial
- topic: oauth

### tests/e2e/reproductions/oauth-custom-autocreate.spec.ts
- describes: none
- tests: 1 ; custom SSO creates the user even when self registration is off
- fixture: page
- login: api login admin (apiAsAdmin) to toggle settings; SSO sign-in through mock IdP creates the user
- state: global OAuth custom provider + self-registration setting (beforeAll/afterAll restore); creates an SSO user; needs clean-ish global config; no serial
- topic: oauth

### tests/e2e/reproductions/oauth-first-login-personal-workspace.spec.ts
- describes: none
- tests: 1 ; first SSO login gets a personal workspace, kept after re-login
- fixture: page
- login: SSO through mock IdP (startMockIdp); no UI password login
- state: beforeAll enables custom provider (global), afterAll disables; creates a new SSO user and its personal workspace; no serial
- topic: oauth

### tests/e2e/reproductions/oauth-google-icon.spec.ts
- describes: none
- tests: 1 ; Google sign-in button shows the four-colour Google logo
- fixture: page
- login: api login admin (apiAsAdmin) to enable the Google provider; page is signed out
- state: global OAuth config (Google provider enabled via PUT); no serial, not restored in file
- topic: oauth

### tests/e2e/reproductions/oauth-login-loads-workspaces.spec.ts
- describes: none
- tests: 1 ; Workspace Settings opens after a custom SSO sign-in
- fixture: page
- login: SSO through mock IdP (startMockIdp)
- state: beforeAll enables custom provider (global), afterAll disables; creates an SSO user; no serial
- topic: oauth

### tests/e2e/reproductions/oauth-missing-config-hints.spec.ts
- describes: OAuth missing-configuration hints
- tests: 2 ; admin screen lists what is missing for an enabled provider; half-configured provider sign-in tells user what admin must set
- fixture: page
- login: ui-login admin (loginAdminUi) + api login admin (apiAsAdmin); page signed out for sign-in
- state: global OAuth provider config written via PUT (enabled with missing fields); test.afterEach restores; no serial
- topic: oauth

### tests/e2e/reproductions/qa-11-empty-state-create-request-flow.spec.ts
- describes: none
- tests: 2 ; QA-11 empty-state Create a Request asks for name and saves into first collection; with no collection the button still opens a draft
- fixture: page
- login: ui-login new user via registerUser (each test)
- state: new users, collection and requests; no serial
- topic: empty-state

### tests/e2e/reproductions/qa-115-permissions-role-help.spec.ts
- describes: none
- tests: 1 ; QA-115 Manage Permissions dialog explains the roles
- fixture: page
- login: ui-login admin (loginAdminUi) + api login admin (apiAsAdmin)
- state: admin; creates a workspace/collection via API; no serial
- topic: rbac

### tests/e2e/reproductions/qa-36-runner-passed-failed-hint.spec.ts
- describes: none
- tests: 1 ; QA-36 runner Passed/Failed boxes explain how a request is counted
- fixture: page
- login: ui-login new user via inline /register form (not the helper)
- state: new user, request started via startNewRequest; no serial
- topic: runner

### tests/e2e/reproductions/qa-62-collection-menu-grouping.spec.ts
- describes: none
- tests: 1 ; QA-62 collection menu is grouped with separators and Edit is named
- fixture: page
- login: ui-login new user via inline /register form
- state: new user, collection; no serial
- topic: tree

### tests/e2e/reproductions/qa-73-env-vanishes-after-rename.spec.ts
- describes: none
- tests: 1 ; QA-73 env created while Rename prompt is open stays in list
- fixture: page
- login: ui-login new user via registerUser
- state: new user, environments; no serial
- topic: env-variables

### tests/e2e/reproductions/qa-dialogs-escape-and-role.spec.ts
- describes: none
- tests: 1 ; Global Settings is a dialog and Escape closes it
- fixture: page
- login: ui-login new user via registerUser
- state: new user; no serial
- topic: ui-layout

### tests/e2e/reproductions/qa02-new-request-opens.spec.ts
- describes: none
- tests: 1 ; QA-02 request created from collection menu opens in editor
- fixture: page
- login: ui-login new user via registerUser
- state: new user, collection; no serial
- topic: tree

### tests/e2e/reproductions/qa15-ctrl-enter-sends-once.spec.ts
- describes: none
- tests: 1 ; QA-15 Ctrl+Enter in URL bar sends exactly once
- fixture: page
- login: scene() helper (registerUser "repro" + API collection/request) plus mockServer
- state: new user, collection, request; no serial
- topic: request-send

### tests/e2e/reproductions/qa41-params-without-query.spec.ts
- describes: none
- tests: 1 ; QA-41 saved enabled params are sent when URL has no query
- fixture: page
- login: scene() helper (new user via registerUser "repro")
- state: new user, request; no serial
- topic: request-send

### tests/e2e/reproductions/qa42-pm-response-to.spec.ts
- describes: none
- tests: 1 ; QA-42 pm.response.to.have.status(200) passes and wrong status fails in a test script
- fixture: page
- login: scene() helper (new user via registerUser "repro")
- state: new user, request with script; no serial
- topic: scripts

### tests/e2e/reproductions/qa43-request-headers-snippet.spec.ts
- describes: none
- tests: 1 ; QA-43 pre-request snippet documents pm.request.headers and works
- fixture: page
- login: scene() helper (new user via registerUser "repro")
- state: new user, request with script; no serial
- topic: scripts

### tests/e2e/reproductions/qa50-form-data-content-type.spec.ts
- describes: none
- tests: 2 ; QA-50 form-data sent as multipart even with manual Content-Type header; QA-50 form-data with no rows sends no body
- fixture: page
- login: scene() helper (new user via registerUser "repro")
- state: new user, request; no serial
- topic: request-send

### tests/e2e/reproductions/qa55-response-splitter-resizes.spec.ts
- describes: none
- tests: 1 ; QA-55 dragging splitter up makes response pane taller
- fixture: page
- login: scene() helper (new user via registerUser "repro")
- state: new user, request; no serial
- topic: ui-layout

### tests/e2e/reproductions/qa66-undefined-variable-error.spec.ts
- describes: none
- tests: 1 ; QA-109 response pane names the undefined variable
- fixture: page
- login: scene() helper (new user via registerUser "repro")
- state: new user, request using {{nohost}}; test.use allowFpErrors; no serial
- topic: variables

### tests/e2e/reproductions/r2-01-sidebar-logo-tooltip.spec.ts
- describes: none
- tests: 1 ; R2-01 sidebar logo link has tooltip and Import icon opens Import
- fixture: page
- login: ui-login new user via inline /register form
- state: new user; no serial
- topic: ui-layout

### tests/e2e/reproductions/raw-json-body-content-type.spec.ts
- describes: none
- tests: 1 ; raw JSON body sent with Content-Type application/json by default
- fixture: page
- login: ui-login new user via registerUser
- state: new user, request; no serial
- topic: request-send

### tests/e2e/reproductions/runner-iteration-data-vs-profile.spec.ts
- describes: none
- tests: 1 ; iteration data wins over a profile variable of the same name
- fixture: page
- login: api login (addCookies/storageState and /api/auth/register + login with X-Forwarded-For, Playwright request context)
- state: new user, profile variable and request via API; no serial
- topic: runner

### tests/e2e/reproductions/send-cookies-default-off.spec.ts
- describes: none
- tests: 1 ; "Send Cookies Automatically" is off by default
- fixture: page
- login: ui-login new user via registerUser
- state: new user; no serial
- topic: settings

### tests/e2e/reproductions/settings-about-version.spec.ts
- describes: none
- tests: 1 ; [ABOUT] Global Settings shows app version
- fixture: page
- login: ui-login new user via registerUser
- state: new user; no serial
- topic: settings

### tests/e2e/reproductions/user-directory-privacy.spec.ts
- describes: none
- tests: 1 ; search hides strangers; invite does not reveal whether account exists
- fixture: neither (uses Playwright request contexts; bare async)
- login: api login (apiAs for several new users registered via /api/auth/register)
- state: several new unique users, workspace invites; no serial
- topic: sharing

### tests/e2e/reproductions/user-search-full-email.spec.ts
- describes: none
- tests: 1 ; a registered user is found by typing their full email
- fixture: neither
- login: api login admin (apiAsAdmin) + register a new user via API
- state: creates a new user; admin user search; no serial
- topic: admin

### tests/e2e/reproductions/variable-context-edit.spec.ts
- describes: none
- tests: 1 ; right-click on variable shows source scope and edits it in that scope
- fixture: page
- login: ui-login new user via registerUser
- state: new user, collection/profile variables via API; no serial
- topic: variables

### tests/e2e/requests.spec.ts
- describes: Request Operations
- tests: 10 ; Login and create workspace; Create GET request with headers and query params; Create POST JSON body save and send; Bearer auth persists; Basic auth persists; Auth header and request body both sent; Raw JSON body persists and is sent; Form-data body persists and sends multipart; URL-encoded body persists; Dirty state indicators and undo/redo
- fixture: page
- login: ui-login new user (inline register/login via page) then selectWorkspace
- state: one new user, workspace, requests built step by step across tests (test 1 creates the state the rest use); describe.configure serial, beforeEach re-navigates
- topic: request-send

### tests/e2e/response.spec.ts
- describes: Response & Code Gen
- tests: 2 ; Test Results and Code Generation Modal; per-mode viewer, image/PDF, timeout and error paths
- fixture: page
- login: ui-login new user via inline /register form
- state: new user, requests; no serial
- topic: response

### tests/e2e/runner-codegen-url.spec.ts
- describes: Runner, empty URL, code snippets
- tests: 3 ; every runner row gets own result, request with no URL fails; empty URL refused and scheme-less URL gets http://; code snippets include url-encoded and form-data bodies
- fixture: page
- login: ui-login new user via registerUser (beforeEach)
- state: new user, collection and requests per test; no serial
- topic: runner

### tests/e2e/runner-missing-variables.spec.ts
- describes: none
- tests: 1 ; runner asks to create variables with no record, then runs; second run does not ask
- fixture: page
- login: ui-login new user via registerUser
- state: new user, collection, request, variables; no serial
- topic: runner

### tests/e2e/runner.spec.ts
- describes: Collection Runner
- tests: 4 ; should open CollectionRunnerModal, configure and run; each iteration substitutes its data-file row; CSV data file drives iterations identically to JSON; stop mid-run halts remaining iterations
- fixture: page
- login: ui-login new user via inline /register form (in each test)
- state: new users, collection and requests; no describe.serial
- topic: runner

### tests/e2e/save-as.spec.ts
- describes: Save As & in-modal creation
- tests: 2 ; brand-new request creates collection and folder from Save modal; Save in dropdown saves in place, Save As copies to new name
- fixture: page
- login: ui-login new user via inline /register form (beforeEach)
- state: new user, collections/folders; describe.configure serial
- topic: save-as

### tests/e2e/scripts-scope.spec.ts
- describes: Scripts Scope
- tests: 1 ; Pre-request scripts run at Collection and Folder levels
- fixture: page
- login: ui-login new user via inline /register form
- state: new user, collection/folder scripts; no serial
- topic: scripts

### tests/e2e/scripts.spec.ts
- describes: Script Execution
- tests: 4 ; Pre-request script sets environment variable; failing assertions display correctly; pm.sendRequest behavior; script isolation
- fixture: page
- login: ui-login new user via inline /register form (beforeEach)
- state: new user; describe.configure serial
- topic: scripts

### tests/e2e/search-latency.spec.ts
- describes: Global search latency under load
- tests: 1 ; a folder is found within 200ms of the last keystroke, in a workspace among 5
- fixture: page
- login: ui-login via loginUi with user seeded by perf-seed helper; selectWorkspace
- state: bulk seed of many collections/requests via perf-seed (writes heavy data); test.setTimeout 120s; skipped unless DB_TYPE sqlite; no serial
- topic: search

### tests/e2e/settings-certs-admin.spec.ts
- describes: Certificates, admin users, extension prompt
- tests: 5 ; client certificate persists across reload and only metadata returns; certificate needs hostname, cert and key; admin can create a user who can then log in; duplicate email rejected with message; extension prompt appears in plain browser and stays dismissed
- fixture: page (test 1-2 are electron-only, skipped unless REQSPACE_TARGET=electron; uses browser for the extension test)
- login: ui-login new user via inline /register form; ui-login admin via api login (apiAsAdmin) for the admin test
- state: new user and client certificates (electron only); creates a new admin-created user; describe.configure serial; test.use allowFpErrors
- topic: certs

### tests/e2e/settings.spec.ts
- describes: Global Settings
- tests: 4 ; request settings persist and survive reload; configured timeout applied to a request; local proxy section stores its configuration; rebound search shortcut replaces Ctrl+K
- fixture: page
- login: ui-login new user via inline /register form (beforeEach)
- state: new user, personal global settings (timeout, proxy, shortcut); describe.configure serial
- topic: settings

### tests/e2e/share-page-fork.spec.ts
- describes: Shared page, viewer fork, fork options
- tests: 5 ; public share page lists requests and can run one; with two requests a run only fills its own row; revoked link shows error page; viewer Ctrl+S offered a copy into own workspace; forking with copy-variables and copy-environment carries both
- fixture: both (page + browser/context for owner and viewer)
- login: ui-login owner and separate viewer (new users) via registerUser / inline register; anonymous share page
- state: new owner and viewer users, workspaces, requests, share links, forks; describe.configure serial
- topic: share

### tests/e2e/share.spec.ts
- describes: Share Links
- tests: 1 ; should generate a link, strip sensitive data for anonymous view, and handle revocation
- fixture: both (page, context, request)
- login: ui-login new user via registerUser; anonymous view in a separate context
- state: new user, request with secrets, share link created and revoked; no serial
- topic: share

### tests/e2e/sock1-no-refetch.spec.ts
- describes: none
- tests: 1 ; a rename from another user updates the sidebar with zero HTTP requests
- fixture: page (uses browser for two contexts)
- login: ui-login two new users (inline) via selectWorkspace on shared workspace
- state: two users, shared workspace, collection rename via socket; no serial
- topic: sockets

### tests/e2e/socket-advanced.spec.ts
- describes: WebSocket Advanced Sync
- tests: 1 ; Folder rename and Global variables sync between users
- fixture: page (browser for two users)
- login: ui-login two new users, selectWorkspace on shared workspace
- state: two users, shared workspace, folder and global variable writes; no serial
- topic: sockets

### tests/e2e/socket-events.spec.ts
- describes: Socket events coverage
- tests: 1 ; Cover all 13 event families via direct socket connection
- fixture: request (also uses socket.io-client against API_URL)
- login: api login (request.post /auth/login, with retry) for a user; socket connection with its session
- state: writes across many resources (collections, requests, folders, variables, workspaces); no describe.serial
- topic: sockets

### tests/e2e/socket-sync.spec.ts
- describes: WebSocket Sync
- tests: 1 ; User B sees conflict when User A edits request
- fixture: page (browser for two users)
- login: ui-login two new users, selectWorkspace on shared workspace
- state: two users, shared workspace, request edit conflict; no serial
- topic: sockets

### tests/e2e/socketio-connection.spec.ts
- describes: Socket.IO connections
- tests: 6 ; connects, emits named event and receives echo; JSON payload emitted as structured args; each inbound event logged exactly once; namespace in URL honoured; disconnect reports reason and locks composer; unreachable server surfaces connect_error then gives up
- fixture: page
- login: ui-login new user via inline /register form (beforeEach)
- state: new user; socket connections; describe.configure serial
- topic: sockets

### tests/e2e/system-backup.spec.ts
- describes: Full system backup (admin)
- tests: 2 ; encrypted export can be checked and merged back; wrong password refused; export needs password of at least 8 chars and an admin
- fixture: request
- login: api login admin (apiAsAdmin) plus a non-admin user for the refusal case
- state: global: exports/imports whole system data (merge back writes all); admin-level; no serial; uses test.use allowFpErrors
- topic: backup

### tests/e2e/tab-method-theme-color.spec.ts
- describes: none
- tests: 1 ; request tab method label uses theme method token
- fixture: page
- login: ui-login new user via registerUser
- state: new user, request; no serial
- topic: ui-layout

### tests/e2e/tabs-history-theme.spec.ts
- describes: Tabs, history and theme
- tests: 5 ; closing a dirty tab asks first (Cancel keeps, confirm closes); tab context menu closes others/right/left with confirm; history delete one then clear all; turning off Save Request History stops logging; theme toggle dark/light survives reload
- fixture: page
- login: ui-login new user via registerUser (beforeEach)
- state: new user, tabs, history rows, personal settings; no serial
- topic: tabs

### tests/e2e/tabs.spec.ts
- describes: Tab Operations
- tests: 2 ; drag and drop to reorder tabs; drag-reorder only and content persistence
- fixture: page
- login: ui-login new user via inline /register form
- state: new user, tabs; no serial
- topic: tabs

### tests/e2e/toast-on-closed-modal.spec.ts
- describes: none
- tests: 1 ; a failed save after its modal is closed still shows a toast
- fixture: page
- login: ui-login admin via inline /login and /admin navigation (page.goto)
- state: admin; touches admin settings with a failing save; no serial
- topic: toast

### tests/e2e/tree-ops.spec.ts
- describes: Tree operations
- tests: 8 ; request inside folder deleted and stays deleted after reload; deleting folder removes subfolders and requests; sidebar filter narrows collections by request name; re-opening request keeps unsaved edits; server-rejected save says so and leaves tab dirty; folder dragged onto folder moves and persists; folder dragged onto another collection moves and persists; folder with subfolder and request keeps them when dragged
- fixture: page
- login: ui-login new user via registerUser (beforeEach) and apiAs for api setup
- state: new user, collections/folders/requests; beforeEach resets per test; no serial
- topic: tree

### tests/e2e/ui/admin-add-user-labels.spec.ts
- describes: none
- tests: 1 ; Add User fields are reachable by visible labels
- fixture: page
- login: ui-login admin (loginAdminUi)
- state: admin; opens Add User form (no save expected); no serial
- topic: admin

### tests/e2e/ui/admin-labels.spec.ts
- describes: none
- tests: 2 ; Logs and Errors date filters show visible From/To labels; clicking a Settings checkbox label toggles it
- fixture: page
- login: ui-login admin (loginAdminUi) + expandAdminSections
- state: admin; toggles a checkbox in global settings (no save asserted); no serial
- topic: admin

### tests/e2e/ui/auth-forms.spec.ts
- describes: none
- tests: 3 ; register shows 8-character password rule next to field; register error banner has dark variant; login error banner has dark variant
- fixture: page
- login: none (signed-out context via test.use storageState empty)
- state: no DB writes; no serial
- topic: auth-forms

### tests/e2e/ui/modals-consistency.spec.ts
- describes: none
- tests: 2 ; New Workspace is inline name field, no dialog; Run dialog title has no colon
- fixture: page
- login: ui-login new user via registerUser
- state: new user; creates collection; no serial
- topic: modals

### tests/e2e/ui/request-editor.spec.ts
- describes: none
- tests: 5 ; request sections exposed as tabs and snippets as buttons; unresolved variable dashed underline plus tooltip; manual Content-Type with form body shows ignored-header warning; URL bar icon buttons named and connection button spelled out; code generation languages wrap
- fixture: page
- login: ui-login new user via registerUser (beforeEach)
- state: new user, request; no serial
- topic: request-editor

### tests/e2e/ui/share-mtls-copy.spec.ts
- describes: none
- tests: 1 ; Share dialog states what is and is not shared
- fixture: page
- login: ui-login new user via registerUser
- state: new user, collection; no serial
- topic: share

### tests/e2e/ui/tab-bar-scrollbar.spec.ts
- describes: none
- tests: 1 ; tab bar hides scrollbar and tabs carry title tooltip
- fixture: page
- login: ui-login new user via registerUser
- state: new user, many tabs; no serial
- topic: tabs

### tests/e2e/ui/tree-menu.spec.ts
- describes: none
- tests: 1 ; collection menu grouped with separators and names Edit Settings
- fixture: page
- login: ui-login new user via registerUser
- state: new user, collection; no serial
- topic: tree

### tests/e2e/ui/workspace-picker.spec.ts
- describes: none
- tests: 1 ; workspace picker filters by typing and switches workspace on pick
- fixture: page
- login: ui-login new user via registerUser plus api login (apiAs) for a second user to create a workspace
- state: two users, extra workspaces created via API; no serial
- topic: workspace

### tests/e2e/variable-hover.spec.ts
- describes: none
- tests: 1 ; hovering a {{variable}} in URL shows its value and source
- fixture: page
- login: ui-login new user via registerUser plus api login (apiAs)
- state: new user, collection/profile variable, request via API; test.use set; no serial
- topic: variables

### tests/e2e/variable-scopes.spec.ts
- describes: Variable Scopes
- tests: 4 ; register and give collection its own variables; collection variable resolves in request saved under it; profile variables save, reload, resolve; profile variable wins over collection variable of same name
- fixture: page
- login: ui-login new user via registerUser in test 1, state carried to later tests; startNewRequest
- state: one user and one collection built across tests (later tests depend on test 1); describe.configure serial
- topic: variables

### tests/e2e/workspace-duplicate.spec.ts
- describes: none
- tests: 1 ; duplicating a workspace copies content and members; opt-outs honoured
- fixture: neither (bare async, Playwright request contexts)
- login: api login (register + login with X-Forwarded-For, new user via /api/auth/register and /api/auth/login)
- state: several new users, workspace with collections, members, duplicates; no serial; test.use allowFpErrors
- topic: workspace

### tests/e2e/workspace-invite-links.spec.ts
- describes: email validation, owner role, revoke; invite links API; invite links UI
- tests: 14 ; invalid email shows inline error and sends nothing; server rejects malformed email with 400; invited owner joins as owner, promote member, last owner cannot be demoted; UI owner rows get role select only with more than one owner; revoking email invite asks confirmation and invitee does not join; create returns token once, accept adds member with link role; owner link makes an owner; single-use second accept is 410 incl. concurrent accept; expired link 410 (expiry forced in SQLite file); revoked link 410, unknown token 404, revoking twice 404; only owners manage links, input validated, anonymous 401; owner creates link in tab, signed-out user logs in and joins; error states on invite page (unknown, revoked); Join with Invite Link in workspace picker accepts pasted link
- fixture: page (plus browser for second user)
- login: ui-login new users via registerUser and loginUi; api login (/api/auth/login and register with X-Forwarded-For)
- state: many new users, workspaces, members, invite and link rows; SQLite file edited directly for expiry test (skipped unless DB_TYPE sqlite and file exists); test.skip in that describe; no serial
- topic: workspace-invite

### tests/e2e/workspace.spec.ts
- describes: Workspace Management
- tests: 2 ; should register, login, create, edit, switch and delete a workspace; removing a member immediately revokes their access
- fixture: page (plus browser for second member)
- login: ui-login new user via inline /register form; second member via browser context login
- state: new users, workspaces created, renamed, deleted; members added/removed; no serial
- topic: workspace
