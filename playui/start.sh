#!/bin/sh
# start.sh — Launch Streamlit + FastAPI concurrently
# ====================================================
# Both servers run in the background; the script waits for either to exit.
# If one crashes, the container exits (allowing Docker to restart it).

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

# Wait for either process to exit
wait -n $STREAMLIT_PID $FASTAPI_PID
EXIT_CODE=$?

echo "A server exited with code $EXIT_CODE — shutting down"
kill $STREAMLIT_PID $FASTAPI_PID 2>/dev/null || true
exit $EXIT_CODE
