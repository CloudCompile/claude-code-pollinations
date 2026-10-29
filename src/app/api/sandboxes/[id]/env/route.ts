import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { connectUserSandbox, ownsSandbox } from "@/lib/sandbox-connect";

export const maxDuration = 60;
export const runtime = "nodejs";

const ENV_FILE = "/home/user/.claude-cloud-env.json";

// GET /api/sandboxes/[id]/env  -> { vars: Record<string,string> }
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    if (!(await ownsSandbox(session.sk, session.sub, id))) {
      return NextResponse.json({ error: "not_found", message: "Sandbox not found." }, { status: 404 });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "ownership check failed";
    const stale = msg.includes("Sign out");
    return NextResponse.json({ error: stale ? "stale_session" : "sandbox_error", message: msg }, { status: stale ? 403 : 500 });
  }
  try {
    const sbx = await connectUserSandbox(session.sk, id, 60_000);
    let vars: Record<string, string> = {};
    try {
      const raw = await sbx.files.read(ENV_FILE);
      vars = JSON.parse(raw) as Record<string, string>;
    } catch {
      vars = {};
    }
    return NextResponse.json({ vars });
  } catch (e: unknown) {
    const err = e as { statusCode?: number; message?: string };
    return NextResponse.json({ error: "env_read_failed", message: err?.message ?? "read failed" }, { status: err?.statusCode ?? 500 });
  }
}

// POST /api/sandboxes/[id]/env  Body: { key, value } or { vars: {...} } or { delete: key }
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  try {
    if (!(await ownsSandbox(session.sk, session.sub, id))) {
      return NextResponse.json({ error: "not_found", message: "Sandbox not found." }, { status: 404 });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "ownership check failed";
    const stale = msg.includes("Sign out");
    return NextResponse.json({ error: stale ? "stale_session" : "sandbox_error", message: msg }, { status: stale ? 403 : 500 });
  }
  try {
    const sbx = await connectUserSandbox(session.sk, id, 60_000);
    let vars: Record<string, string> = {};
    try {
      const raw = await sbx.files.read(ENV_FILE);
      vars = JSON.parse(raw) as Record<string, string>;
    } catch {
      vars = {};
    }
    if (typeof body?.delete === "string") {
      delete vars[body.delete];
    } else if (body?.vars && typeof body.vars === "object") {
      Object.assign(vars, body.vars);
    } else if (typeof body?.key === "string") {
      if (body.value === null || body.value === undefined) delete vars[body.key];
      else vars[body.key] = String(body.value);
    }
    await sbx.files.write(ENV_FILE, JSON.stringify(vars, null, 2));
    // Also write a shell-sourceable file for terminals.
    const shell = Object.entries(vars).map(([k, v]) => `export ${k}=${JSON.stringify(v)}`).join("\n") + "\n";
    await sbx.files.write("/home/user/.claude-cloud-env.sh", shell);
    return NextResponse.json({ ok: true, vars });
  } catch (e: unknown) {
    const err = e as { statusCode?: number; message?: string };
    return NextResponse.json({ error: "env_write_failed", message: err?.message ?? "write failed" }, { status: err?.statusCode ?? 500 });
  }
}