# Codetime app Dockerfile
# 1) Build and run Node server; 2) Build Vue dashboard into /public

FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# Install server deps first for better layer caching
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm i --omit=dev

# Copy rest of repo
COPY . .

# Build front-end (Vite) into /public
RUN cd web && npm ci || npm i && npm run build

# Optionally prune dev deps in root (already omitted above)
EXPOSE 3000
CMD ["node", "src/server.js"]

