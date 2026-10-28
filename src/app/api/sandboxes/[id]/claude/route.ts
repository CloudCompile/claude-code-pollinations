import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { connectUserSandbox, ownsSandbox } from "@/lib/sandbox-connect";
import { claudeCommand, parseClaudeLine } from "@/lib/claude";
import { supabaseAdmin, truncateToolOutput } from "@/lib/supabase";

export const maxDuration = 300;

// POST /api/sandboxes/[id]/claude
// Body: { prompt: string, sessionId?: string|null, model?: string, conversationId?: string }
// Streams Claude Code's stream-json as newline-delimited JSON events.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const prompt = body?.prompt;
  if (typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "prompt_required" }, { status: 400 });
  }
  const model = typeof body?.model === "string" && body.model ? body.model : "openai/gpt-5.4-nano";
  const claudeSessionId = typeof body?.sessionId === "string" && body.sessionId ? body.sessionId : null;
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : null;

  if (!(await ownsSandbox(session.sk, session.sub, id))) {
    return NextResponse.json({ error: "not_found", message: "Sandbox not found." }, { status: 404 });
  }

  let sbx;
  try {
    sbx = await connectUserSandbox(session.sk, id);
  } catch (e: unknown) {
    const err = e as { statusCode?: number; message?: string };
    const status = err?.statusCode ?? 500;
    const map: Record<number, string> = {
      402: "insufficient_credits",
      429: "concurrency_cap",
      404: "not_found",
    };
    return NextResponse.json(
      { error: map[status] ?? "sandbox_error", message: err?.message ?? "connect failed" },
      { status },
    );
  }

  const encoder = new TextEncoder();
  const collectedEvents: unknown[] = [];
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        collectedEvents.push(obj);
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };
      try {
        const cmd = claudeCommand(model, claudeSessionId);
        const handle = await sbx.commands.run(cmd, {
          background: true,
          stdin: true,
          timeoutMs: 280_000,
          onStdout: (data) => {
            for (const line of data.split("\n")) {
              for (const ev of parseClaudeLine(line)) {
                // keep transcripts lean: drop raw lines and big tool outputs
                if (ev.type === "raw") continue;
                if (ev.type === "tool_result") {
                  send({ ...ev, content: truncateToolOutput(ev.content) });
                  continue;
                }
                send(ev);
              }
            }
          },
          onStderr: (data) => {
            if (data.trim()) send({ type: "stderr", text: data });
          },
        });
        await handle.sendStdin(prompt + "\n");
        await handle.closeStdin();
        const result = await handle.wait();
        send({ type: "done", exitCode: result.exitCode });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        send({ type: "error", message: msg });
      } finally {
        // Persist the transcript if a conversation is bound.
        if (conversationId) {
          try {
            const sb = supabaseAdmin();
            await sb.from("messages").insert({
              conversation_id: conversationId,
              role: "user",
              content: prompt,
            });
            await sb.from("messages").insert({
              conversation_id: conversationId,
              role: "assistant",
              model,
              content: { events: collectedEvents.slice(-200) },
            });
            await sb
              .from("conversations")
              .update({ updated_at: new Date().toISOString(), model })
              .eq("id", conversationId);
          } catch (e) {
            console.error("transcript save failed", e);
          }
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}