# pgctl/Dockerfile
# Multi-stage build: builder compiles the Rust binary; runtime is minimal Alpine.

# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM rust:alpine AS builder

# musl-dev needed for static linking on Alpine; pkgconfig for some crates
RUN apk add --no-cache musl-dev pkgconfig openssl-dev

WORKDIR /build

# Cache dependency compilation separately from application code.
# Copy only the manifest files first, create a dummy main.rs to compile deps.
COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs && \
    cargo build --release 2>/dev/null || true && \
    rm -rf src

# Now copy real source and build (deps are already cached)
COPY src ./src
# Touch main.rs so Cargo knows it changed (avoids stale cache)
RUN touch src/main.rs && \
    cargo build --release

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM alpine:3.19

RUN apk add --no-cache ca-certificates curl

RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=builder /build/target/release/pgctl /app/pgctl

USER app

EXPOSE 8502 8503 8511

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8502/ || exit 1

CMD ["/app/pgctl", "server", "-s"]
