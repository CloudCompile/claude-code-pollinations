# E2B template for Claude Code running against Pollinations.
# Based on https://docs.e2b.dev/template/examples/claude-code
FROM e2bdev/code-interpreter:latest

# --- Core toolchain ---------------------------------------------------------
# The e2bdev/code-interpreter base ships a minimal env. Install the Python and
# Node tooling Claude Code and most coding tasks expect by default, so sandboxes
# don't fail with "ModuleNotFoundError" on first use.

# System build/runtime deps (needed by many pip wheels and ffmpeg workflows).
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      pkg-config \
      git \
      curl \
      wget \
      zip \
      unzip \
      jq \
      ffmpeg \
      libgl1 \
      libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Python: datascience + scripting + tooling stack.
RUN pip install --no-cache-dir --break-system-packages \
    numpy \
    pandas \
    polars \
    scipy \
    matplotlib \
    seaborn \
    scikit-learn \
    requests \
    httpx \
    aiohttp \
    beautifulsoup4 \
    lxml \
    python-dotenv \
    pillow \
    plotly \
    openpyxl \
    pydantic \
    pytest \
    ruff \
    black \
    ipython \
    jupyter \
  && rm -rf /root/.cache/pip

# Node: the base provides Node/npm; layer global CLI tooling on top.
RUN npm install -g \
      @anthropic-ai/claude-code \
      node-gyp \
      typescript \
      tsx \
      prettier \
      eslint \
      nodemon \
    && npm cache clean --force

# Back to the default sandbox user.
USER user

# Workspace
WORKDIR /home/user

# Default env placeholders (overridden at sandbox creation via envs)
# Use a free model by default; paid models require paid Pollen enabled on the key
ENV ANTHROPIC_BASE_URL=https://gen.pollinations.ai
ENV ANTHROPIC_MODEL=openai/gpt-5.4-nano

# Keep container alive; E2B manages lifecycle.
CMD ["bash"]