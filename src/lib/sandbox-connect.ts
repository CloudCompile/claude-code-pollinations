import { Sandbox } from "e2b";
import { env } from "./env";
import { OWNER_KEY } from "./sandbox";

// Connect (resuming if paused) to the user's sandbox with the user's key.
export async function connectUserSandbox(apiKey: string, sandboxId: string, timeoutMs = 300_000) {
  return Sandbox.connect(sandboxId, {
    apiKey,
    ...(env().E2B_SANDBOX_URL ? { sandboxUrl: env().E2B_SANDBOX_URL } : {}),
    timeoutMs,
  });
}

// Verify the sandbox belongs to the user (defense in depth; the proxy also
// scopes listing, but a direct id could belong to someone else).
export async function ownsSandbox(apiKey: string, sub: string, sandboxId: string): Promise<boolean> {
  try {
    const info = await Sandbox.getInfo(sandboxId, {
      apiKey,
      ...(env().E2B_SANDBOX_URL ? { sandboxUrl: env().E2B_SANDBOX_URL } : {}),
    });
    return info.metadata?.[OWNER_KEY] === sub;
  } catch {
    return false;
  }
}