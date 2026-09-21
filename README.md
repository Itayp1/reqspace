# Postman Web Clone

A comprehensive web-based Postman alternative with workspaces, role-based access control, header-based authentication, and offline capability.

## Project Structure
- `/client` - React frontend (Vite, Tailwind, Zustand)
- `/server` - Node.js/Express backend (MongoDB, Mongoose)
- `/tests` - Playwright E2E testing suite

## Testing
An extensive automated test suite covering all features, permissions (viewer/editor/etc), UI edge cases (zoom crashes), and auth flows (UID header) is available. 

👉 **[See TESTING.md](./TESTING.md) for full instructions on running and maintaining the 300+ test scenarios.**

## Running the app
The application is deployed via PM2 and Docker.
Use `pm2 start ecosystem.config.js` to run in development with auto-rebuild.
