# ReqSpace Features Roadmap

Audited against the client and server on 2026-09-24. Items marked **Done** already exist in this repo (sometimes partially). Unmarked items are still missing.

## Protocols & API Types
1. **GraphQL Support** - Full support including schema introspection and query builder.
2. **GraphQL Variables** - Dedicated editor for GraphQL variables.
3. **WebSockets (ws/wss)** - Real-time bi-directional communication.
4. **Socket.IO Support** - Native support for Socket.IO events and connections.
5. **Server-Sent Events (SSE)** - Streaming response support.
6. **gRPC Support** - Protobuf definition import and server reflection.
7. **MQTT Support** - IoT message broker protocol.
8. **GraphQL Subscriptions** - Real-time GraphQL data streams.

## Authentication Methods
9. **OAuth 2.0** - Built-in flow for fetching, refreshing, and managing tokens (including PKCE).
10. **OAuth 1.0** - Signature generation for OAuth 1.0a.
11. **AWS Signature v4** - Auto-generating signatures for AWS services.
12. **Digest Auth** - Standard HTTP Digest authentication.
13. **NTLM Authentication** - Windows network authentication.
14. **Hawk Authentication** - MAC-based HTTP authentication.
15. **Akamai EdgeGrid** - Authentication for Akamai APIs.
16. **ASAPS Auth** - Advanced security authentication.

## Automation & Testing
17. **CLI Integration (Newman)** - Command-line runner for collections. **Done (partial):** `POST /api/runner/run` returns an RBAC-checked run plan; the in-app runner is `CollectionRunnerModal`.
18. **Performance/Load Testing** - Simulating multiple virtual users. **Done:** `LoadTestModal` drives `/api/proxy`.
19. **CI/CD Integration** - GitHub Actions, GitLab, Jenkins native support.
20. **Scheduled Monitors** - Running collections on a cron schedule in the cloud.
21. **Webhooks** - Triggering collection runs via external URLs.
22. **Data-Driven Testing** - Importing CSV/JSON files in the Collection Runner.
23. **Advanced Test Snippets** - Built-in Chai BDD assertions in the sidebar. **Done:** `ScriptEditor` snippets; scripts run in the web worker sandbox.
24. **Visualizer (`pm.visualizer`)** - Rendering HTML/Handlebars templates from response data. **Done:** self-hosted Handlebars, sandboxed iframe.
25. **Test Reporting** - Exporting results to HTML, JUnit, or JSON.

## Collaboration & Workspaces
26. **Public Workspaces** - Exposing APIs to the public internet.
27. **Partner Workspaces** - Secure B2B API sharing.
28. **RBAC at Collection Level** - Restricting Editor/Viewer access per collection.
29. **Forking Collections** - Creating a personal copy linked to the original.
30. **Pull Requests** - Proposing changes from a fork back to the main collection.
31. **Merge & Conflict Resolution** - UI for resolving merge conflicts on collections.
32. **Activity Feed / Audit Logs** - Timeline of who changed what.
33. **User Tagging (@)** - Tagging team members in comments.
34. **Inline Comments** - Commenting directly on specific requests or script lines.

## API Design & Documentation
35. **API Builder** - Central hub for API-first design.
36. **OpenAPI/Swagger Import/Sync** - Two-way sync with OpenAPI specs.
37. **Auto-Generated Docs** - Hosted, shareable documentation web pages.
38. **Markdown Live Preview** - Rich editing for request/collection descriptions.
39. **API Versioning** - Linking specific collections to API versions (v1, v2).
40. **Schema Validation** - Validating actual responses against the API schema.
41. **Mock Servers** - Hosted endpoints returning mock data based on saved examples.
42. **Saved Examples** - Saving multiple example responses per request.

## Request Configuration
43. **Request Interceptor** - Browser extension to capture live web traffic into ReqSpace.
44. **Proxy Settings** - Custom HTTP/SOCKS proxies per request.
45. **Client SSL Certificates** - Managing certs per domain (PFX, PEM).
46. **Disable SSL Verification** - Toggle to ignore self-signed certificates.
47. **Automatic Retries** - Retrying on network failure.
48. **Follow HTTP Redirects** - Toggle for following 3xx redirects.
49. **Extensive Code Generation** - Exporting to Java, Python, Go, Ruby, Swift, Dart, PHP, etc.
50. **Dynamic Variables** - Built-in Faker.js variables (`{{$guid}}`, `{{$timestamp}}`).

## Environments & Variables
51. **Secret Variables** - Values masked in the UI and never synced to the cloud.
52. **Environment Duplication** - One-click clone of environments.
53. **Dedicated Global Variables UI** - Better management of globals.
54. **Collection Variables** - Variables scoped specifically to a collection.
55. **Local Variables (`pm.variables.set`)** - Ephemeral runtime variables.
56. **Scope Resolution Visualizer** - UI showing exactly which scope a variable resolved from.

## Import / Export
57. **Import from cURL** - Pasting cURL commands to generate requests.
58. **Export to cURL** - Quickly getting the cURL equivalent of the UI request.
59. **Export Collection (v2.1)** - Standard ReqSpace JSON export.
60. **Import ReqSpace Collection** - Supporting v2.0 and v2.1 formats.
61. **Import Environment** - Loading environment JSON files.
62. **Export Environment** - Sharing environment variables.
63. **Raw Text Import** - Parsing raw HTTP messages.

## UI & UX Enhancements
64. **Multi-Tab Support** - Opening many requests simultaneously in tabs.
65. **Split Pane Tabs** - Viewing multiple tabs side-by-side.
66. **OS Theme Sync** - Automatically switching dark/light mode based on system.
67. **Customizable Layout** - Toggling between horizontal and vertical split.
68. **History Search & Filter** - Finding past requests easily.
69. **Restore Closed Tabs** - Re-opening accidentally closed requests.
70. **Rich Text Descriptions** - WYSIWYG editor for documentation.
71. **Drag-and-Drop Reordering** - Reordering tabs and folders intuitively.
72. **Right-Click Context Menus** - Advanced options on tree nodes.
73. **Global Keyboard Shortcuts** - Shortcuts for sending, saving, opening tabs.
74. **UI Zoom Control** - Scaling the interface up and down.

## Response Handling
75. **JSONPath/XPath Filtering** - Extracting specific fields from massive responses.
76. **Find & Replace in Response** - Searching within the response body.
77. **Auto-Formatting** - Prettier formatting for HTML/XML/JSON natively.
78. **Visual Payload Viewer** - Rendering PDF or image responses directly.
79. **Force Character Encoding** - Overriding standard UTF-8.
80. **Save Response to File** - Downloading raw binary responses.

## Scripting & Sandbox
81. **`pm.sendRequest`** - Firing async API requests from within scripts.
82. **Advanced Console** - Grouped object logging (collapsible objects/arrays).
83. **External Libraries** - Support for `moment`, `lodash`, `cheerio`, `crypto-js`.
84. **Script Library/Packages** - Reusing scripts across multiple collections.
85. **Collection-Level Scripts** - Pre-request and tests running for all requests in a collection.
86. **Folder-Level Scripts** - Scripts scoped to a specific folder.

## Settings & Admin
87. **Request Timeout Limits** - Customizing max request duration.
88. **Max Response Size** - Truncating responses to prevent memory crashes.
89. **Auto-Save Toggle** - Enabling automatic saving of dirty requests.
90. **Two-Factor Authentication (2FA)** - Enhanced account security.
91. **SSO Integration** - Google, GitHub, Okta, and SAML support.
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
