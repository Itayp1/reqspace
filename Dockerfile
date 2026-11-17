# ── Builder ───────────────────────────────────────────────────────────────────
# glibc (Debian) builder so native addons match the distroless runtime below (Alpine/musl would not).
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Build dependencies for native modules (better-sqlite3, sqlite3, bcrypt).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ zip && rm -rf /var/lib/apt/lists/* && corepack enable

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

# Writable data dir for the runtime (distroless has no shell to mkdir/chown).
RUN mkdir -p /data

# ── Runtime ───────────────────────────────────────────────────────────────────
# Distroless: no shell, no package manager, no BusyBox - minimal CVE surface. Its ENTRYPOINT is `node`.
FROM gcr.io/distroless/nodejs22-debian12

WORKDIR /app

ENV NODE_ENV=production
# Single source of truth for the port across the stack (CR#17).
ENV PORT=3005

# Copy prebuilt artifacts and production node_modules only — no python/g++ in
# the final image.
COPY --from=builder --chown=1000:1000 /app/server/package.json ./server/package.json
COPY --from=builder --chown=1000:1000 /app/server/node_modules ./server/node_modules
COPY --from=builder --chown=1000:1000 /app/server/dist ./server/dist
COPY --from=builder --chown=1000:1000 /app/client/dist ./client/dist
COPY --from=builder --chown=1000:1000 /app/reqspace-transport.zip ./reqspace-transport.zip
# Source folder: the .crx is rebuilt per request with the downloading site's origin as its default allowed origin.
COPY --from=builder --chown=1000:1000 /app/extension ./extension

COPY --from=builder --chown=1000:1000 /data /data
# UID 1000 = the old `node` user, so an existing /data volume stays writable.
USER 1000:1000

WORKDIR /app/server

EXPOSE 3005

CMD ["dist/index.js"]
