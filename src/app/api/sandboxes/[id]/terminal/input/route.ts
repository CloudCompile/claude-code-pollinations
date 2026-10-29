import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { writeToTerminal } from "@/lib/terminal";

export const maxDuration = 30;
export const runtime = "nodejs";

// POST /api/sandboxes/[id]/terminal/input
// Body: { data: string } — sends keystrokes to the PTY.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const data = typeof body?.data === "string" ? body.data : "";
  const pid = Number(body?.pid);
  if (!Number.isSafeInteger(pid) || pid < 1) return NextResponse.json({ error: "pid_required" }, { status: 400 });
  if (!data) return NextResponse.json({ error: "data_required" }, { status: 400 });

  try {
    await writeToTerminal(id, session.sub, session.sk, pid, data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "terminal_input_failed", message: e instanceof Error ? e.message : "input failed" }, { status: 502 });
  }
}