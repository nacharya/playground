# playui/Dockerfile — Python 3.12 multi-stage build
# ====================================================
# Stage 1 compiles dependencies; Stage 2 is the lean runtime image.
# Multi-stage builds keep the final image small by excluding build tools.

# ── Stage 1: Build (install Python packages) ──────────────────────────────
FROM python:3.12-slim AS builder

# System packages needed to compile some Python C extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ make libffi-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy requirements first — Docker caches this layer separately.
# If requirements.txt doesn't change, pip install is cached even if code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: Runtime ───────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# Copy installed packages from builder (no gcc needed at runtime)
COPY --from=builder /install /usr/local

# Create non-root user for security
RUN addgroup --system app && adduser --system --ingroup app app

WORKDIR /app
COPY --chown=app:app . .

# Make startup script executable
RUN chmod +x start.sh

USER app

# Streamlit runs on 8504, FastAPI/gRPC on 8505
EXPOSE 8504 8505

# start.sh launches both Streamlit and FastAPI concurrently
CMD ["./start.sh"]
