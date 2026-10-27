# E2B template for Claude Code running against Pollinations.
# Based on https://docs.e2b.dev/template/examples/claude-code
FROM e2bdev/code-interpreter:latest

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Workspace
WORKDIR /home/user

# Default env placeholders (overridden at sandbox creation via envs)
# Use a free model by default; paid models require paid Pollen enabled on the key
ENV ANTHROPIC_BASE_URL=https://gen.pollinations.ai
ENV ANTHROPIC_MODEL=openai/gpt-5.4-nano

# Keep container alive; E2B manages lifecycle.
CMD ["bash"]