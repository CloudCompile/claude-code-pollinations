import { Sandbox } from "e2b";
import { env } from "./env";

export type TerminalStart = { pid: number };

function connection(apiKey: string) {
  const config = env();
  return {
    apiKey,
    apiUrl: config.E2B_API_URL,
    ...(config.E2B_SANDBOX_URL ? { sandboxUrl: config.E2B_SANDBOX_URL } : {}),
    timeoutMs: 300_000,
  };
}

// PTYs live in the sandbox, not in a Vercel worker's memory. Every request
// reconnects by PID, so serverless instance changes don't destroy the session.
export async function startTerminal(
  sandboxId: string,
  _sub: string,
  apiKey: string,
  cols = 80,
  rows = 24,
): Promise<TerminalStart> {
  const sandbox = await Sandbox.connect(sandboxId, connection(apiKey));
  const handle = await sandbox.pty.create({
    cols,
    rows,
    timeoutMs: 0,
    onData: () => undefined,
  });
  return { pid: handle.pid };
}

export async function writeToTerminal(
  sandboxId: string,
  _sub: string,
  apiKey: string,
  pid: number,
  data: string,
): Promise<void> {
  const sandbox = await Sandbox.connect(sandboxId, connection(apiKey));
  await sandbox.pty.sendInput(pid, new TextEncoder().encode(data));
}

export async function resizeTerminal(
  sandboxId: string,
  _sub: string,
  apiKey: string,
  pid: number,
  cols: number,
  rows: number,
): Promise<void> {
  const sandbox = await Sandbox.connect(sandboxId, connection(apiKey));
  await sandbox.pty.resize(pid, { cols, rows });
}

export async function connectTerminal(
  sandboxId: string,
  apiKey: string,
  pid: number,
  onData: (data: Uint8Array) => void,
) {
  const sandbox = await Sandbox.connect(sandboxId, connection(apiKey));
  return sandbox.pty.connect(pid, { onData, timeoutMs: 300_000 });
}

export async function killTerminal(
  sandboxId: string,
  apiKey: string,
  pid: number,
): Promise<void> {
  const sandbox = await Sandbox.connect(sandboxId, connection(apiKey));
  await sandbox.pty.kill(pid).catch(() => false);
}
