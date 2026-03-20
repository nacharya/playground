"""
PyTorch Autograd Deep Dive
==========================

Autograd is PyTorch's automatic differentiation engine. Every operation on a
tensor that has requires_grad=True is recorded in a computational graph.
Calling .backward() walks that graph in reverse (via the chain rule) to compute
gradients for every leaf tensor.

Understanding autograd = understanding how neural networks learn.

Topics covered:
  1. requires_grad and grad_fn — tracing computations
  2. Computational graph — dynamic, defined-by-run
  3. .backward() and gradient accumulation
  4. Custom autograd Functions — write your own forward/backward
  5. Common pitfalls — in-place ops, detach(), no_grad()
"""

import numpy as np
import streamlit as st
import torch
import torch.nn as nn

st.set_page_config(page_title="Autograd Tutorial", layout="wide")
st.title("📐 PyTorch Autograd Tutorial")

# ─────────────────────────────────────────────────────────────────────────────
# Section 1: Tensors and requires_grad
# ─────────────────────────────────────────────────────────────────────────────
st.header("1. Tensors and `requires_grad`")
st.markdown("""
A tensor with `requires_grad=True` participates in the computation graph.
PyTorch records every operation on it so that `.backward()` can later compute
the gradient ∂output/∂tensor.

Leaf tensors (created by the user, not the result of an operation) hold the
computed gradients in `.grad` after `.backward()` is called.
""")

col1, col2 = st.columns(2)
with col1:
    st.code("""
# Leaf tensor — user-created, has requires_grad
x = torch.tensor(3.0, requires_grad=True)
y = torch.tensor(4.0, requires_grad=True)

# Build a computation
z = x**2 + 2*x*y + y**2   # z = (x+y)²

# Compute gradients
z.backward()

print(x.grad)  # dz/dx = 2x + 2y = 14
print(y.grad)  # dz/dy = 2x + 2y = 14
    """, language="python")

with col2:
    x = torch.tensor(3.0, requires_grad=True)
    y = torch.tensor(4.0, requires_grad=True)
    z = x**2 + 2*x*y + y**2
    z.backward()

    st.markdown("**Live output:**")
    st.write(f"x = {x.item()}, y = {y.item()}")
    st.write(f"z = x² + 2xy + y² = (x+y)² = {z.item():.0f}")
    st.write(f"x.grad = dz/dx = 2x + 2y = **{x.grad.item():.0f}**")
    st.write(f"y.grad = dz/dy = 2x + 2y = **{y.grad.item():.0f}**")
    st.info("💡 `grad_fn` of z: `" + str(z.grad_fn.__class__.__name__) + "`")

# ─────────────────────────────────────────────────────────────────────────────
# Section 2: Interactive Function Plotter
# ─────────────────────────────────────────────────────────────────────────────
st.header("2. Function + Gradient Visualization")
st.markdown("""
Select a function below. We'll compute it AND its gradient using autograd,
then plot both. The gradient is the slope of the function at each point.
""")

func_choice = st.selectbox("Choose a function", ["x²", "sin(x)", "x³ - 3x", "sigmoid(x)"])

x_range = st.slider("x range", min_value=-5.0, max_value=5.0, value=(-3.0, 3.0))
n_points = 100

xs = torch.linspace(x_range[0], x_range[1], n_points, requires_grad=False)
y_vals = []
grad_vals = []

for xi in xs:
    x_i = xi.clone().detach().requires_grad_(True)

    if func_choice == "x²":
        f = x_i ** 2
    elif func_choice == "sin(x)":
        f = torch.sin(x_i)
    elif func_choice == "x³ - 3x":
        f = x_i**3 - 3*x_i
    else:  # sigmoid
        f = torch.sigmoid(x_i)

    f.backward()
    y_vals.append(f.item())
    grad_vals.append(x_i.grad.item())  # type: ignore[union-attr]

import pandas as pd
plot_df = pd.DataFrame({
    "x": xs.numpy(),
    f(func_choice if isinstance(func_choice, str) else "f(x)"): y_vals,
    "gradient": grad_vals,
}).rename(columns={0: "f(x)"}).set_index("x")

# Rename column
plot_df.columns = ["f(x)", "f'(x) [gradient]"]

c1, c2 = st.columns(2)
with c1:
    st.line_chart(plot_df[["f(x)"]], height=250)
    st.caption(f"f(x) = {func_choice}")
with c2:
    st.line_chart(plot_df[["f'(x) [gradient]"]], height=250)
    st.caption("Gradient (computed by autograd, not symbolic math)")

# ─────────────────────────────────────────────────────────────────────────────
# Section 3: Gradient Accumulation
# ─────────────────────────────────────────────────────────────────────────────
st.header("3. Gradient Accumulation — Why `zero_grad()` Matters")
st.markdown("""
By default, calling `.backward()` **accumulates** (adds) gradients into `.grad`.
It does NOT reset them. This is intentional — it allows summing gradients across
mini-batches — but it means you must call `optimizer.zero_grad()` before each batch.
""")

st.code("""
x = torch.tensor(2.0, requires_grad=True)

# First backward pass
(x**2).backward()
print(x.grad)  # 4.0  (dz/dx = 2x = 4)

# Second backward WITHOUT zeroing — grad ACCUMULATES
(x**2).backward()
print(x.grad)  # 8.0 ← BUG! Should be 4.0 again

# Fix: zero_grad() before each backward
x.grad.zero_()
(x**2).backward()
print(x.grad)  # 4.0 ← Correct
""", language="python")

x_demo = torch.tensor(2.0, requires_grad=True)
(x_demo**2).backward()
grad_after_1 = x_demo.grad.item()
(x_demo**2).backward()
grad_after_2 = x_demo.grad.item()
x_demo.grad.zero_()
(x_demo**2).backward()
grad_after_zero = x_demo.grad.item()

col_g1, col_g2, col_g3 = st.columns(3)
col_g1.metric("After 1st backward", f"{grad_after_1:.1f}", help="Expected: 4.0")
col_g2.metric("After 2nd backward (no zero)", f"{grad_after_2:.1f}", delta="accumulation bug!", delta_color="inverse")
col_g3.metric("After zero_grad + backward", f"{grad_after_zero:.1f}", delta="correct", delta_color="normal")

# ─────────────────────────────────────────────────────────────────────────────
# Section 4: Custom Autograd Function
# ─────────────────────────────────────────────────────────────────────────────
st.header("4. Custom `torch.autograd.Function`")
st.markdown("""
For operations PyTorch doesn't natively support, you can define your own
forward and backward passes. This is how custom CUDA kernels, quantized ops,
and novel loss functions are implemented.

The pattern:
  - `forward(ctx, input)` — compute the output, save anything needed for backward
  - `backward(ctx, grad_output)` — use saved tensors to compute input gradient
""")

st.code("""
class MySigmoid(torch.autograd.Function):
    \"\"\"
    Sigmoid implemented from scratch with manual gradient.
    sigmoid(x) = 1 / (1 + e^(-x))
    d/dx sigmoid(x) = sigmoid(x) * (1 - sigmoid(x))
    \"\"\"

    @staticmethod
    def forward(ctx, x: torch.Tensor) -> torch.Tensor:
        # Compute sigmoid
        result = 1 / (1 + torch.exp(-x))
        # Save result for backward (we need it to compute the gradient)
        ctx.save_for_backward(result)
        return result

    @staticmethod
    def backward(ctx, grad_output: torch.Tensor) -> torch.Tensor:
        # Retrieve saved output
        (sigmoid_x,) = ctx.saved_tensors
        # Chain rule: grad_input = grad_output * sigmoid'(x)
        # sigmoid'(x) = sigmoid(x) * (1 - sigmoid(x))
        local_grad = sigmoid_x * (1 - sigmoid_x)
        return grad_output * local_grad

# Use it like a regular PyTorch function
my_sigmoid = MySigmoid.apply
x = torch.tensor(0.5, requires_grad=True)
y = my_sigmoid(x)
y.backward()
print(x.grad)  # Should match torch.sigmoid gradient
""", language="python")

# Live verification
class MySigmoid(torch.autograd.Function):
    @staticmethod
    def forward(ctx, x):
        result = 1 / (1 + torch.exp(-x))
        ctx.save_for_backward(result)
        return result

    @staticmethod
    def backward(ctx, grad_output):
        (s,) = ctx.saved_tensors
        return grad_output * s * (1 - s)

x_test = torch.tensor(0.5, requires_grad=True)
y_custom = MySigmoid.apply(x_test)
y_custom.backward()
custom_grad = x_test.grad.item()

x_test2 = torch.tensor(0.5, requires_grad=True)
y_torch = torch.sigmoid(x_test2)
y_torch.backward()
torch_grad = x_test2.grad.item()

col_c1, col_c2 = st.columns(2)
col_c1.metric("MySigmoid gradient at x=0.5", f"{custom_grad:.6f}")
col_c2.metric("torch.sigmoid gradient at x=0.5", f"{torch_grad:.6f}")
st.success("✅ Custom backward matches PyTorch's built-in!" if abs(custom_grad - torch_grad) < 1e-6 else "❌ Mismatch!")

# ─────────────────────────────────────────────────────────────────────────────
# Section 5: Common Pitfalls
# ─────────────────────────────────────────────────────────────────────────────
st.header("5. Common Pitfalls")

with st.expander("⚠️ In-place operations on leaf tensors"):
    st.markdown("""
    In-place operations (those ending in `_` like `add_`, `mul_`) on leaf tensors
    that require grad will raise a `RuntimeError`. This is because in-place ops
    would destroy the original value needed to compute gradients.
    """)
    st.code("""
x = torch.tensor(1.0, requires_grad=True)
# x.add_(1)  # ← RuntimeError: a leaf Variable that requires grad
             #   has been used in an in-place operation

# Fix: use out-of-place versions
y = x + 1  # Creates a new tensor; x is unchanged
    """, language="python")

with st.expander("⚠️ detach() — breaking the computation graph"):
    st.markdown("""
    `.detach()` creates a new tensor that shares the same data but is not
    part of the computation graph. Use it when you want to use a tensor value
    without tracking gradients through it (e.g., for visualization or numpy conversion).
    """)
    st.code("""
x = torch.tensor(2.0, requires_grad=True)
z = x**3

# Wrong: converts to numpy BEFORE detaching → error
# arr = z.numpy()  # RuntimeError: Can't convert tensor with grad

# Correct:
arr = z.detach().numpy()   # Detach first, then convert
print(arr)  # 8.0
    """, language="python")

with st.expander("⚠️ torch.no_grad() — the inference performance trick"):
    st.markdown("""
    During inference (not training), you don't need gradients.
    `torch.no_grad()` disables the computation graph for all operations inside it:
    - ~50% memory reduction
    - ~30% speedup

    Always use `torch.no_grad()` in your evaluation and inference loops.
    """)
    st.code("""
model.eval()
with torch.no_grad():
    predictions = model(test_data)  # No graph built, no grad storage
    """, language="python")
