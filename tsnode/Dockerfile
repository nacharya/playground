# tsnode/Dockerfile — TypeScript + Node.js 20 multi-stage build
# ================================================================

# ── Stage 1: Install dependencies ─────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# Install all deps (including devDeps needed for tsc), then snapshot prod-only modules
RUN npm install && cp -r node_modules /prod_modules_tmp && \
    npm prune --omit=dev && cp -r node_modules /prod_modules && \
    cp -r /prod_modules_tmp/. node_modules

# ── Stage 2: Build TypeScript ─────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# tsc compiles TypeScript → JavaScript in ./dist
RUN npm run build

# ── Stage 3: Lean runtime image ───────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Security: run as non-root
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

# Only copy what's needed at runtime (not dev dependencies or source)
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=deps    --chown=app:app /prod_modules ./node_modules
COPY --chown=app:app package.json .

USER app

# HTTP/tRPC, WebSocket, gRPC
EXPOSE 8506 8507 8513

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8506/health || exit 1

CMD ["node", "dist/server.js"]
