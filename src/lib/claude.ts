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
  let msg: any;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return [{ type: "raw", line: trimmed }];
  }
  const out: ClaudeEvent[] = [];
  switch (msg?.type) {
    case "system":
      out.push({ type: "system", subtype: msg.subtype, session_id: msg.session_id });
      break;
    case "assistant": {
      const content = msg.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === "text" && block.text) {
            out.push({ type: "assistant_text", text: block.text });
          } else if (block?.type === "thinking" && block.thinking) {
            out.push({ type: "assistant_thinking", text: block.thinking });
          } else if (block?.type === "tool_use") {
            out.push({
              type: "tool_use",
              id: block.id,
              name: block.name,
              input: block.input,
            });
          }
        }
      }
      break;
    }
    case "user": {
      const content = msg.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === "tool_result") {
            const c = typeof block.content === "string"
              ? block.content
              : Array.isArray(block.content)
                ? block.content.map((x: any) => x?.text ?? "").join("\n")
                : JSON.stringify(block.content);
            out.push({
              type: "tool_result",
              tool_use_id: block.tool_use_id,
              content: c,
              is_error: block.is_error,
            });
          }
        }
      }
      break;
    }
    case "result":
      out.push({
        type: "result",
        subtype: msg.subtype,
        result: msg.result,
        is_error: msg.is_error,
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