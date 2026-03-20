"""
PyTorch MNIST Classifier — Interactive Training Demo
=====================================================

This page demonstrates the complete machine learning lifecycle using PyTorch:
  1. Dataset preparation with torchvision + DataLoader
  2. CNN model definition with nn.Module
  3. Training loop with real-time Streamlit progress updates
  4. Loss and accuracy visualization per epoch
  5. Model inference on uploaded images

Key PyTorch concepts covered:
  nn.Module     — base class for all neural networks; defines layers + forward()
  Autograd      — .backward() computes gradients automatically via the chain rule
  DataLoader    — batches, shuffles, and parallel-loads data
  Optimizer     — SGD/Adam update weights using computed gradients
  torch.save    — serialize model state_dict to disk
  torch.no_grad — disable gradient tracking for inference (saves memory)

Run locally:
  streamlit run playui/streamlit/app.py  # navigate to this page via sidebar
"""

import io
import time
from typing import Optional

import streamlit as st
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torchvision import datasets, transforms

st.set_page_config(page_title="PyTorch MNIST", layout="wide")

# ─────────────────────────────────────────────────────────────────────────────
# 1. CNN Model Definition
# ─────────────────────────────────────────────────────────────────────────────

class MNISTNet(nn.Module):
    """
    Convolutional Neural Network for MNIST digit classification.

    Architecture (input: 1×28×28 grayscale image):

      Conv2d(1→16, kernel=3)  → ReLU → MaxPool(2)   → [16×13×13]
      Conv2d(16→32, kernel=3) → ReLU → MaxPool(2)   → [32×5×5]
      Flatten                                         → [800]
      Linear(800→128)         → ReLU                 → [128]
      Linear(128→10)          → LogSoftmax           → [10] probabilities

    Why two conv layers?
      - Layer 1 learns low-level features: edges, curves
      - Layer 2 combines those into higher-level features: loops, strokes
      - MaxPool reduces spatial dimensions (downsampling), adding translation invariance

    Why LogSoftmax + NLLLoss (not Softmax + CrossEntropy)?
      LogSoftmax + NLLLoss is numerically more stable than Softmax + CrossEntropy.
      They are mathematically equivalent; PyTorch's F.cross_entropy combines both.
    """

    def __init__(self) -> None:
        super().__init__()

        # Conv block 1: 1 input channel (grayscale), 16 output feature maps
        self.conv1 = nn.Conv2d(in_channels=1, out_channels=16, kernel_size=3, padding=1)
        # After conv1 + pool: [16, 14, 14]

        # Conv block 2: 16 → 32 feature maps
        self.conv2 = nn.Conv2d(in_channels=16, out_channels=32, kernel_size=3, padding=1)
        # After conv2 + pool: [32, 7, 7] → flattened: 32*7*7 = 1568

        # Fully connected layers
        self.fc1 = nn.Linear(32 * 7 * 7, 128)
        self.fc2 = nn.Linear(128, 10)  # 10 output classes (digits 0-9)

        # Activation functions
        self.relu = nn.ReLU()
        self.pool = nn.MaxPool2d(kernel_size=2, stride=2)
        self.log_softmax = nn.LogSoftmax(dim=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass: compute predictions from input tensor x.

        x shape: [batch_size, 1, 28, 28]

        The forward() method defines the computation graph.
        PyTorch traces every operation for autograd (backprop).
        """
        # Block 1: convolution → relu → pooling
        x = self.pool(self.relu(self.conv1(x)))   # [B, 16, 14, 14]

        # Block 2: convolution → relu → pooling
        x = self.pool(self.relu(self.conv2(x)))   # [B, 32, 7, 7]

        # Flatten: [B, 32, 7, 7] → [B, 1568]
        # view(-1, ...) means "infer this dimension from the batch size"
        x = x.view(-1, 32 * 7 * 7)

        # Fully connected
        x = self.relu(self.fc1(x))                # [B, 128]
        x = self.log_softmax(self.fc2(x))         # [B, 10]

        return x


# ─────────────────────────────────────────────────────────────────────────────
# 2. Training + Evaluation
# ─────────────────────────────────────────────────────────────────────────────

def train_epoch(
    model: nn.Module,
    loader: DataLoader,
    optimizer: optim.Optimizer,
    device: torch.device,
) -> tuple[float, float]:
    """
    Run one training epoch.

    An epoch = one full pass over the training dataset.
    Returns: (avg_loss, accuracy)

    Training loop steps (the fundamental ML loop):
      1. Forward pass: compute predictions
      2. Compute loss: how wrong are we?
      3. Backward pass: compute gradients (.backward())
      4. Update weights: optimizer.step()
      5. Zero gradients: optimizer.zero_grad() (prevent accumulation)
    """
    model.train()  # Enable training mode (affects Dropout, BatchNorm)
    total_loss = 0.0
    correct = 0

    for batch_idx, (data, targets) in enumerate(loader):
        data, targets = data.to(device), targets.to(device)

        # Step 5 first: clear gradients from the previous batch
        # Why here and not after step 4? Either works; doing it early is cleaner.
        optimizer.zero_grad()

        # Step 1: Forward pass
        predictions = model(data)

        # Step 2: Compute loss
        # NLLLoss (Negative Log Likelihood) works with LogSoftmax output.
        # It measures how surprised the model is given the correct class.
        loss = nn.functional.nll_loss(predictions, targets)

        # Step 3: Backward pass
        # PyTorch walks the computation graph in reverse, computing ∂loss/∂param
        # for every learnable parameter in the model.
        loss.backward()

        # Step 4: Update weights using computed gradients
        # SGD: param -= lr * param.grad
        # Adam: uses adaptive learning rates per parameter (usually faster)
        optimizer.step()

        total_loss += loss.item()
        pred = predictions.argmax(dim=1)  # Predicted class = highest probability
        correct += pred.eq(targets).sum().item()

    n = len(loader.dataset)  # type: ignore[arg-type]
    return total_loss / len(loader), correct / n


def evaluate(
    model: nn.Module,
    loader: DataLoader,
    device: torch.device,
) -> tuple[float, float]:
    """
    Evaluate model on test/validation data.

    torch.no_grad() disables gradient computation — we don't need it
    for inference and it saves memory + speeds up computation.
    """
    model.eval()  # Disable training-specific layers
    total_loss = 0.0
    correct = 0

    with torch.no_grad():  # No autograd needed for evaluation
        for data, targets in loader:
            data, targets = data.to(device), targets.to(device)
            predictions = model(data)
            loss = nn.functional.nll_loss(predictions, targets)
            total_loss += loss.item()
            pred = predictions.argmax(dim=1)
            correct += pred.eq(targets).sum().item()

    n = len(loader.dataset)  # type: ignore[arg-type]
    return total_loss / len(loader), correct / n


# ─────────────────────────────────────────────────────────────────────────────
# 3. Streamlit UI
# ─────────────────────────────────────────────────────────────────────────────

st.title("🧠 PyTorch MNIST Classifier")
st.markdown("""
Train a Convolutional Neural Network on the MNIST handwritten digit dataset.
Watch loss and accuracy update live as each epoch completes.
""")

# ── Sidebar: Hyperparameters ──────────────────────────────────────────────────
with st.sidebar:
    st.header("⚙️ Hyperparameters")
    st.markdown("""
    Hyperparameters are settings you choose *before* training.
    They control *how* the model learns, not *what* it learns.
    """)

    n_epochs = st.slider("Epochs", min_value=1, max_value=10, value=3,
                         help="One epoch = one full pass over the training data")
    lr = st.select_slider("Learning Rate", options=[0.001, 0.005, 0.01, 0.05, 0.1], value=0.01,
                          help="Step size for weight updates. Too high → unstable. Too low → slow.")
    batch_size = st.selectbox("Batch Size", [32, 64, 128, 256], index=1,
                              help="Number of samples per gradient update")
    optimizer_choice = st.radio("Optimizer", ["Adam", "SGD"],
                                help="Adam adapts lr per parameter; SGD is simpler but often needs tuning")

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

col_train, col_results = st.columns([2, 1])

with col_train:
    st.subheader("Training")
    device_badge = "🟢 GPU (CUDA)" if device.type == "cuda" else "🔵 CPU"
    st.info(f"Device: {device_badge}")

    if st.button("🚀 Download MNIST & Train", type="primary"):
        # ── Data loading ──────────────────────────────────────────────────
        st.markdown("**Step 1/3:** Downloading MNIST dataset...")

        # transforms.Compose chains preprocessing steps:
        # ToTensor: PIL image [H,W,C] uint8 → Tensor [C,H,W] float32 in [0,1]
        # Normalize: (x - mean) / std → centered around 0, σ≈1
        transform = transforms.Compose([
            transforms.ToTensor(),
            transforms.Normalize((0.1307,), (0.3081,)),  # MNIST mean/std
        ])

        train_dataset = datasets.MNIST(
            root="/tmp/mnist", train=True, download=True, transform=transform
        )
        test_dataset = datasets.MNIST(
            root="/tmp/mnist", train=False, download=True, transform=transform
        )

        # DataLoader: batches data, shuffles each epoch, optionally loads in parallel
        train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, num_workers=0)
        test_loader  = DataLoader(test_dataset,  batch_size=batch_size, shuffle=False, num_workers=0)

        st.success(f"✅ Dataset: {len(train_dataset):,} train / {len(test_dataset):,} test samples")

        # ── Model + Optimizer ──────────────────────────────────────────────
        st.markdown("**Step 2/3:** Building model...")
        model = MNISTNet().to(device)

        n_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
        st.info(f"Model parameters: {n_params:,}")

        if optimizer_choice == "Adam":
            optimizer = optim.Adam(model.parameters(), lr=lr)
        else:
            optimizer = optim.SGD(model.parameters(), lr=lr, momentum=0.9)

        # ── Training loop ─────────────────────────────────────────────────
        st.markdown("**Step 3/3:** Training...")

        progress_bar = st.progress(0)
        status_text = st.empty()
        chart_data: dict[str, list] = {"epoch": [], "train_loss": [], "test_loss": [], "test_acc": []}
        chart_placeholder = st.empty()

        for epoch in range(1, n_epochs + 1):
            status_text.text(f"Epoch {epoch}/{n_epochs}...")
            t0 = time.time()

            train_loss, train_acc = train_epoch(model, train_loader, optimizer, device)
            test_loss, test_acc = evaluate(model, test_loader, device)

            elapsed = time.time() - t0
            chart_data["epoch"].append(epoch)
            chart_data["train_loss"].append(train_loss)
            chart_data["test_loss"].append(test_loss)
            chart_data["test_acc"].append(test_acc * 100)

            status_text.text(
                f"Epoch {epoch}/{n_epochs} | "
                f"Train loss: {train_loss:.4f} | "
                f"Test acc: {test_acc*100:.2f}% | "
                f"Time: {elapsed:.1f}s"
            )
            progress_bar.progress(epoch / n_epochs)

            with chart_placeholder.container():
                import pandas as pd
                df = pd.DataFrame(chart_data)
                col_loss, col_acc = st.columns(2)
                with col_loss:
                    st.line_chart(df.set_index("epoch")[["train_loss", "test_loss"]],
                                  height=200)
                    st.caption("Loss (lower is better)")
                with col_acc:
                    st.line_chart(df.set_index("epoch")[["test_acc"]], height=200)
                    st.caption("Test Accuracy %")

        st.success(f"✅ Training complete! Final test accuracy: **{test_acc*100:.2f}%**")
        st.session_state["trained_model"] = model
        st.session_state["test_dataset"] = test_dataset

with col_results:
    st.subheader("Sample Predictions")
    model: Optional[nn.Module] = st.session_state.get("trained_model")

    if model is None:
        st.info("Train the model first →")
    else:
        test_dataset = st.session_state["test_dataset"]
        import random, numpy as np
        from PIL import Image

        if st.button("🎲 Show Random Samples"):
            indices = random.sample(range(len(test_dataset)), 9)
            model.eval()
            fig_images = []
            for idx in indices:
                img_tensor, label = test_dataset[idx]
                with torch.no_grad():
                    out = model(img_tensor.unsqueeze(0).to(device))
                    pred = out.argmax(dim=1).item()
                # Denormalize for display
                img_np = img_tensor.squeeze().numpy()
                img_np = (img_np * 0.3081 + 0.1307) * 255
                fig_images.append((img_np.astype(np.uint8), label, pred))

            cols = st.columns(3)
            for i, (img, true, pred) in enumerate(fig_images):
                with cols[i % 3]:
                    color = "✅" if true == pred else "❌"
                    st.image(img, caption=f"{color} True:{true} Pred:{pred}", width=80)

    st.subheader("📤 Run Inference")
    uploaded = st.file_uploader("Upload a digit image (28×28 grayscale or similar)",
                                type=["png", "jpg", "jpeg"])
    if uploaded and model is not None:
        from PIL import Image
        import numpy as np

        img = Image.open(io.BytesIO(uploaded.read())).convert("L").resize((28, 28))
        img_tensor = transforms.ToTensor()(img)
        img_tensor = transforms.Normalize((0.1307,), (0.3081,))(img_tensor)

        model.eval()
        with torch.no_grad():
            out = model(img_tensor.unsqueeze(0).to(device))
            probs = torch.exp(out).squeeze()
            pred = probs.argmax().item()

        st.image(uploaded, caption="Uploaded", width=100)
        st.metric("Predicted digit", pred)
        st.bar_chart({str(i): probs[i].item() for i in range(10)})
