"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatEvent =
  | { type: "system"; subtype: string; session_id?: string }
  | { type: "assistant_text"; text: string }
  | { type: "assistant_thinking"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | { type: "result"; subtype: string; result?: string; is_error?: boolean }
  | { type: "stderr"; text: string }
  | { type: "error"; message: string }
  | { type: "done"; exitCode?: number };

type Item =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool"; name: string; input: unknown; result?: string; isError?: boolean }
  | { kind: "notice"; text: string };

type Model = { id: string; title?: string; paid_only?: boolean; reasoning?: boolean };

export default function SandboxChatPage() {
  const params = useParams();
  const router = useRouter();
  const sandboxId = params.id as string;

  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState("openai/gpt-5.4-nano");
  const [modelOpen, setModelOpen] = useState(false);
  const [modelFilter, setModelFilter] = useState("");
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(null);
  const [sandboxState, setSandboxState] = useState<string>("unknown");
  const [tab, setTab] = useState<"chat" | "terminal">("chat");
  const [conversationId, setConversationId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // load models
  useEffect(() => {
    let cancelled = false;
    fetch("/api/models")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && Array.isArray(d.models)) setModels(d.models);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // sandbox state + keep-alive while open
  const refreshState = useCallback(async () => {
    const res = await fetch(`/api/sandboxes/${sandboxId}`);
    if (res.ok) {
      const d = await res.json();
      setSandboxState(d.sandbox?.state ?? "unknown");
    } else if (res.status === 404) {
      setSandboxState("gone");
    }
  }, [sandboxId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/sandboxes/${sandboxId}`);
      if (cancelled) return;
      if (res.ok) {
        const d = await res.json();
        setSandboxState(d.sandbox?.state ?? "unknown");
      } else if (res.status === 404) {
        setSandboxState("gone");
      }
    })();
    const t = setInterval(async () => {
      // keep-alive: 5 min lease while the user is on the page
      await fetch(`/api/sandboxes/${sandboxId}/keep-alive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeout: 300 }),
      }).catch(() => undefined);
      const res = await fetch(`/api/sandboxes/${sandboxId}`);
      if (cancelled || !res.ok) return;
      const d = await res.json();
      setSandboxState(d.sandbox?.state ?? "unknown");
    }, 240_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [sandboxId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [items]);

  async function send() {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setInput("");
    setBusy(true);
    setItems((prev) => [...prev, { kind: "user", text: prompt }]);

    try {
      // ensure a conversation exists for transcripts
      let convId = conversationId;
      if (!convId) {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sandbox_id: sandboxId, model, title: prompt.slice(0, 60) }),
        });
        if (res.ok) {
          const d = await res.json();
          convId = d.conversation?.id ?? null;
          setConversationId(convId);
        }
      }

      const res = await fetch(`/api/sandboxes/${sandboxId}/claude`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model, sessionId: claudeSessionId, conversationId: convId }),
      });

      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        const msg = d.message ?? d.error ?? "request failed";
        setItems((prev) => [...prev, { kind: "notice", text: msg }]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let currentTool: Item | null = null;

      const apply = (ev: ChatEvent) => {
        switch (ev.type) {
          case "system":
            if (ev.session_id) setClaudeSessionId(ev.session_id);
            break;
          case "assistant_text":
            setItems((prev) => [...prev, { kind: "assistant", text: ev.text }]);
            break;
          case "assistant_thinking":
            setItems((prev) => [...prev, { kind: "thinking", text: ev.text }]);
            break;
          case "tool_use":
            currentTool = { kind: "tool", name: ev.name, input: ev.input };
            setItems((prev) => [...prev, currentTool!]);
            break;
          case "tool_result":
            if (currentTool) {
              const t = currentTool;
              setItems((prev) =>
                prev.map((x) =>
                  x === t ? { ...t, result: ev.content, isError: ev.is_error } : x,
                ),
              );
              currentTool = null;
            }
            break;
          case "result":
            if (ev.is_error && ev.result) {
              setItems((prev) => [...prev, { kind: "notice", text: ev.result! }]);
            }
            break;
          case "error":
            setItems((prev) => [...prev, { kind: "notice", text: ev.message }]);
            break;
          case "done":
            if (ev.exitCode && ev.exitCode !== 0) {
              setItems((prev) => [
                ...prev,
                { kind: "notice", text: `claude exited with code ${ev.exitCode}` },
              ]);
            }
            break;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          try {
            apply(JSON.parse(line) as ChatEvent);
          } catch {
            /* partial line */
          }
        }
      }
      refreshState();
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const filteredModels = models.filter((m) =>
    m.id.toLowerCase().includes(modelFilter.toLowerCase()),
  );

  return (
    <div className="flex h-screen flex-col">
      {/* header */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-zinc-500 hover:text-zinc-300"
            title="Back to sandboxes"
          >
            ←
          </button>
          <span className="text-lg">⌾</span>
          <span className="font-mono text-sm text-zinc-400">{sandboxId.slice(0, 14)}…</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              sandboxState === "running"
                ? "bg-green-950 text-green-400"
                : sandboxState === "gone"
                  ? "bg-red-950 text-red-400"
                  : "bg-zinc-800 text-zinc-400"
            }`}
          >
            {sandboxState}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* model picker */}
          <div className="relative">
            <button
              onClick={() => setModelOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              <span className="max-w-[240px] truncate font-mono text-xs">{model}</span>
              <span className="text-zinc-600">▾</span>
            </button>
            {modelOpen && (
              <div className="absolute right-0 z-10 mt-1 w-96 rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl">
                <input
                  autoFocus
                  value={modelFilter}
                  onChange={(e) => setModelFilter(e.target.value)}
                  placeholder="Filter models…"
                  className="w-full border-b border-zinc-800 bg-transparent px-4 py-2.5 text-sm outline-none placeholder:text-zinc-600"
                />
                <ul className="max-h-80 overflow-y-auto p-1">
                  {filteredModels.slice(0, 50).map((m) => (
                    <li key={m.id}>
                      <button
                        onClick={() => {
                          setModel(m.id);
                          setModelOpen(false);
                          setModelFilter("");
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-800 ${
                          m.id === model ? "text-blue-400" : "text-zinc-300"
                        }`}
                      >
                        <span className="truncate font-mono text-xs">{m.id}</span>
                        <span className="flex shrink-0 gap-1">
                          {m.reasoning && (
                            <span className="rounded bg-zinc-800 px-1.5 text-[10px] text-zinc-400">
                              reasoning
                            </span>
                          )}
                          {m.paid_only && (
                            <span className="rounded bg-amber-950 px-1.5 text-[10px] text-amber-400">
                              paid
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                  {filteredModels.length === 0 && (
                    <li className="px-3 py-2 text-sm text-zinc-600">No models match</li>
                  )}
                </ul>
              </div>
            )}
          </div>

          {/* tabs */}
          <div className="flex rounded-lg border border-zinc-800 p-0.5 text-sm">
            {(["chat", "terminal"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1 ${
                  tab === t ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {t === "chat" ? "Chat" : "Terminal"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {sandboxState === "gone" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-zinc-500">
          <p>This sandbox no longer exists.</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-950"
          >
            Back to sandboxes
          </button>
        </div>
      ) : tab === "terminal" ? (
        <TerminalView sandboxId={sandboxId} />
      ) : (
        <>
          {/* messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl space-y-3 px-4 py-6">
              {items.length === 0 && (
                <div className="mt-24 text-center text-zinc-600">
                  <p className="text-3xl">⌾</p>
                  <p className="mt-3 text-sm">
                    Claude Code runs in sandbox{" "}
                    <span className="font-mono text-zinc-500">{sandboxId.slice(0, 14)}…</span>
                  </p>
                  <p className="mt-1 text-xs">
                    Ask it to build something. Files persist across messages.
                  </p>
                </div>
              )}
              {items.map((item, i) => (
                <Bubble key={i} item={item} />
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-zinc-400" />
                  Claude Code is working…
                </div>
              )}
            </div>
          </div>

          {/* composer */}
          <div className="border-t border-zinc-800 bg-zinc-950/80 px-4 py-3">
            <div className="mx-auto flex max-w-3xl items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={busy ? "Claude Code is working…" : "Ask Claude Code to build something…"}
                rows={1}
                disabled={busy}
                className="max-h-40 flex-1 resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm outline-none placeholder:text-zinc-600 focus:border-zinc-600 disabled:opacity-50"
              />
              <button
                onClick={send}
                disabled={!input.trim() || busy}
                className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-40"
              >
                Send
              </button>
            </div>
            <p className="mx-auto mt-1.5 max-w-3xl text-[11px] text-zinc-600">
              Enter to send · Shift+Enter for newline · billed to your Pollen balance
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Bubble({ item }: { item: Item }) {
  if (item.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-sm text-zinc-950">
          {item.text}
        </div>
      </div>
    );
  }
  if (item.kind === "assistant") {
    return (
      <div className="md max-w-[90%] text-sm leading-relaxed text-zinc-200">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
      </div>
    );
  }
  if (item.kind === "thinking") {
    return (
      <details className="max-w-[90%] text-xs text-zinc-500">
        <summary className="cursor-pointer select-none text-zinc-600">💭 thinking</summary>
        <div className="mt-1 whitespace-pre-wrap border-l border-zinc-800 pl-3">{item.text}</div>
      </details>
    );
  }
  if (item.kind === "tool") {
    const inputStr = JSON.stringify(item.input, null, 2);
    return (
      <details className="max-w-[90%] rounded-lg border border-zinc-800 bg-zinc-900/60 text-xs">
        <summary className="cursor-pointer select-none px-3 py-2 text-zinc-400">
          <span className="font-mono text-amber-400">⚙ {item.name}</span>
          {item.isError && <span className="ml-2 text-red-400">error</span>}
        </summary>
        <div className="border-t border-zinc-800 px-3 py-2">
          <pre className="overflow-x-auto text-zinc-500">{inputStr}</pre>
          {item.result && (
            <pre
              className={`mt-2 max-h-60 overflow-auto border-t border-zinc-800 pt-2 ${
                item.isError ? "text-red-400" : "text-zinc-400"
              }`}
            >
              {item.result}
            </pre>
          )}
        </div>
      </details>
    );
  }
  // notice
  return (
    <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-2.5 text-xs text-amber-300">
      {item.text}
    </div>
  );
}

function TerminalView({ sandboxId }: { sandboxId: string }) {
  const [lines, setLines] = useState<string[]>([
    "Remote shell in your sandbox.",
  ]);
  const [cmd, setCmd] = useState("");
  const [running, setRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [lines]);

  async function run() {
    const c = cmd.trim();
    if (!c || running) return;
    setCmd("");
    setRunning(true);
    setLines((l) => [...l, `$ ${c}`]);
    try {
      const res = await fetch(`/api/sandboxes/${sandboxId}/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: c }),
      });
      const d = await res.json();
      if (!res.ok) {
        setLines((l) => [...l, d.message ?? d.error ?? "exec failed"]);
      } else {
        if (d.stdout) setLines((l) => [...l, d.stdout.replace(/\n$/, "")]);
        if (d.stderr) setLines((l) => [...l, d.stderr.replace(/\n$/, "")]);
        if (d.exitCode !== 0) setLines((l) => [...l, `[exit ${d.exitCode}]`]);
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 p-4 font-mono text-xs">
      <div className="flex-1 overflow-y-auto rounded-lg border border-zinc-800 bg-black/60 p-3">
        {lines.map((l, i) => (
          <pre key={i} className="whitespace-pre-wrap text-zinc-300">
            {l}
          </pre>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="mt-2 flex gap-2">
        <span className="py-2 text-green-500">$</span>
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="ls -la"
          disabled={running}
          className="flex-1 bg-transparent py-2 outline-none placeholder:text-zinc-700"
          autoFocus
        />
      </div>
    </div>
  );
}