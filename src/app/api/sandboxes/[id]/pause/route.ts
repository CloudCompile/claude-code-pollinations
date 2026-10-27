
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { e2bProvider } from "@/lib/sandbox";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await e2bProvider.pause({ apiKey: session.sk, id });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: "sandbox_error", message: e?.body ?? e?.message }, { status: e?.status ?? 500 });
  }
}