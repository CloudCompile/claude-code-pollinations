import { getSession } from "@/lib/session";
import { connectTerminal } from "@/lib/terminal";

export const maxDuration = 300;
export const runtime = "nodejs";

// GET /api/sandboxes/[id]/terminal/stream?pid=<pty pid>
// Stream UTF-8 terminal output as newline-delimited JSON. PTY remains alive
// when this request is cancelled, allowing browser reconnects.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const pid = Number(new URL(req.url).searchParams.get("pid"));
  if (!Number.isSafeInteger(pid) || pid < 1) return new Response("pid_required", { status: 400 });

  const encoder = new TextEncoder();
  let connected: { wait: () => Promise<unknown>; disconnect: () => Promise<void> } | undefined;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        connected = await connectTerminal(id, session.sk, pid, (chunk) => {
          try {
            controller.enqueue(encoder.encode(JSON.stringify({ type: "data", data: Buffer.from(chunk).toString("base64") }) + "\n"));
          } catch {
            // Client may have disconnected; sandbox PTY stays alive.
          }
        });
        controller.enqueue(encoder.encode(JSON.stringify({ type: "ready", pid }) + "\n"));
        await connected.wait();
        controller.enqueue(encoder.encode(JSON.stringify({ type: "exit" }) + "\n"));
      } catch (e) {
        try {
          controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message: e instanceof Error ? e.message : "terminal stream failed" }) + "\n"));
        } catch { /* client disconnected */ }
      } finally {
        await connected?.disconnect().catch(() => undefined);
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    async cancel() {
      await connected?.disconnect().catch(() => undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
