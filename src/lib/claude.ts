// Helpers for running Claude Code inside an E2B sandbox and parsing its
// stream-json output into UI events.

export type ClaudeEvent =
  | { type: "system"; subtype: string; session_id?: string }
  | { type: "assistant_text"; text: string }
  | { type: "assistant_thinking"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: unknown;
    }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | { type: "result"; subtype: string; result?: string; is_error?: boolean; usage?: unknown }
  | { type: "raw"; line: string };

export function claudeCommand(model: string, resumeSessionId?: string | null): string {
  const parts = [
    "claude",
    "-p",
    "--output-format stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
    `--model ${JSON.stringify(model)}`,
  ];
  if (resumeSessionId) parts.push(`--resume ${JSON.stringify(resumeSessionId)}`);
  return parts.join(" ");
}

// Parse one stream-json line into zero or more UI events.
export function parseClaudeLine(line: string): ClaudeEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return [{ type: "raw", line: trimmed }];
  }
  const out: ClaudeEvent[] = [];
  const type = msg?.type as string | undefined;
  switch (type) {
    case "system":
      out.push({
        type: "system",
        subtype: msg.subtype as string,
        session_id: msg.session_id as string | undefined,
      });
      break;
    case "assistant": {
      const content = (msg.message as Record<string, unknown> | undefined)?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as Record<string, unknown>;
          if (b?.type === "text" && b.text) {
            out.push({ type: "assistant_text", text: b.text as string });
          } else if (b?.type === "thinking" && b.thinking) {
            out.push({ type: "assistant_thinking", text: b.thinking as string });
          } else if (b?.type === "tool_use") {
            out.push({
              type: "tool_use",
              id: b.id as string,
              name: b.name as string,
              input: b.input,
            });
          }
        }
      }
      break;
    }
    case "user": {
      const content = (msg.message as Record<string, unknown> | undefined)?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as Record<string, unknown>;
          if (b?.type === "tool_result") {
            const raw = b.content;
            const c =
              typeof raw === "string"
                ? raw
                : Array.isArray(raw)
                  ? raw.map((x) => (x as Record<string, unknown>)?.text ?? "").join("\n")
                  : JSON.stringify(raw);
            out.push({
              type: "tool_result",
              tool_use_id: b.tool_use_id as string,
              content: c,
              is_error: b.is_error as boolean | undefined,
            });
          }
        }
      }
      break;
    }
    case "result":
      out.push({
        type: "result",
        subtype: msg.subtype as string,
        result: msg.result as string | undefined,
        is_error: msg.is_error as boolean | undefined,
        usage: msg.usage,
      });
      break;
    default:
      out.push({ type: "raw", line: trimmed });
  }
  return out;
}

// Extract the session id from stream-json output lines (system init event).
export function sessionIdFromLines(lines: string[]): string | null {
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg?.type === "system" && msg.session_id) return msg.session_id;
    } catch {
      /* ignore */
    }
  }
  return null;
}