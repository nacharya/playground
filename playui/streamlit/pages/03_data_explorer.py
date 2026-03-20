"""
Data Explorer — Pandas + Plotly
================================

Upload any CSV and instantly get:
  - Data profiling: shape, dtypes, null counts, descriptive statistics
  - Distribution plots for numeric columns
  - Correlation heatmap
  - Group-by aggregation builder

Key Python concepts:
  pandas DataFrame — in-memory tabular data structure with labeled axes
  plotly express   — high-level charting library (returns interactive figures)
  st.cache_data    — cache expensive computations across reruns
"""

import io

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

st.set_page_config(page_title="Data Explorer", layout="wide")
st.title("📊 Data Explorer")
st.markdown("Upload any CSV file for instant profiling and visualization.")


@st.cache_data
def load_data(content: bytes) -> pd.DataFrame:
    """
    st.cache_data caches the return value.
    The cache key is the function arguments — here, the raw file bytes.
    If the same file is uploaded again, pandas doesn't re-parse it.
    """
    return pd.read_csv(io.BytesIO(content))


@st.cache_data
def get_sample_data() -> pd.DataFrame:
    """Generate sample data for demo purposes."""
    import numpy as np
    rng = np.random.default_rng(42)
    n = 200
    return pd.DataFrame({
        "age":      rng.integers(20, 65, n),
        "salary":   rng.normal(60000, 15000, n).round(0),
        "score":    rng.uniform(0, 100, n).round(1),
        "dept":     rng.choice(["Engineering", "Sales", "HR", "Finance"], n),
        "active":   rng.choice([True, False], n, p=[0.8, 0.2]),
        "years":    rng.integers(0, 20, n),
    })


# ── File upload ───────────────────────────────────────────────────────────────
uploaded = st.file_uploader("Upload CSV", type=["csv"])

if uploaded is not None:
    df = load_data(uploaded.read())
    st.success(f"Loaded **{uploaded.name}**: {df.shape[0]:,} rows × {df.shape[1]} columns")
else:
    df = get_sample_data()
    st.info("📌 Showing sample employee data. Upload your own CSV above.")

# ── Profile ───────────────────────────────────────────────────────────────────
st.header("1. Data Profile")

col_shape, col_dtypes, col_nulls = st.columns(3)

with col_shape:
    st.metric("Rows", f"{df.shape[0]:,}")
    st.metric("Columns", df.shape[1])

with col_dtypes:
    st.markdown("**Data types**")
    dtype_counts = df.dtypes.astype(str).value_counts()
    for dtype, count in dtype_counts.items():
        st.write(f"  `{dtype}`: {count} columns")

with col_nulls:
    null_counts = df.isnull().sum()
    total_nulls = null_counts.sum()
    st.metric("Total null values", total_nulls)
    if total_nulls > 0:
        st.dataframe(null_counts[null_counts > 0].rename("null count"), height=120)
    else:
        st.success("No null values ✅")

with st.expander("Descriptive Statistics", expanded=True):
    st.dataframe(df.describe(include="all"), use_container_width=True)

with st.expander("First 20 Rows"):
    st.dataframe(df.head(20), use_container_width=True)

# ── Distribution Plots ────────────────────────────────────────────────────────
st.header("2. Column Distributions")

numeric_cols = df.select_dtypes(include="number").columns.tolist()
categorical_cols = df.select_dtypes(include=["object", "bool", "category"]).columns.tolist()

tab_num, tab_cat = st.tabs(["Numeric columns", "Categorical columns"])

with tab_num:
    if not numeric_cols:
        st.info("No numeric columns found.")
    else:
        selected_num = st.selectbox("Select column", numeric_cols, key="num_col")
        col_hist, col_box = st.columns(2)

        with col_hist:
            fig = px.histogram(df, x=selected_num, nbins=30, title=f"Distribution of {selected_num}",
                               color_discrete_sequence=["#636EFA"])
            fig.update_layout(showlegend=False, height=350)
            st.plotly_chart(fig, use_container_width=True)

        with col_box:
            # Group by categorical column if available
            color_by = st.selectbox("Color by", ["(none)"] + categorical_cols, key="num_color")
            color_col = None if color_by == "(none)" else color_by
            fig2 = px.box(df, y=selected_num, color=color_col,
                          title=f"Box plot: {selected_num}", height=350)
            st.plotly_chart(fig2, use_container_width=True)

with tab_cat:
    if not categorical_cols:
        st.info("No categorical columns found.")
    else:
        selected_cat = st.selectbox("Select column", categorical_cols, key="cat_col")
        counts = df[selected_cat].value_counts().reset_index()
        counts.columns = [selected_cat, "count"]

        col_bar, col_pie = st.columns(2)
        with col_bar:
            fig = px.bar(counts, x=selected_cat, y="count", title=f"Value counts: {selected_cat}",
                         color=selected_cat, height=350)
            st.plotly_chart(fig, use_container_width=True)
        with col_pie:
            fig2 = px.pie(counts, names=selected_cat, values="count", height=350)
            st.plotly_chart(fig2, use_container_width=True)

# ── Correlation Heatmap ───────────────────────────────────────────────────────
st.header("3. Correlation Heatmap")
st.markdown("""
Pearson correlation coefficient: 1.0 = perfect positive, -1.0 = perfect negative, 0 = no linear relationship.
Only numeric columns are included.
""")

if len(numeric_cols) < 2:
    st.info("Need at least 2 numeric columns for a correlation heatmap.")
else:
    corr = df[numeric_cols].corr()

    fig = go.Figure(data=go.Heatmap(
        z=corr.values,
        x=corr.columns,
        y=corr.index,
        colorscale="RdBu",
        zmin=-1, zmax=1,
        text=corr.values.round(2),
        texttemplate="%{text}",
        hovertemplate="<b>%{x}</b> vs <b>%{y}</b><br>r = %{z:.3f}<extra></extra>",
    ))
    fig.update_layout(title="Pearson Correlation Matrix", height=400)
    st.plotly_chart(fig, use_container_width=True)

# ── Group-By Builder ──────────────────────────────────────────────────────────
st.header("4. Group-By Aggregation")
st.markdown("""
Build a `df.groupby(...).agg(...)` operation interactively.
Useful for pivot-table style summaries without writing code.
""")

col_gb, col_agg, col_val = st.columns(3)

with col_gb:
    group_col = st.selectbox("Group by", categorical_cols or df.columns.tolist(), key="gb_col")
with col_agg:
    agg_func = st.selectbox("Aggregate", ["mean", "sum", "count", "min", "max", "std"], key="agg_fn")
with col_val:
    value_col = st.selectbox("Value column", numeric_cols or df.columns.tolist(), key="val_col")

if group_col and value_col:
    result = df.groupby(group_col)[value_col].agg(agg_func).reset_index()
    result.columns = [group_col, f"{agg_func}({value_col})"]
    result = result.sort_values(f"{agg_func}({value_col})", ascending=False)

    col_table, col_chart = st.columns([1, 2])
    with col_table:
        st.dataframe(result, use_container_width=True)
    with col_chart:
        fig = px.bar(result, x=group_col, y=f"{agg_func}({value_col})",
                     title=f"{agg_func}({value_col}) by {group_col}",
                     color=group_col)
        st.plotly_chart(fig, use_container_width=True)
