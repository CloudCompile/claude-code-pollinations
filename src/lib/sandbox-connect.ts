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
// Throws SandboxError-shaped errors instead of swallowing them: a 403 means
// the session key lacks the `machines` permission (stale login), a 404 means
// the sandbox is gone. Only a true mismatch returns false.
export async function ownsSandbox(apiKey: string, sub: string, sandboxId: string): Promise<boolean> {
  let info;
  try {
    info = await Sandbox.getInfo(sandboxId, {
      apiKey,
      ...(env().E2B_SANDBOX_URL ? { sandboxUrl: env().E2B_SANDBOX_URL } : {}),
    });
  } catch (e) {
    const err = e as { statusCode?: number; message?: string };
    if (err?.statusCode === 403) {
      throw new Error(
        "Your session key lacks the sandbox permission. Sign out and sign in again to refresh it.",
      );
    }
    if (err?.statusCode === 404) return false;
    throw new Error(err?.message ?? "Failed to verify sandbox ownership.");
  }
  return info.metadata?.[OWNER_KEY] === sub;
}