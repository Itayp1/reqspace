# ── Builder ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Build dependencies for native modules (better-sqlite3, sqlite3, bcrypt).
RUN apk add --no-cache python3 make g++ zip && corepack enable

# Install with the lockfile (reproducible) before copying source, so the
# dependency layers cache independently of code changes.
COPY client/package.json client/pnpm-lock.yaml client/.npmrc ./client/
RUN cd client && pnpm install --frozen-lockfile
COPY client ./client
ARG APP_VERSION=dev
RUN cd client && APP_VERSION=$APP_VERSION pnpm run build

# Package the browser extension so the web app can serve it for "Load unpacked".
COPY extension ./extension
RUN cd extension && zip -r ../reqspace-transport.zip .

COPY server/package.json server/pnpm-lock.yaml server/.npmrc ./server/
RUN cd server && pnpm install --frozen-lockfile
COPY server ./server
RUN cd server && pnpm run build

# Re-resolve server deps to production-only. Native addons are compiled here,
# while the build toolchain is still available, so the runtime image needs none.
RUN cd server && pnpm install --frozen-lockfile --prod

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
COPY --from=builder /app/reqspace-transport.zip ./reqspace-transport.zip
# Source folder: the .crx is rebuilt per request with the downloading site's origin as its default allowed origin.
COPY --from=builder /app/extension ./extension

# Run as the non-root user that ships with the base image.
RUN chown -R node:node /app && mkdir -p /data && chown node:node /data
USER node

WORKDIR /app/server

EXPOSE 3005

CMD ["node", "dist/index.js"]
