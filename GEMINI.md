# Agent Guidelines for ReqSpace Project

## Background Tasks & Terminals
- **NEVER** leave background tasks, development servers (`npm run dev`), or test runners executing indefinitely after you have finished your active goal.
- Always cleanly terminate and kill any terminals or background tasks you spawned before completing your response to the user.

## Build Process & PM2
- This project uses `pm2` to manage the server, and the server acts as the host that serves the client application.
- After making changes to the codebase, you MUST run the build step for the application so that the `pm2` process can serve the updated client. Do not forget to build!
