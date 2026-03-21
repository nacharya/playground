#!/bin/sh
# start.sh — Launch Streamlit + FastAPI concurrently
# ====================================================
# Both servers run in the background; the script polls until either exits.
# Using a polling loop because `wait -n` is bash 5.1+ and not available in sh/dash.

set -e

# Start Streamlit on port 8504
streamlit run streamlit/app.py \
    --server.port="${STREAMLIT_SERVER_PORT:-8504}" \
    --server.address=0.0.0.0 \
    --server.headless=true \
    --browser.gatherUsageStats=false &
STREAMLIT_PID=$!

# Start FastAPI + gRPC server on port 8505
python grpc_server.py &
FASTAPI_PID=$!

echo "Streamlit PID: $STREAMLIT_PID (port ${STREAMLIT_SERVER_PORT:-8504})"
echo "FastAPI/gRPC PID: $FASTAPI_PID (port 8505)"

# Poll every 5s until one of the processes exits
while true; do
    sleep 5
    # kill -0 checks if process is alive without sending a signal
    if ! kill -0 "$STREAMLIT_PID" 2>/dev/null; then
        echo "Streamlit (PID $STREAMLIT_PID) exited — shutting down"
        kill "$FASTAPI_PID" 2>/dev/null || true
        exit 1
    fi
    if ! kill -0 "$FASTAPI_PID" 2>/dev/null; then
        echo "FastAPI (PID $FASTAPI_PID) exited — shutting down"
        kill "$STREAMLIT_PID" 2>/dev/null || true
        exit 1
    fi
done
