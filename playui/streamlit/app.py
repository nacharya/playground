"""
Playground — Streamlit Learning Hub
=====================================

This is the main entry point for the multi-page Streamlit app.
Streamlit automatically discovers pages in the pages/ subdirectory and
adds them to the sidebar navigation.

Page structure:
  app.py                          ← This file (hub/dashboard)
  pages/01_pytorch_mnist.py       ← PyTorch training demo
  pages/02_autograd_tutorial.py   ← Autograd deep-dive
  pages/03_data_explorer.py       ← Pandas + Plotly data exploration
  pages/04_api_client.py          ← Live goffj REST API explorer

Run locally:
  streamlit run playui/streamlit/app.py
"""

import os

import httpx
import streamlit as st

# ─────────────────────────────────────────────────────────────────────────────
# Page config — must be the FIRST streamlit call in the script
# ─────────────────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Playground Hub",
    page_icon="🔬",
    layout="wide",
    initial_sidebar_state="expanded",
)

GOFFJ_URL = os.environ.get("GOFFJ_API_URL", "http://localhost:8500")

# ─────────────────────────────────────────────────────────────────────────────
# Sidebar
# ─────────────────────────────────────────────────────────────────────────────
with st.sidebar:
    st.title("🔬 Playground")
    st.markdown("---")
    st.markdown("""
**Learning Demos**

- 🧠 **PyTorch MNIST** — Train a CNN interactively
- 📐 **Autograd Tutorial** — Understand backprop
- 📊 **Data Explorer** — Explore any CSV
- 🌐 **API Client** — Call goffj live

**External Services**
""")
    st.code(f"goffj API: {GOFFJ_URL}", language="text")

# ─────────────────────────────────────────────────────────────────────────────
# Main content
# ─────────────────────────────────────────────────────────────────────────────
st.title("🔬 Playground Hub")
st.markdown("""
Welcome to the polyglot playground. This Streamlit app is the Python face
of a system with services in **Go, Rust, TypeScript, F#, and Python**.
All services communicate over REST and **gRPC** (see `proto/playground.proto`).
""")

col_nav, col_status = st.columns([3, 2])

with col_nav:
    st.subheader("📚 Available Demos")

    demos = [
        ("🧠", "PyTorch MNIST", "01_pytorch_mnist",
         "Train a Convolutional Neural Network on handwritten digits. "
         "Watch loss/accuracy charts update live epoch-by-epoch."),
        ("📐", "Autograd Tutorial", "02_autograd_tutorial",
         "Interactive tour of PyTorch's automatic differentiation engine. "
         "Visualize computational graphs, custom backward functions, pitfalls."),
        ("📊", "Data Explorer", "03_data_explorer",
         "Upload any CSV and get instant profiling: distributions, correlation heatmap, group-by builder."),
        ("🌐", "API Client", "04_api_client",
         "Live REST API explorer that calls the goffj Go service. "
         "Inspect request/response, build JSON bodies, see timing."),
    ]

    for icon, title, _, description in demos:
        with st.expander(f"{icon} {title}", expanded=False):
            st.markdown(description)
            st.markdown(f"*Navigate using the sidebar →*")

with col_status:
    st.subheader("🔗 Service Status")

    # Try to reach goffj API
    with st.spinner("Checking goffj..."):
        try:
            resp = httpx.get(f"{GOFFJ_URL}/healthcheck", timeout=3.0)
            resp.raise_for_status()
            st.success(f"✅ **goffj** is up ({resp.elapsed.total_seconds()*1000:.0f}ms)")
            st.json(resp.json())
        except httpx.ConnectError:
            st.warning(f"⚠️ **goffj** unreachable at `{GOFFJ_URL}`")
            st.info("Start it with: `make up-go`")
        except Exception as e:
            st.error(f"❌ goffj error: {e}")

    st.markdown("---")
    st.markdown("**Quick links**")
    st.markdown(f"- [goffj API]({GOFFJ_URL}/healthcheck)")
    st.markdown(f"- [goffj Realms]({GOFFJ_URL}/api/v1/realm/)")
    st.markdown(f"- [FastAPI docs](http://localhost:8505/docs)")

# ─────────────────────────────────────────────────────────────────────────────
# Architecture overview
# ─────────────────────────────────────────────────────────────────────────────
st.markdown("---")
st.subheader("🏗️ Architecture")
st.markdown("""
```
reactapp  (React + nginx)   :80
    ↓ REST/WebSocket
tsnode    (TypeScript/tRPC)  :8506
    ↓ REST proxy
goffj     (Go + Gin)         :8500  ←→  postgres:5432
    ↑ REST
playui    (Python/Streamlit) :8504   ← you are here
    ↑
fsharp    (F# ASP.NET)       :8508
pgctl     (Rust/Actix-web)   :8502

All services also expose gRPC (ports 8509-8513)
using proto/playground.proto as the shared contract.
```
""")
