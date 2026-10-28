import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { connectUserSandbox, ownsSandbox } from "@/lib/sandbox-connect";

export const maxDuration = 60;

// POST /api/sandboxes/[id]/exec  Body: { command: string }
// Runs a shell command in the user's sandbox and returns stdout/stderr/exitCode.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const command = body?.command;
  if (typeof command !== "string" || !command.trim()) {
    return NextResponse.json({ error: "command_required" }, { status: 400 });
  }
  try {
    if (!(await ownsSandbox(session.sk, session.sub, id))) {
      return NextResponse.json({ error: "not_found", message: "Sandbox not found." }, { status: 404 });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "ownership check failed";
    const stale = msg.includes("Sign out");
    return NextResponse.json(
      { error: stale ? "stale_session" : "sandbox_error", message: msg },
      { status: stale ? 403 : 500 },
    );
  }
  try {
    const sbx = await connectUserSandbox(session.sk, id, 60_000);
    const result = await sbx.commands.run(command, { timeoutMs: 55_000 });
    return NextResponse.json({
      stdout: result.stdout.slice(-100_000),
      stderr: result.stderr.slice(-100_000),
      exitCode: result.exitCode,
    });
  } catch (e: unknown) {
    const err = e as { statusCode?: number; message?: string };
    const status = err?.statusCode ?? 500;
    const map: Record<number, string> = {
      402: "insufficient_credits",
      429: "concurrency_cap",
      404: "not_found",
    };
    return NextResponse.json(
      { error: map[status] ?? "sandbox_error", message: err?.message ?? "exec failed" },
      { status },
    );
  }
}