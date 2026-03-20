# goffj/Dockerfile
# Multi-stage build: builder compiles the Go binary; runtime is minimal Alpine.

# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM golang:1.21-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /build

# Copy all source files.
# go.mod uses local replace directives (./cloud, ./router, ./cmd, ./core)
# so we need all files present before `go mod download`.
COPY . .

RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -o /app/goffj .

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM alpine:3.19

RUN apk add --no-cache ca-certificates curl tzdata

RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=builder /app/goffj /app/goffj

USER app

EXPOSE 8500 8501 8510

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8500/health || exit 1

CMD ["/app/goffj"]
