# E2B template: Claude Code on Pollinations

Build and publish with the E2B CLI:

```bash
cd e2b-template
e2b template build --name claude-code-pollinations
```

Then set `E2B_TEMPLATE_ID` to the published template id.

## Included toolchain (default in every sandbox)
- **Python** (pip): numpy, pandas, polars, scipy, matplotlib, seaborn,
  scikit-learn, requests, httpx, aiohttp, beautifulsoup4, lxml,
  python-dotenv, pillow, plotly, openpyxl, pydantic, pytest, ruff, black,
  ipython, jupyter
- **Node global CLIs**: Claude Code, node-gyp, typescript, tsx, prettier,
  eslint, nodemon
- **System**: build-essential, pkg-config, git, curl, wget, zip, unzip,
  jq, ffmpeg, libgl1, libglib2.0-0

If a package is still missing, either add it here and rebuild the template, or
install it at runtime with `pip install` / `npm i -g` inside the sandbox.

## Notes
- Claude Code is pointed at Pollinations via `ANTHROPIC_BASE_URL=https://gen.pollinations.ai`
  and `ANTHROPIC_AUTH_TOKEN=<user sk_ key>` (set per sandbox at creation).
- Use `ANTHROPIC_AUTH_TOKEN`, not `ANTHROPIC_API_KEY`.
- Network policy is applied after creation via PUT /sandboxes/{id}/network.