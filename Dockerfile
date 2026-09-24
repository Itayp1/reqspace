# ── Builder ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Build dependencies for native modules (better-sqlite3, sqlite3, bcrypt).
RUN apk add --no-cache python3 make g++

# Install with the lockfile (reproducible) before copying source, so the
# dependency layers cache independently of code changes.
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci
COPY client ./client
RUN cd client && npm run build

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci
COPY server ./server
RUN cd server && npm run build

# Re-resolve server deps to production-only. Native addons are compiled here,
# while the build toolchain is still available, so the runtime image needs none.
RUN cd server && npm ci --omit=dev

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
# Single source of truth for the port across the stack (CR#17).
ENV PORT=3005

# Copy prebuilt artifacts and production node_modules only — no python/g++ in
# the final image.
COPY --from=builder /app/server/package.json ./server/package.json
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# Run as the non-root user that ships with the base image.
RUN chown -R node:node /app
USER node

WORKDIR /app/server

EXPOSE 3005

CMD ["node", "dist/index.js"]
