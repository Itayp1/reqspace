# IGNORE — out of scope

Features and directions we are **not** building. Nothing here should be proposed, planned, estimated or
started. If a review, a roadmap or an agent suggests something on this list, the answer is already no.

Each entry says what the feature actually *is*, so the decision can be re-read later without hunting for
context.

**How to use this file**

* Adding something: put it in the right section with a one-line description of what it does.
* Changing your mind: delete the line here and open a task in [`TODO.md`](TODO.md). The reverse works the
  same way.
* Section B is not a rejection list — it exists so nobody proposes something that already ships.

> Source: the old `reqspace_features_roadmap.md` ("100 missing features"), which was an upstream-parity
> wish list rather than a plan. The owner selected what to build on 2026-09-24; everything unselected is
> recorded below. What *was* selected lives in [`TODO.md`](TODO.md) under `FEAT`.

---

## A — Not wanted

### Protocols

| Feature | What it is |
|---|---|
| GraphQL support | A GraphQL request mode: schema introspection, a query builder with field pickers, and query validation against the schema |
| GraphQL variables editor | A separate JSON pane for the `variables` object sent alongside a GraphQL query |
| GraphQL subscriptions | Live GraphQL streams over WebSocket, with a running list of pushed results |
| GraphQL autocomplete | Intellisense in the query editor driven by the introspected schema |
| gRPC support | Importing `.proto` definitions or using server reflection, then invoking unary and streaming RPCs |
| gRPC autocomplete | Method and message-field completion from the loaded protobuf definitions |
| MQTT support | Connecting to an MQTT broker to publish and subscribe on topics (IoT messaging) |

*(WebSockets, Socket.IO, SSE and Kafka were selected — see `TODO.md` FEAT-1…FEAT-4.)*

### Authentication schemes

| Feature | What it is |
|---|---|
| Full OAuth 2.0 flow | The client performing the authorization-code/PKCE dance itself: opening the consent screen, exchanging the code, storing and auto-refreshing the token. Today there is a field to paste an access token into, and the UI says so |
| OAuth 1.0a | Signature generation (HMAC-SHA1 over the normalised request) for legacy OAuth 1 APIs |
| AWS Signature v4 | Automatically signing requests with an AWS access key/secret, region and service name |
| Digest auth | The HTTP Digest challenge-response handshake (401 with a nonce, then a hashed response) |
| NTLM | Windows domain authentication — a three-message handshake with the target server. **A half-built NTLM UI exists today and does nothing**; removing it is `TODO.md` SEC-12 |
| Hawk | MAC-based HTTP authentication using a shared key id and key |
| Akamai EdgeGrid | Akamai's proprietary request-signing scheme |
| ASAPS | Atlassian's service-to-service JWT authentication scheme |

### Hosted / cloud-side services

Everything here means running infrastructure on users' behalf. Out of scope for a self-hosted tool —
and most of it conflicts with the decision that the server never makes outbound requests
(`TODO.md` SEC-0).

| Feature | What it is |
|---|---|
| Mock servers | Hosted endpoints that return saved example responses so a client can develop against an API that doesn't exist yet |
| Mock delay simulation | Configurable artificial latency on those mock endpoints |
| Advanced mock matching | Mocks that return different responses depending on the incoming headers, query or body |
| Scheduled monitors | Running a collection on a cron schedule in the cloud and alerting on failures |
| Webhook-triggered runs | A public URL that, when called, kicks off a collection run |
| Hosted documentation sites | Publishing a collection as a public, browsable docs website |
| Data residency | Letting a customer choose which region (US/EU) their data is stored in |
| Enterprise agent | A desktop daemon that lets the *cloud* app reach a user's localhost and intranet |
| Token scanner | Scanning public workspaces for leaked API keys and alerting the owner |

### Git-style collaboration we are not doing

*(Forking, pull requests, merge/conflict UI, collection-level RBAC and partner workspaces **were**
selected — see `TODO.md` FEAT-5.)*

| Feature | What it is |
|---|---|
| — | nothing in this category was declined |

### API design tooling

| Feature | What it is |
|---|---|
| API Builder | An API-first design hub: define the API spec first, then generate collections, mocks, tests and docs from it |
| Two-way OpenAPI sync | Keeping a collection and an OpenAPI file continuously in sync in both directions. *Importing* a spec is already built |
| API versioning | Binding collections to named API versions (v1, v2) and switching between them |
| Schema validation | Validating a live response body against the API's declared schema and flagging drift |
| Saved examples | Storing multiple named example responses per request, for docs and mocks |
| Markdown live preview | A side-by-side rendered preview while writing a collection/request description |
| Rich-text descriptions | A WYSIWYG editor for descriptions instead of Markdown |

### Automation surface

| Feature | What it is |
|---|---|
| Newman-style CLI runner | A command-line binary that runs an exported collection in CI and exits non-zero on failure |
| Native CI/CD integrations | First-party GitHub Actions / GitLab / Jenkins plugins |
| Test report exporters | Writing run results as HTML, JUnit XML or JSON for a CI system to consume |
| Script library / packages | Reusable script modules shared across collections, versioned and imported by name |
| Browser-extension traffic interceptor | An extension that captures the user's live browsing traffic into the app. **Not to be confused with the Chrome extension in `TODO.md` SEC-0.7**, which is a transport for requests the user explicitly composes — a far narrower permission surface |

### Accounts and tenancy

| Feature | What it is |
|---|---|
| Two-factor authentication | TOTP or WebAuthn as a second login factor |
| SSO beyond Google | GitHub, Okta and SAML identity providers. Google SSO is built |
| Custom themes | User-defined colour palettes beyond the built-in light/dark toggle |
| External Reqspace API | A public API letting outside tools read and write collections, environments and runs programmatically |

### UI

| Feature | What it is |
|---|---|
| OS theme sync | Following the operating system's light/dark setting automatically. A manual toggle is built |
| Customizable layout | Switching the request/response split between horizontal and vertical |
| UI zoom control | Scaling the whole interface up and down independently of browser zoom |

### Response handling

| Feature | What it is |
|---|---|
| JSONPath / XPath filtering | A query box that extracts a subset of a large response body by expression |
| Find & replace in the response | Search-and-replace inside the response viewer (Monaco's built-in find is available) |
| Force character encoding | Overriding the response's declared charset when a server labels it wrongly |

### Miscellaneous

| Feature | What it is |
|---|---|
| Automatic retries | Re-sending a request automatically after a network failure, with backoff |
| Auto-save toggle | A user-facing setting for automatic saving. The behaviour already exists silently; a switch for it is not wanted |

---

## B — Already built (do not propose as new work)

Verified in the source on 2026-09-24. These appeared on the old parity list as "missing" and are not.

| Feature | Where |
|---|---|
| Multi-tab support (drag-reorder, dirty state, per-tab undo/redo) | `client/src/store/requestStore.ts`, `components/request/RequestTabBar.tsx` |
| Drag-and-drop reordering of tree nodes | `@dnd-kit`, `CollectionExplorer.tsx` |
| Right-click context menus | `components/common/ContextMenu.tsx`, `ContextMenuProvider.tsx` |
| Global search | `components/common/GlobalSearchModal.tsx` |
| Global keyboard shortcuts | `settingsStore.ts` (`shortcuts`), `UrlBar.tsx` |
| History search & filter | `components/history/HistorySidebar.tsx` |
| Collection runner UI | `components/collection/CollectionRunnerModal.tsx` |
| Data-driven testing (CSV / JSON iteration file) | `components/collection/CollectionRunnerModal.tsx` |
| Performance / load testing | `components/request/LoadTestModal.tsx` |
| Visualizer (`pm.visualizer`, Handlebars) | `components/response/ResponseViewer.tsx` — hardening is `TODO.md` SEC-3 |
| `pm.sendRequest` from scripts | `client/src/utils/scripts.ts` — sandboxing is `TODO.md` SEC-3 |
| Built-in test snippets | `components/request/ScriptEditor.tsx` (`SNIPPETS`) |
| External script libraries (`moment`, `lodash`, `crypto-js`, chai) | `client/src/utils/scripts.ts` — slimming is `TODO.md` PERF-7 |
| Collection-level and folder-level scripts | `preRequestScript` / `testScript` on collections and folders |
| Advanced console with expandable entries | `components/layout/ConsoleDrawer.tsx` |
| Extensive code generation | `components/request/CodeGenModal.tsx` |
| Export to cURL | `CodeGenModal.tsx` |
| Import from cURL / raw HTTP / WSDL | `server/src/routes/importExport.ts`, `ImportModal.tsx` |
| Import OpenAPI / Swagger specs | `ImportModal.tsx` (two-way *sync* is declined, section A) |
| Import a Reqspace collection (v2.0 / v2.1) | `ImportModal.tsx` |
| Export a collection in v2.1 format | `CollectionExplorer.tsx` (`exportCollection`) — the *server-side* export is `TODO.md` FEAT-10 |
| Import / export an environment | `ImportModal.tsx`, `EnvironmentTabEditor.tsx` (`handleExport`) |
| Documentation modal | `components/collection/DocumentationModal.tsx` |
| Shared collection links | `server/src/routes/share.ts`, `ShareLinkModal.tsx` — hardening is `TODO.md` SEC-0.6 |
| Cookie manager | `components/common/CookieManagerModal.tsx` |
| Client SSL certificates per host | `POST /api/auth/certificates` — encryption is `TODO.md` SEC-8 |
| Disable SSL verification toggle | `verifySsl` in `RequestSettings.tsx` |
| Follow redirects toggle | `followRedirects` in `RequestSettings.tsx` |
| Request timeout setting | `RequestSettings.tsx` — ceiling is `TODO.md` FEAT-9 |
| Visual payload viewer (image, PDF) | `ResponseViewer.tsx` |
| Save response to file | `ResponseViewer.tsx` (`handleDownload`) |
| Auto-formatting of JSON / XML / HTML | Monaco + `ResponseViewer.tsx` |
| Public workspaces | `WorkspaceSettingsModal.tsx` (`isPublic`), honoured by the socket join guard |
| Activity trail / audit logs | `server/src/models/AuditLog.ts`, Admin Dashboard |
| Inline comments on requests | `components/request/CommentsEditor.tsx` |
| Collection variables | `components/collection/CollectionVariablesModal.tsx` |
| Secret variables (masked, with reveal) | `EnvironmentTabEditor.tsx` (`isSecret`), `TopBar.tsx` |
| Environment duplication | `EnvironmentSidebar.tsx` → `POST /environments/:id/duplicate` |
| Dedicated global-variables UI | `EnvironmentSidebar.tsx` ("Globals (Common)"), `TopBar.tsx` |
| Local runtime variables (`pm.variables`) | `client/src/utils/scripts.ts` |
| Dynamic variables (`{{$guid}}`, `{{$timestamp}}`, `{{$randomInt}}`) | `client/src/utils/variables.ts` |
| Light / dark theme toggle | `components/layout/TopBar.tsx` (OS *sync* is declined, section A) |
| Bearer / Basic / API-key / inherit auth | `components/request/AuthEditor.tsx` |
| Google SSO | `POST /api/auth/google` — `state`/CSRF is `TODO.md` SEC-11 |
| Traffic capture into the app | `CaptureTrafficModal.tsx`, `server/src/routes/capture.ts` — its fate is `TODO.md` SEC-0.5 |
