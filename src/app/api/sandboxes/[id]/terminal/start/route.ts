import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { startTerminal } from "@/lib/terminal";
import { ownsSandbox } from "@/lib/sandbox-connect";

export const maxDuration = 60;
export const runtime = "nodejs";

// POST /api/sandboxes/[id]/terminal/start
// Starts a persistent PTY shell. Returns the session id + a stream URL.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const cols = Math.max(20, Math.min(300, Number(body?.cols) || 80));
  const rows = Math.max(5, Math.min(100, Number(body?.rows) || 24));

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
    const term = await startTerminal(id, session.sub, session.sk, cols, rows);
    return NextResponse.json(
      {
        pid: term.pid,
        streamUrl: `/api/sandboxes/${id}/terminal/stream?pid=${term.pid}`,
      },
      { status: 201 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "start failed";
    return NextResponse.json({ error: "terminal_start_failed", message: msg }, { status: 500 });
  }
}