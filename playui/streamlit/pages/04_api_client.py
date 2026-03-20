"""
Live API Client — goffj REST API Explorer
==========================================

This page demonstrates calling a live REST API from Python using httpx,
and displaying JSON responses interactively in Streamlit.

The goffj service (Go + Gin) runs at GOFFJ_API_URL (default: http://goffj:8500)
and provides CRUD APIs for Users, Realms, Apps, and Tasks.

Key Python concepts:
  httpx        — modern async HTTP client (successor to requests)
  asyncio.run  — run an async function from synchronous code
  pydantic     — parse and validate API responses at runtime
  st.session_state — persist data across Streamlit reruns
"""

import asyncio
import json
import os
import time
from typing import Any

import httpx
import streamlit as st

st.set_page_config(page_title="API Client", layout="wide")
st.title("🌐 Live API Client — goffj Explorer")

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
DEFAULT_URL = os.environ.get("GOFFJ_API_URL", "http://localhost:8500")

with st.sidebar:
    st.header("⚙️ Configuration")
    base_url = st.text_input("Base URL", value=DEFAULT_URL)
    timeout = st.slider("Timeout (seconds)", 1, 30, 5)

    st.markdown("---")
    st.markdown("**goffj REST API**")
    st.markdown("""
    | Method | Endpoint | Description |
    |--------|----------|-------------|
    | GET | /healthcheck | Health check |
    | GET | /api/v1/realm/ | List realms |
    | GET | /api/v1/user/:name | Get user |
    | POST | /api/v1/user/:name | Create user |
    | GET | /api/v1/task/:id | Get task |
    """)

# ─────────────────────────────────────────────────────────────────────────────
# Endpoint definitions
# ─────────────────────────────────────────────────────────────────────────────

ENDPOINTS = {
    "GET /healthcheck": {
        "method": "GET",
        "path": "/healthcheck",
        "description": "Service health check. Returns status: ok if the server is running.",
        "body_schema": None,
    },
    "GET /ready": {
        "method": "GET",
        "path": "/ready",
        "description": "Kubernetes readiness probe endpoint.",
        "body_schema": None,
    },
    "GET /api/v1/realm/": {
        "method": "GET",
        "path": "/api/v1/realm/",
        "description": "List all realms in the system.",
        "body_schema": None,
    },
    "GET /api/v1/user/:name": {
        "method": "GET",
        "path": "/api/v1/user/{name}",
        "description": "Retrieve a specific user by username.",
        "path_params": ["name"],
        "body_schema": None,
    },
    "POST /api/v1/user/:name": {
        "method": "POST",
        "path": "/api/v1/user/{name}",
        "description": "Create a new user. The name in the path becomes the username.",
        "path_params": ["name"],
        "body_schema": {
            "id": "string",
            "username": "string",
            "email": "string (required)",
            "name": "string",
            "role": "Admin | Contributor | ReadOnly",
            "realms": ["realm-id-1", "..."],
        },
    },
    "GET /api/v1/task/:id": {
        "method": "GET",
        "path": "/api/v1/task/{id}",
        "description": "Retrieve a task by ID.",
        "path_params": ["id"],
        "body_schema": None,
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# Request execution
# ─────────────────────────────────────────────────────────────────────────────

async def make_request(
    method: str,
    url: str,
    body: dict | None = None,
    timeout: float = 5.0,
) -> dict[str, Any]:
    """
    Async HTTP request using httpx.AsyncClient.

    httpx vs requests:
      - httpx supports async (aiohttp-compatible)
      - httpx has HTTP/2 support
      - httpx has better timeouts (connect + read separately)
      - httpx is type-annotated
    """
    async with httpx.AsyncClient() as client:
        start = time.perf_counter()
        try:
            if method == "GET":
                response = await client.get(url, timeout=timeout)
            elif method == "POST":
                response = await client.post(url, json=body, timeout=timeout)
            elif method == "PUT":
                response = await client.put(url, json=body, timeout=timeout)
            elif method == "DELETE":
                response = await client.delete(url, timeout=timeout)
            else:
                raise ValueError(f"Unsupported method: {method}")

            elapsed_ms = (time.perf_counter() - start) * 1000

            try:
                body_parsed = response.json()
            except Exception:
                body_parsed = response.text

            return {
                "status_code": response.status_code,
                "elapsed_ms": elapsed_ms,
                "headers": dict(response.headers),
                "body": body_parsed,
                "error": None,
            }
        except httpx.ConnectError as e:
            return {"error": f"Connection refused: {e}", "status_code": None, "elapsed_ms": None, "body": None, "headers": {}}
        except httpx.TimeoutException:
            return {"error": f"Timeout after {timeout}s", "status_code": None, "elapsed_ms": None, "body": None, "headers": {}}
        except Exception as e:
            return {"error": str(e), "status_code": None, "elapsed_ms": None, "body": None, "headers": {}}


# ─────────────────────────────────────────────────────────────────────────────
# UI
# ─────────────────────────────────────────────────────────────────────────────

col_request, col_response = st.columns([1, 1])

with col_request:
    st.subheader("📤 Request Builder")

    endpoint_key = st.selectbox("Endpoint", list(ENDPOINTS.keys()))
    endpoint = ENDPOINTS[endpoint_key]

    method = endpoint["method"]
    path_template = endpoint["path"]

    st.markdown(f"**Description:** {endpoint['description']}")

    # Fill in path parameters
    path_params = endpoint.get("path_params", [])
    path_values: dict[str, str] = {}
    if path_params:
        st.markdown("**Path parameters:**")
        for param in path_params:
            path_values[param] = st.text_input(f"{{{param}}}", value="alice" if param == "name" else "task-1")

    # Build the URL
    path = path_template
    for param, value in path_values.items():
        path = path.replace(f"{{{param}}}", value)
    full_url = base_url.rstrip("/") + path
    st.code(f"{method} {full_url}", language="http")

    # Request body editor for POST/PUT
    body_dict: dict | None = None
    if endpoint.get("body_schema"):
        st.markdown("**Request body (JSON):**")
        schema = endpoint["body_schema"]
        body_text = st.text_area(
            "JSON body",
            value=json.dumps(schema, indent=2),
            height=180,
        )
        try:
            body_dict = json.loads(body_text)
            st.success("✅ Valid JSON")
        except json.JSONDecodeError as e:
            st.error(f"Invalid JSON: {e}")
            body_dict = None

    # Send button
    if st.button(f"▶ Send {method} Request", type="primary"):
        with st.spinner("Sending..."):
            result = asyncio.run(make_request(method, full_url, body_dict, timeout))

        # Save to request history
        if "history" not in st.session_state:
            st.session_state["history"] = []
        st.session_state["history"].insert(0, {
            "endpoint": endpoint_key,
            "url": full_url,
            "result": result,
        })
        st.session_state["last_result"] = result

with col_response:
    st.subheader("📥 Response")

    result = st.session_state.get("last_result")

    if result is None:
        st.info("Send a request to see the response here.")
    elif result["error"]:
        st.error(f"❌ Error: {result['error']}")
        st.markdown(f"**Tip:** Is goffj running at `{base_url}`?")
        st.code("make up-go  # Start goffj + postgres + nats", language="bash")
    else:
        status = result["status_code"]
        elapsed = result["elapsed_ms"]

        # Status badge
        color = "green" if 200 <= status < 300 else "orange" if status < 500 else "red"
        st.markdown(f"**Status:** :{color}[{status}] &nbsp;|&nbsp; **Time:** {elapsed:.1f}ms")

        # Response body
        st.markdown("**Body:**")
        st.json(result["body"])

        # Headers (expandable)
        with st.expander("Response Headers"):
            st.json(result["headers"])

# ─────────────────────────────────────────────────────────────────────────────
# Request History
# ─────────────────────────────────────────────────────────────────────────────
st.markdown("---")
st.subheader("📋 Request History")
st.markdown("""
`st.session_state` persists data across Streamlit reruns.
Without it, every button click would reset all Python variables.
""")

history = st.session_state.get("history", [])
if not history:
    st.info("No requests yet. Send one above.")
else:
    if st.button("🗑 Clear History"):
        st.session_state["history"] = []
        st.rerun()

    for i, entry in enumerate(history[:10]):  # Show last 10
        r = entry["result"]
        status_str = str(r["status_code"]) if r["status_code"] else "ERR"
        elapsed_str = f"{r['elapsed_ms']:.0f}ms" if r["elapsed_ms"] else ""
        with st.expander(f"#{i+1} {entry['endpoint']} — {status_str} {elapsed_str}"):
            st.code(entry["url"])
            if r["error"]:
                st.error(r["error"])
            else:
                st.json(r["body"])
