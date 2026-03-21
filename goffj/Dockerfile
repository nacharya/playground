# goffj/Dockerfile
# Multi-stage build: builder compiles the Go binary; runtime is minimal Alpine.

# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM golang:1.21-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /build

# go.mod uses local replace directives (./cloud, ./router, ./cmd, ./core)
# so we need all files present before `go mod download`.
COPY . .

RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -o /app/goffj .

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM alpine:3.19

RUN apk add --no-cache ca-certificates wget tzdata

RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=builder /app/goffj /app/goffj

# Create data directory for BoltDB/SQLite files
RUN mkdir -p /data && chown app:app /data

USER app

EXPOSE 8500 8501 8510

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://localhost:8500/health || exit 1

# goffj reads ~/.tmd/config.json at startup.
# We write it at container start so port/datavol are correct for Docker.
ENTRYPOINT ["/bin/sh", "-c"]
CMD ["mkdir -p /home/app/.tmd && \
  printf '{\"name\":\"xdata\",\"port\":\":8500\",\"datavol\":\"/data\",\"userdb\":\"users.db\",\"realmdb\":\"realms.db\",\"appdb\":\"apps.db\",\"taskdb\":\"tasks.db\",\"loglevel\":\"info\"}' \
  > /home/app/.tmd/config.json && \
  exec /app/goffj server start"]
