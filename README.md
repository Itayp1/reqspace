# 🚀 Reqspace

> A modern, lightweight, and open-source web-based API testing platform.

Reqspace (formerly Postman Web Clone) is a comprehensive API testing environment designed to run natively in your browser. It provides all the essential features you need to design, test, and manage APIs, backed by a powerful Node.js server that supports multiple database types and robust authentication.

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

## 📝 License

This project is open-source and available under the [ISC License](LICENSE).
