
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { e2bProvider } from "@/lib/sandbox";
import { env } from "@/lib/env";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const list = await e2bProvider.list({ apiKey: session.sk, sub: session.sub });
    return NextResponse.json({ sandboxes: list });
  } catch (e: unknown) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const model = body?.model ?? "claude-sonnet-4-5";
  const timeout = Math.min(body?.timeout ?? 300, 600);
  try {
    const info = await e2bProvider.create({
      apiKey: session.sk,
      templateId: env().E2B_TEMPLATE_ID,
      timeout,
      sub: session.sub,
      model,
    });
    // apply network policy (best effort)
    try {
      await e2bProvider.setNetwork({ apiKey: session.sk, id: info.sandboxId });
    } catch (e) {
      console.warn("setNetwork failed", e);
    }
    return NextResponse.json({ sandbox: info }, { status: 201 });
  } catch (e: unknown) {
    return handleError(e);
  }
}

function handleError(e: unknown) {
  const status = (e as {status?:number})?.status ?? 500;
  if (status === 402) {
    return NextResponse.json(
      { error: "insufficient_credits", message: "Not enough Pollen credits." },
      { status: 402 },
    );
  }
  if (status === 429) {
    return NextResponse.json(
      { error: "concurrency_cap", message: "Too many concurrent sandboxes." },
      { status: 429 },
    );
  }
  if (status === 404) {
    return NextResponse.json({ error: "not_found", message: "Sandbox not found." }, { status: 404 });
  }
  return NextResponse.json(
    { error: "sandbox_error", message: (e as {body?:string})?.body ?? (e as {message?:string})?.message ?? "unknown" },
    { status },
  );
}