# 🚀 Reqspace

> A modern, lightweight, and open-source web-based API testing platform.

Reqspace (formerly reqSpace Clone) is a comprehensive API testing environment designed to run natively in your browser. It provides all the essential features you need to design, test, and manage APIs, backed by a powerful Node.js server that supports multiple database types and robust authentication.

## ✨ Features

- **🌐 Complete API Client:** Send GET, POST, PUT, DELETE, PATCH, and OPTIONS requests with full control over headers, query parameters, and body payloads (JSON, Text, Form Data).
- **📂 Collections & Folders:** Organize your endpoints logically into collections and nested folders.
- **🔄 Dynamic Environments:** Create multiple environments (Local, Staging, Prod) and use {{variables}} seamlessly across your URLs, headers, and bodies.
- **🔐 Authentication:** Built-in JWT-based local authentication and **Google OAuth** integration. 
- **👥 Role-Based Access Control (RBAC):** Admin dashboard to manage users, permissions, and system configurations directly from the UI.
- **📜 History & Audit Logs:** Never lose a request. Everything is saved in your personal history, and system-wide changes are securely audited.
- **📦 Multi-Database Support:** Run it on your preferred database! Out-of-the-box support for **SQLite, PostgreSQL, MySQL, and MongoDB**.
- **🐳 Docker Ready:** Fully containerized with a lightweight multi-stage Docker build for easy deployment.

## 🛠️ Tech Stack

- **Frontend:** React, TypeScript, TailwindCSS, Zustand (State Management), Vite/Rolldown
- **Backend:** Node.js, Express, TypeScript, Sequelize (SQL), Mongoose (NoSQL)
- **Containerization:** Docker, GitHub Actions

## 🐳 Quick Start (Docker)

The fastest way to get Reqspace running is via Docker. The image is automatically built and published.

`ash
# Run the application on port 3005
docker run -p 3005:3005 -d itayp/reqspace:latest
`
Access the application at http://localhost:3005.

## 💻 Local Development

If you want to contribute or run the project locally:

### Prerequisites
- Node.js (v20+ or v22+ recommended)
- A supported database (or just use the default SQLite!)

### Installation

1. **Clone the repository:**
   `ash
   git clone https://github.com/Itayp1/reqspace.git
   cd reqspace
   `

2. **Install Dependencies:**
   `ash
   # Install Server dependencies
   cd server
   npm install

   # Install Client dependencies
   cd ../client
   npm install
   `

3. **Configure Environment Variables:**
   Copy the example environment file in the server directory:
   `ash
   cd server
   cp .env.example .env
   `
   *By default, Reqspace uses a local SQLite database requiring zero configuration!*

4. **Run the Application (Development Mode):**
   `ash
   # In one terminal window (Start Server)
   cd server
   npm run dev

   # In another terminal window (Start Client)
   cd client
   npm run dev
   `

## ⚙️ Configuration & Databases

Reqspace uses an intelligent database connector. You can easily switch your database by editing the DB_TYPE variable in your server/.env file:

`env
# Choose between: sqlite, postgres, mysql, mongodb
DB_TYPE=sqlite

# If using postgres/mysql/mongodb, provide the URI:
DB_URI=mongodb://localhost:27017/reqspace
`

## 🔑 Google OAuth Setup

You can enable Google Authentication without touching the code!
1. Log in to Reqspace with an Admin account.
2. Go to the **Admin Dashboard** -> **Settings**.
3. Toggle "Enable Google OAuth" and enter your Client ID and Secret.
4. Save, and the "Continue with Google" button will instantly appear on the login screen.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! 
Feel free to check [issues page](https://github.com/Itayp1/reqspace/issues).

## 🔒 Security & Architecture Decisions (Sept 2026)

Based on a recent security and architecture review, the following principles and fixes are actively being applied to the project:

1. **Client-Side Scripts Sandbox:** Pre-request and test scripts will be executed in a secure Sandbox (Web Worker or Sandboxed Iframe) to prevent XSS and secure local storage secrets.
2. **Strict Header Authentication:** Header-based authentication (`X-Auth-User`) is disabled by default and will only be allowed if explicitly enabled in the Admin Dashboard (assumed to be behind a trusted reverse proxy).
3. **Strict Input Validation:** We are rolling out strict `Zod` validation schemas across all API endpoints to prevent Mass Assignment and ensure data integrity.
4. **Client-Side Proxy Execution:** The proxy architecture is being redesigned so that the central Reqspace server does not execute proxy requests directly. Proxying will be handled by external proxies or directly from the Client station.
5. **SSRF Allowances:** The proxy natively allows internal network requests (SSRF) as it is a core feature of API testing tools for local network development.
6. **Cross-Database Compatibility:** The system is strictly designed to support **both SQL and MongoDB**. Any direct Mongoose usages outside of Repositories are being migrated to abstracted Repositories to ensure seamless SQL support.

## 🚀 Scalability & Performance (High-Scale Architecture)

To support enterprise-grade scale (e.g., **400k+ Workspaces, 2M+ Collections, 20M+ Requests**), the architecture incorporates the following principles:

1. **Database Indexing:** Strict enforcement of indexes on foreign keys (`workspaceId`, `collectionId`, `folderId`) and compound indexes for heavily queried fields (like `order` and `parentFolderId`). Without these, queries on a 20M row `requests` table would result in catastrophic full-table scans.
2. **Lazy Loading & Pagination:** The API and Client UI must avoid fetching entire workspace trees simultaneously. Endpoints will use cursor-based pagination, and the Client will lazy-load nested resources (Folders/Requests) only when expanded.
3. **Optimized Realtime Sync:** The WebSocket (`SocketSync`) architecture will move from "refetch everything on change" to **granular delta updates**. Clients will only receive the specific document that changed (e.g., `request:updated`) instead of querying the DB for the whole tree again.
4. **RBAC & Configuration Caching:** Frequently accessed data, such as workspace membership (roles) and system configurations, will be offloaded to an in-memory caching layer (or Redis) to reduce load on the primary relational/document database during heavy proxy traffic.
5. **High-Concurrency WebSockets (10,000+ Active Users):** To support 10k+ simultaneous live connections without CPU/Memory exhaustion on a single instance, the Socket.io implementation requires **Horizontal Scaling**. This means deploying multiple server replicas behind a Load Balancer (with Sticky Sessions) and using a **Redis Adapter**. The Redis Adapter ensures that a realtime event generated on Server Node A is seamlessly broadcasted to the relevant users connected to Server Node B.

## 📋 Active Tasks & Roadmap

* [ ] **Optional Redis Concurrency Mode:** Implement an optional Redis adapter for Socket.io to support horizontal scaling out-of-the-box.
  * **Configurable:** Driven by an environment variable (e.g., `REDIS_URL=redis://localhost:6379`). If absent, the server gracefully falls back to single-node (in-memory) mode.
  * **Server Startup:** The server will automatically detect the variable and attach the adapter during boot.
  * **Admin UI Indicator:** The Admin Dashboard will feature a clear visual indicator showing whether "Redis Concurrency Mode" is currently Active or Inactive.

## 📝 License

This project is open-source and available under the [ISC License](LICENSE).
