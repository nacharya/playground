# reactapp/Dockerfile — React + Vite + nginx
# ============================================
# Stage 1: Build the React SPA with Vite
# Stage 2: Serve it with nginx (tiny, production-ready)

# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (cached layer if package.json unchanged)
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .

# Vite builds to ./dist — a fully static bundle (HTML, JS, CSS, assets)
# Build-time env vars are baked in at this point (VITE_ prefix required)
ARG VITE_API_BASE_URL=http://goffj:8500
ARG VITE_TRPC_URL=http://tsnode:8506
ARG VITE_WS_URL=ws://tsnode:8507
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_TRPC_URL=$VITE_TRPC_URL
ENV VITE_WS_URL=$VITE_WS_URL

RUN npm run build

# ── Stage 2: Runtime (nginx) ──────────────────────────────────────────────────
FROM nginx:1.25-alpine AS runtime

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our custom nginx config (handles SPA routing, proxying, caching)
COPY nginx.conf /etc/nginx/conf.d/playground.conf

# Copy the built React app
COPY --from=builder /app/dist /usr/share/nginx/html

# nginx runs as root by default — add non-root capability
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

# nginx foreground mode (required in Docker — daemon mode exits immediately)
CMD ["nginx", "-g", "daemon off;"]
