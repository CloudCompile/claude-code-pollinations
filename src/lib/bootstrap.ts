import { connectUserSandbox } from "./sandbox-connect";

// Idempotent default-package bootstrap for stock-template sandboxes.
// Runs in the background after creation so `create` returns fast. It checks
// for the most common missing pieces (numpy, a global CLI, etc.) and installs
// them only when absent — cheap on fresh sandboxes, no-op once satisfied.
export async function bootstrapSandbox(
  apiKey: string,
  sandboxId: string,
): Promise<void> {
  try {
    const sbx = await connectUserSandbox(apiKey, sandboxId, 120_000);

    // Guard: only run on a template that lacks the toolchain. We detect this
    // by checking if numpy is importable; if it is, we assume the custom/baked
    // template (or a prior bootstrap) already provisioned everything.
    const probe = await sbx.commands.run(
      'python3 -c "import numpy, pandas" 2>&1 && command -v claude >/dev/null 2>&1 && echo ready',
      { timeoutMs: 20_000 },
    );
    if (probe.stdout.includes("ready")) {
      // already bootstrapped
      return;
    }

    // Install core Python datascience stack (best-effort, ignore failures).
    await sbx.commands.run(
      "pip install --no-cache-dir --break-system-packages numpy pandas polars scipy matplotlib seaborn scikit-learn requests httpx aiohttp beautifulsoup4 lxml python-dotenv pillow plotly openpyxl pydantic pytest ruff black ipython jupyter 2>&1",
      { timeoutMs: 240_000 },
    ).catch(() => undefined);

    // Ensure Claude Code CLI is present.
    const hasClaude = await sbx.commands.run(
      "command -v claude >/dev/null 2>&1 && echo yes || echo no",
      { timeoutMs: 15_000 },
    );
    if (!hasClaude.stdout.includes("yes")) {
      await sbx.commands.run(
        "npm install -g @anthropic-ai/claude-code 2>&1",
        { timeoutMs: 240_000 },
      ).catch(() => undefined);
    }
  } catch (e) {
    // Bootstrap is best-effort; never let it break sandbox creation.
    console.warn(`bootstrap skip ${sandboxId}:`, e instanceof Error ? e.message : String(e));
  }
}