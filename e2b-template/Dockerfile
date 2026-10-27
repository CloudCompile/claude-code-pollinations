# E2B template for Claude Code running against Pollinations.
# Based on https://docs.e2b.dev/template/examples/claude-code
FROM e2bdev/code-interpreter:latest

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Workspace
WORKDIR /home/user

# Default env placeholders (overridden at sandbox creation via envs)
ENV ANTHROPIC_BASE_URL=https://gen.pollinations.ai
ENV ANTHROPIC_MODEL=claude-sonnet-4-5

# Keep container alive; E2B manages lifecycle.
CMD ["bash"]