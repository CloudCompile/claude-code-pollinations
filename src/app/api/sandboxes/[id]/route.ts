
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { e2bProvider } from "@/lib/sandbox";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const info = await e2bProvider.get({ apiKey: session.sk, id });
    return NextResponse.json({ sandbox: info });
  } catch (e: any) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await e2bProvider.delete({ apiKey: session.sk, id });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return handleError(e);
  }
}

function handleError(e: any) {
  const status = e?.status ?? 500;
  if (status === 404) {
    return NextResponse.json({ error: "not_found", message: "Sandbox not found." }, { status: 404 });
  }
  return NextResponse.json({ error: "sandbox_error", message: e?.body ?? e?.message }, { status });
}