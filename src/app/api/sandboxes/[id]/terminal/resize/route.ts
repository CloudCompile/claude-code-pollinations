import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { resizeTerminal } from "@/lib/terminal";

export const maxDuration = 30;
export const runtime = "nodejs";

// POST /api/sandboxes/[id]/terminal/resize
// Body: { cols, rows } — resize the PTY.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const pid = Number(body?.pid);
  if (!Number.isSafeInteger(pid) || pid < 1) return NextResponse.json({ error: "pid_required" }, { status: 400 });
  const cols = Math.max(20, Math.min(300, Number(body?.cols) || 80));
  const rows = Math.max(5, Math.min(100, Number(body?.rows) || 24));

  try {
    await resizeTerminal(id, session.sub, session.sk, pid, cols, rows);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "terminal_resize_failed", message: e instanceof Error ? e.message : "resize failed" }, { status: 502 });
  }
}