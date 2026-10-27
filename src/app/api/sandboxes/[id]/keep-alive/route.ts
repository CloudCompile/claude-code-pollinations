
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { e2bProvider } from "@/lib/sandbox";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const timeout = Math.min(body?.timeout ?? 300, 600);
  try {
    await e2bProvider.keepAlive({ apiKey: session.sk, id, timeout });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: "sandbox_error", message: (e as {body?:string})?.body ?? (e as {message?:string})?.message }, { status: (e as {status?:number})?.status ?? 500 });
  }
}