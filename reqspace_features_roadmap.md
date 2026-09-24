# ReqSpace Features Roadmap (100 Missing Features)

Audited against the code in September 2026. **Landed** means the behavior is in the app. **Partial** means a narrower version is in the app. Unmarked items are still absent.

## Protocols & API Types
1. **Partial — GraphQL Support** — request body mode `graphql` exists. Schema introspection and a query builder do not.
2. **Partial — GraphQL Variables** — the GraphQL body has a variables field. It is not a separate schema-aware editor.
3. **WebSockets (ws/wss)** - Real-time bi-directional communication.
4. **Socket.IO Support** - Native support for Socket.IO events and connections. (The app uses Socket.IO for its own sync, not as a request protocol.)
5. **Server-Sent Events (SSE)** - Streaming response support.
6. **gRPC Support** - Protobuf definition import and server reflection.
7. **MQTT Support** - IoT message broker protocol.
8. **GraphQL Subscriptions** - Real-time GraphQL data streams.

## Authentication Methods
9. **Partial — OAuth 2.0** — a saved bearer token can be sent as `Authorization`. The PKCE token-fetch flow is not built.
10. **OAuth 1.0** - Signature generation for OAuth 1.0a.
11. **AWS Signature v4** - Auto-generating signatures for AWS services.
12. **Digest Auth** - Standard HTTP Digest authentication.
13. **Partial — NTLM Authentication** — username, password, domain, and workstation are forwarded to the proxy on custom headers. The proxy does not complete an NTLM handshake.
14. **Hawk Authentication** - MAC-based HTTP authentication.
15. **Akamai EdgeGrid** - Authentication for Akamai APIs.
16. **ASAPS Auth** - Advanced security authentication.

## Automation & Testing
17. **CLI Integration (Newman)** - Command-line runner for collections.
18. **Landed — Performance/Load Testing** — `LoadTestModal` runs repeated requests.
19. **CI/CD Integration** - GitHub Actions, GitLab, Jenkins native support. (Repo CI tests the app; it does not run user collections.)
20. **Scheduled Monitors** - Running collections on a cron schedule in the cloud.
21. **Webhooks** - Triggering collection runs via external URLs.
22. **Partial — Data-Driven Testing** — the collection runner reads an iteration data array. There is no CSV/JSON file picker on that modal.
23. **Landed — Advanced Test Snippets** — `ScriptEditor` inserts snippets, and test scripts use Chai `expect`.
24. **Landed — Visualizer (`pm.visualizer`)** — templates render in a sandboxed iframe with self-hosted Handlebars.
25. **Test Reporting** - Exporting results to HTML, JUnit, or JSON.

## Collaboration & Workspaces
26. **Partial — Public Workspaces** — `isPublic` is stored and listed. There is no public internet catalog.
27. **Partner Workspaces** - Secure B2B API sharing.
28. **RBAC at Collection Level** - Restricting Editor/Viewer access per collection. (Roles are per workspace.)
29. **Forking Collections** - Creating a personal copy linked to the original.
30. **Pull Requests** - Proposing changes from a fork back to the main collection.
31. **Merge & Conflict Resolution** - UI for resolving merge conflicts on collections. (Open request tabs can be marked conflicted from a newer socket update; that is not a fork merge.)
32. **Partial — Activity Feed / Audit Logs** — superadmin audit log list. No per-user activity feed.
33. **User Tagging (@)** - Tagging team members in comments.
34. **Partial — Inline Comments** — requests have comments. Comments are not anchored to a script line.

## API Design & Documentation
35. **API Builder** - Central hub for API-first design.
36. **Partial — OpenAPI/Swagger Import/Sync** — import has an OpenAPI tab and a WSDL URL import. Two-way sync is not built.
37. **Partial — Auto-Generated Docs** — `DocumentationModal` renders a collection in the app. Docs are not a hosted public site.
38. **Markdown Live Preview** - Rich editing for request/collection descriptions.
39. **API Versioning** - Linking specific collections to API versions (v1, v2).
40. **Schema Validation** - Validating actual responses against the API schema.
41. **Mock Servers** - Hosted endpoints returning mock data based on saved examples.
42. **Saved Examples** - Saving multiple example responses per request.

## Request Configuration
43. **Partial — Request Interceptor** — `POST /api/capture` stores a request into a collection. There is no browser extension.
44. **Landed — Proxy Settings** — global proxy host settings are stored and sent with the proxy call.
45. **Landed — Client SSL Certificates** — certificates are saved per hostname and encrypted at rest.
46. **Landed — Disable SSL Verification** — `verifySsl` is a request and global setting.
47. **Automatic Retries** - Retrying on network failure.
48. **Landed — Follow HTTP Redirects** — `followRedirects` is a request and global setting.
49. **Partial — Extensive Code Generation** — cURL, fetch, axios, Python (requests and httpx), Go, and C#. Not Java, Ruby, Swift, Dart, or PHP.
50. **Dynamic Variables** - Built-in Faker.js variables (`{{$guid}}`, `{{$timestamp}}`).

## Environments & Variables
51. **Partial — Secret Variables** — variables have `isSecret`. Secret request auth is stripped from `localStorage`. Values are not kept out of the database.
52. **Landed — Environment Duplication** — `POST /environments/:id/duplicate`.
53. **Landed — Dedicated Global Variables UI** — a workspace global environment is loaded beside named environments.
54. **Landed — Collection Variables** — collections store variables and scripts can read them.
55. **Landed — Local Variables (`pm.variables.set`)** — the sandbox keeps a variable map for the run.
56. **Scope Resolution Visualizer** - UI showing exactly which scope a variable resolved from.

## Import / Export
57. **Landed — Import from cURL** — Import modal posts to `/requests/import/curl`.
58. **Landed — Export to cURL** — code generation includes cURL.
59. **Landed — Export Collection (v2.1)** — `GET /collections/:id/export`.
60. **Partial — Import ReqSpace Collection** — v2.1 import is implemented. v2.0 is not a separate parser.
61. **Import Environment** - Loading environment JSON files.
62. **Export Environment** - Sharing environment variables.
63. **Landed — Raw Text Import** — the import modal has a raw HTTP tab.

## UI & UX Enhancements
64. **Landed — Multi-Tab Support** — requests open as tabs.
65. **Split Pane Tabs** - Viewing multiple tabs side-by-side.
66. **OS Theme Sync** - Automatically switching dark/light mode based on system.
67. **Customizable Layout** - Toggling between horizontal and vertical split.
68. **Partial — History Search & Filter** — history is stored and listed. The sidebar is not a full query UI over method and status.
69. **Restore Closed Tabs** - Re-opening accidentally closed requests.
70. **Rich Text Descriptions** - WYSIWYG editor for documentation.
71. **Partial — Drag-and-Drop Reordering** — tree nodes can be dragged. Tab reordering is not a separate layout.
72. **Landed — Right-Click Context Menus** — collection tree nodes use `useContextMenu`.
73. **Partial — Global Keyboard Shortcuts** — the URL bar listens for a keydown. There is no shortcut map for every action.
74. **UI Zoom Control** - Scaling the interface up and down.

## Response Handling
75. **Partial — JSONPath/XPath Filtering** — the response body has a text filter. It is not JSONPath or XPath.
76. **Partial — Find in Response** — body and header panes have a search field. Replace is not implemented.
77. **Partial — Auto-Formatting** — pretty mode formats JSON and XML. It does not run Prettier.
78. **Partial — Visual Payload Viewer** — image responses can render; PDF tells the user to download.
79. **Force Character Encoding** - Overriding standard UTF-8.
80. **Landed — Save Response to File** — the response viewer downloads the body.

## Scripting & Sandbox
81. **Landed — `pm.sendRequest`** — the sandbox posts an allowlisted request to the parent, which calls the proxy.
82. **Partial — Advanced Console** — script logs are lines in the console store. Objects are stringified, not collapsible.
83. **Partial — External Libraries** — scripts receive `moment`, `lodash`, and `crypto-js`. `cheerio` is not included.
84. **Script Library/Packages** - Reusing scripts across multiple collections.
85. **Partial — Collection-Level Scripts** — collections store `preRequestScript` and `testScript`. The send path runs folder and request scripts.
86. **Landed — Folder-Level Scripts** — folder scripts run before the request script on send.

## Settings & Admin
87. **Landed — Request Timeout Limits** — client timeout settings, capped at 120 seconds on the server.
88. **Landed — Max Response Size** — proxy responses stop at `MAX_PROXY_RESPONSE_BYTES` (default 5 MB).
89. **Auto-Save Toggle** - Enabling automatic saving of dirty requests.
90. **Two-Factor Authentication (2FA)** - Enhanced account security.
91. **Partial — SSO Integration** — Google OAuth is implemented. GitHub, Okta, and SAML are not.
92. **Custom Themes** - Fine-tuning interface colors.

## Advanced Development
93. **ReqSpace API Integration** - Accessing ReqSpace data programmatically.
94. **GraphQL Autocomplete** - Intellisense for GraphQL queries based on schema.
95. **gRPC Autocomplete** - Intellisense based on Protobuf definitions.
96. **Mock Delay Simulation** - Simulating network latency on mock servers.
97. **Advanced Mock Matching** - Mock servers that respond differently based on request headers/body.

## Security & Privacy
98. **Token Scanner** - Alerting users if secrets are pushed to public workspaces.
99. **Enterprise Agent** - Desktop agent to access localhost/private intranets from the web.
100. **Data Residency** - Choosing between US and EU servers for compliance.
