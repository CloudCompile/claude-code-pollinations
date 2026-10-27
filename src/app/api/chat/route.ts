
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { modelClientCall, normalizeError } from "@/lib/models";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const { model, messages, endpoint } = body;
  const ep = endpoint ?? "/v1/chat/completions";
  const res = await modelClientCall({
    model,
    endpoint: ep,
    body: { ...body?.request, model, messages, stream: body?.stream ?? false },
    apiKey: session.sk,
  });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: normalizeError(res, text) },
      { status: res.status },
    );
  }
  // stream through
  if (body?.stream) {
    return new Response(res.body, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "text/event-stream",
      },
    });
  }
  const json = await res.json();
  // enforce usage on text responses
  if (!json?.usage) {
    return NextResponse.json(
      { error: "missing_usage", message: "Model response missing usage." },
      { status: 502 },
    );
  }
  return NextResponse.json(json);
}