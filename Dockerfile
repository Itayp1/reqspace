FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build both frontend and backend
RUN npm run build --workspace=client
RUN npm run build --workspace=server

# Production image
FROM node:24-alpine

WORKDIR /app

# Set production env
ENV NODE_ENV=production

# Copy package files and install only production dependencies for the server
COPY package.json ./
COPY server/package.json ./server/
RUN npm install --omit=dev --workspace=server

# Copy built artifacts from builder
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/server/dist ./server/dist

WORKDIR /app/server

# Expose API and frontend port
EXPOSE 3005

# Start the server
CMD ["node", "dist/index.js"]
