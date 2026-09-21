FROM node:20-slim AS builder

WORKDIR /app

# Copy all source code
COPY . .

# Build frontend
RUN cd client && npm install && npm run build

# Build backend
RUN cd server && npm install && npm run build

# Production image
FROM node:20-slim

WORKDIR /app

# Set production env
ENV NODE_ENV=production

# Copy server package.json and install production dependencies
COPY server/package.json ./server/
RUN cd server && npm install --omit=dev

# Copy built artifacts from builder
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/server/dist ./server/dist

WORKDIR /app/server

# Expose API and frontend port
EXPOSE 3005

# Start the server
CMD ["node", "dist/index.js"]
