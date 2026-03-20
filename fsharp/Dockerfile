# fsharp/Dockerfile — F# + ASP.NET Core multi-stage build
# ===========================================================

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS builder

WORKDIR /build

# Copy solution and project files first — Docker caches the restore layer
# separately from the source code. If only .fs files change, restore is cached.
COPY Playground.sln .
COPY PlaygroundApi/PlaygroundApi.fsproj ./PlaygroundApi/
COPY PlaygroundApi.Tests/PlaygroundApi.Tests.fsproj ./PlaygroundApi.Tests/

# Restore NuGet packages
RUN dotnet restore Playground.sln

# Copy all source files and publish
COPY . .
RUN dotnet publish PlaygroundApi/PlaygroundApi.fsproj \
    --configuration Release \
    --no-restore \
    --output /publish

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
# ASP.NET Core runtime is much smaller than the SDK (~200MB vs ~800MB)
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime

# dotnet/aspnet:8.0 already includes a non-root 'app' user (UID 1654)
WORKDIR /app
COPY --from=builder --chown=app:app /publish ./

USER app

# REST API on 8508, gRPC on 8509
EXPOSE 8508 8509

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8508/health || exit 1

# ASP.NET Core reads ASPNETCORE_URLS to determine which ports to listen on
ENV ASPNETCORE_URLS="http://+:8508"
ENV ASPNETCORE_ENVIRONMENT="Production"

CMD ["dotnet", "PlaygroundApi.dll"]
