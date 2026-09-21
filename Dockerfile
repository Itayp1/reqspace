FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (sqlite3, bcrypt)
RUN apk add --no-cache python3 make g++

# Copy all source code
COPY . .

# Build frontend
RUN cd client && npm install && npm run build

# Build backend
RUN cd server && npm install && npm run build

# Production image
FROM node:22-alpine

WORKDIR /app

# Install build dependencies again for production native modules
RUN apk add --no-cache python3 make g++

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
