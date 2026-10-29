import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { connectUserSandbox, ownsSandbox } from "@/lib/sandbox-connect";

export const maxDuration = 60;
export const runtime = "nodejs";

// GET /api/sandboxes/[id]/files?path=/home/user
// Lists directory entries. Returns { path, entries: [{name,type,path,size}] }.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const path = url.searchParams.get("path") || "/home/user";

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
    const entries = await sbx.files.list(path);
    const mapped = entries.map((e) => ({
      name: e.name,
      type: e.type, // "file" | "dir"
      path: e.path,
      size: (e as { size?: number }).size,
    }));
    return NextResponse.json({ path, entries: mapped });
  } catch (e: unknown) {
    const err = e as { statusCode?: number; message?: string };
    return NextResponse.json({ error: "files_list_failed", message: err?.message ?? "list failed" }, { status: err?.statusCode ?? 500 });
  }
}