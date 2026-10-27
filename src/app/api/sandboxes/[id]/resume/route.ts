
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { e2bProvider } from "@/lib/sandbox";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  try {
    const info = await e2bProvider.resume({ apiKey: session.sk, id, timeout: body?.timeout ?? 300 });
    return NextResponse.json({ sandbox: info });
  } catch (e: unknown) {
    return NextResponse.json({ error: "sandbox_error", message: (e as {body?:string})?.body ?? (e as {message?:string})?.message }, { status: (e as {status?:number})?.status ?? 500 });
  }
}