"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SLASH_COMMANDS, lookupSlash, type SlashCommand } from "@/lib/slash-commands";

type ChatEvent =
  | { type: "system"; subtype: string; session_id?: string }
  | { type: "assistant_text"; text: string }
  | { type: "assistant_thinking"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | { type: "result"; subtype: string; result?: string; is_error?: boolean }
  | { type: "usage"; input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; cost_usd?: number }
  | { type: "stderr"; text: string }
  | { type: "error"; message: string }
  | { type: "done"; exitCode?: number };

type Item =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool"; name: string; input: unknown; result?: string; isError?: boolean }
  | { kind: "notice"; text: string };

type Model = {
  id: string;
  title?: string;
  paid_only?: boolean;
  reasoning?: boolean;
  community?: boolean;
  context_length?: number;
  publisher?: string;
  health?: { status?: string; success_rate?: number };
};

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
  const [staleSession, setStaleSession] = useState(false);
  const [usageState, setUsageState] = useState<{ input?: number; output?: number; context?: number; limit?: number; cost?: number } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState("/home/user");
  const [slashOpen, setSlashOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // On mount, restore the saved conversation (transcript + Claude session id)
  // for this sandbox so history survives a page reload.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/conversations");
        if (!res.ok) return;
        const data = await res.json();
        const convs: Array<{
          id: string;
          sandbox_id?: string | null;
          model?: string | null;
        }> = data.conversations ?? [];
        const conv = convs.find((c) => c.sandbox_id === sandboxId);
        if (!conv || cancelled) return;
        setConversationId(conv.id);
        if (conv.model) setModel(conv.model);
        const msgRes = await fetch(`/api/conversations/${conv.id}`);
        if (!msgRes.ok || cancelled) return;
        const msgData = await msgRes.json();
        const msgs: Array<{ role: string; content: unknown }> = msgData.messages ?? [];
        const restored: Item[] = [];
        let lastSessionId: string | null = null;
        for (const m of msgs) {
          if (m.role === "user") {
            if (typeof m.content === "string") restored.push({ kind: "user", text: m.content });
          } else if (m.role === "assistant") {
            const content = m.content as { events?: unknown[] } | string | null;
            const events = content && typeof content === "object" ? content.events : undefined;
            if (Array.isArray(events)) {
              for (const ev of events) {
                const e = ev as { type?: string; text?: string; name?: string; input?: unknown; content?: string; is_error?: boolean; session_id?: string };
                if (e.type === "system" && e.session_id) lastSessionId = e.session_id;
                else if (e.type === "assistant_text" && e.text) restored.push({ kind: "assistant", text: e.text });
                else if (e.type === "assistant_thinking" && e.text) restored.push({ kind: "thinking", text: e.text });
                else if (e.type === "tool_use" && e.name)
                  restored.push({ kind: "tool", name: e.name, input: e.input });
                else if (e.type === "tool_result" && e.content) {
                  const last = restored[restored.length - 1];
                  if (last && last.kind === "tool") {
                    last.result = e.content;
                    last.isError = e.is_error;
                  }
                }
              }
            } else if (typeof content === "string") {
              restored.push({ kind: "assistant", text: content });
            }
          }
        }
        if (!cancelled) {
          setItems(restored);
          if (lastSessionId) setClaudeSessionId(lastSessionId);
        }
      } catch {
        /* ignore load errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sandboxId]);

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
        if (d.error === "stale_session") {
          setStaleSession(true);
          setItems((prev) => [
            ...prev,
            { kind: "notice", text: "Your session key is missing the sandbox permission." },
          ]);
          return;
        }
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
          case "usage":
            setUsageState({
              input: ev.input_tokens,
              output: ev.output_tokens,
              cost: ev.cost_usd,
            });
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

  const filteredModels = useMemo(
    () => models.filter((m) => m.id.toLowerCase().includes(modelFilter.toLowerCase())),
    [models, modelFilter],
  );

  // slash command detection while typing
  const slashCmd = useMemo(() => lookupSlash(input), [input]);

  function selectSlash(cmd: SlashCommand) {
    setInput(cmd.name + " ");
    setSlashOpen(false);
    inputRef.current?.focus();
  }

  async function doUpload() {
    if (uploadFiles.length === 0) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const form = new FormData();
      for (const f of uploadFiles) form.append("files", f);
      form.append("target", uploadTarget);
      const res = await fetch(`/api/sandboxes/${sandboxId}/upload`, {
        method: "POST",
        body: form,
      });
      const d = await res.json();
      if (!res.ok) {
        setUploadMsg(d.message ?? d.error ?? "upload failed");
      } else {
        const parts: string[] = [];
        if (d.skills?.length) parts.push(`${d.skills.length} skill(s) installed`);
        if (d.written?.length) parts.push(`${d.written.length} file(s) written`);
        if (d.errors?.length) parts.push(`${d.errors.length} failed: ${d.errors.join("; ")}`);
        setUploadMsg(parts.join(" · ") || "uploaded");
        setUploadFiles([]);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      {/* header */}
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-white/70 px-4 py-2.5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--foreground)]"
            title="Back to sandboxes"
          >
            ←
          </button>
          <span className="font-serif text-lg">⌾</span>
          <span className="truncate font-mono text-xs text-[var(--muted)]">
            {sandboxId.slice(0, 16)}…
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] ${
              sandboxState === "running"
                ? "bg-orange-100 text-orange-800"
                : sandboxState === "gone"
                  ? "bg-red-100 text-red-700"
                  : "bg-[var(--panel)] text-[var(--muted)]"
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
              className="flex max-w-[220px] items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--foreground)] hover:border-[var(--accent)]"
            >
              <span className="truncate font-mono">{model}</span>
              <span className="shrink-0 text-[var(--muted)]">▾</span>
            </button>
            {modelOpen && (
              <div className="absolute right-0 z-20 mt-1 w-[420px] animate-fade-up rounded-xl border border-[var(--border)] bg-white shadow-2xl">
                <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
                  <span className="text-xs text-[var(--muted)]">🔍</span>
                  <input
                    autoFocus
                    value={modelFilter}
                    onChange={(e) => setModelFilter(e.target.value)}
                    placeholder="Search models…"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
                  />
                </div>
                <div className="flex border-b border-[var(--border)] p-1 text-[11px]">
                  {[
                    { key: "all", label: "All" },
                    { key: "free", label: "Free" },
                    { key: "community", label: "Community" },
                  ].map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setModelFilter(f.key === "all" ? "" : f.key)}
                      className={`rounded-md px-2.5 py-1 ${
                        (f.key === "all" && !modelFilter) ||
                        (f.key === "free" && modelFilter === "free") ||
                        (f.key === "community" && modelFilter === "community")
                          ? "bg-[var(--panel)] text-[var(--accent)]"
                          : "text-[var(--muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <ul className="max-h-[320px] overflow-y-auto p-1">
                  {(modelFilter === "free" || modelFilter === "community"
                    ? filteredModels.filter((m) =>
                        modelFilter === "free" ? !m.paid_only : m.community,
                      )
                    : filteredModels
                  )
                    .slice(0, 80)
                    .map((m) => (
                      <li key={m.id}>
                        <button
                          onClick={() => {
                            setModel(m.id);
                            setModelOpen(false);
                            setModelFilter("");
                          }}
                          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-[var(--panel)] ${
                            m.id === model ? "text-[var(--accent)]" : "text-[var(--foreground)]"
                          }`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-mono">{m.id}</span>
                            <span className="block truncate text-[10px] text-[var(--muted)]">
                              {m.title ?? m.publisher ?? ""}
                            </span>
                          </span>
                          <span className="flex shrink-0 gap-1">
                            {m.community && (
                              <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[9px] text-purple-700">
                                community
                              </span>
                            )}
                            {m.paid_only ? (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] text-amber-700">
                                paid
                              </span>
                            ) : (
                              <span className="rounded bg-green-100 px-1.5 py-0.5 text-[9px] text-green-700">
                                free
                              </span>
                            )}
                            {m.reasoning && (
                              <span className="rounded bg-[var(--panel)] px-1.5 py-0.5 text-[9px] text-[var(--muted)]">
                                reasoning
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  {filteredModels.length === 0 && (
                    <li className="px-3 py-3 text-xs text-[var(--muted)]">No models match</li>
                  )}
                </ul>
              </div>
            )}
          </div>

          {/* upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--foreground)] hover:border-[var(--accent)]"
            title="Upload files or skills (.skill, SKILL.md, any file)"
          >
            <span>⬆</span>
            <span className="hidden sm:inline">Upload</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) {
                setUploadFiles(files);
                setUploadOpen(true);
              }
              e.target.value = "";
            }}
          />

          {/* tabs */}
          <div className="flex rounded-lg border border-[var(--border)] p-0.5 text-xs">
            {(["chat", "terminal"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1.5 ${
                  tab === t
                    ? "bg-[var(--foreground)] text-[var(--background)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {t === "chat" ? "Chat" : "Terminal"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {staleSession && (
        <div className="flex flex-col items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-5 text-center">
          <p className="text-sm text-amber-800">
            Your session key is missing the sandbox permission (added after you signed in).
          </p>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.push("/api/auth/login");
            }}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
          >
            Sign in again to refresh
          </button>
        </div>
      )}

      {uploadOpen && (
        <div className="border-b border-[var(--border)] bg-[var(--panel)] px-4 py-3">
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">
                {uploadFiles.length} file(s) — upload
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setUploadOpen(false);
                    setUploadFiles([]);
                    setUploadMsg(null);
                  }}
                  className="rounded-md px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-white"
                >
                  Cancel
                </button>
                <button
                  onClick={doUpload}
                  disabled={uploading}
                  className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
                >
                  {uploading ? "Uploading…" : "Upload"}
                </button>
              </div>
            </div>

            {/* per-file destination preview */}
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {uploadFiles.map((f, i) => {
                const isSkill = f.name.endsWith(".skill") || /^SKILL\.md$/i.test(f.name);
                const loc = isSkill
                  ? `~/.claude/skills/${f.name.replace(/\.(skill|tgz|tar\.gz|tar)$/, "") || f.name}/`
                  : `${uploadTarget === "/home/user" ? "~" : uploadTarget}/${f.name}`;
                return (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-1.5 text-xs">
                    <span className="truncate font-mono">{f.name} <span className="text-[var(--muted)]">({(f.size / 1024).toFixed(1)} KB)</span></span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${isSkill ? "bg-purple-100 text-purple-700" : "bg-[var(--panel)] text-[var(--muted)]"}`}>
                      {isSkill ? "skill" : "file"}
                    </span>
                    <span className="shrink-0 truncate text-[10px] text-[var(--muted)]">{loc}</span>
                  </li>
                );
              })}
            </ul>

            {/* target dir for regular files */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[var(--muted)]">Files go to:</span>
              <input
                value={uploadTarget}
                onChange={(e) => setUploadTarget(e.target.value)}
                className="flex-1 rounded-md border border-[var(--border)] bg-white px-2 py-1 font-mono text-xs outline-none focus:border-[var(--accent)]"
                placeholder="/home/user"
              />
            </div>

            {uploadMsg && <p className="text-xs text-[var(--accent)]">{uploadMsg}</p>}
          </div>
        </div>
      )}

      {sandboxState === "gone" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--muted)]">
          <p>This sandbox no longer exists.</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
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
            <div className="mx-auto max-w-3xl px-5 py-7">
              {items.length === 0 && (
                <div className="mt-20 text-center">
                  <p className="font-serif text-4xl text-[var(--accent)]">⌾</p>
                  <p className="mt-4 font-serif text-xl text-[var(--foreground)]">
                    Claude Code Cloud
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--muted)]">
                    Claude Code runs in your sandbox. Ask it to build, fix, or explore
                    anything — it has a shell, filesystem, and your chosen model.
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[11px]">
                    {SLASH_COMMANDS.slice(0, 8).map((c) => (
                      <button
                        key={c.name}
                        onClick={() => selectSlash(c)}
                        className="rounded-full border border-[var(--border)] px-3 py-1 font-mono text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {items.map((item, i) => (
                <Bubble key={i} item={item} />
              ))}
              {busy && (
                <div className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
                  <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-[var(--accent)]" />
                  Claude Code is working…
                </div>
              )}
            </div>
          </div>

          {/* composer */}
          <div className="border-t border-[var(--border)] bg-white/80 px-4 py-3 backdrop-blur">
            <div className="mx-auto max-w-3xl">
              {slashOpen && (
                <div className="mb-2 max-h-56 overflow-y-auto rounded-xl border border-[var(--border)] bg-white shadow-xl">
                  {SLASH_COMMANDS.filter((c) =>
                    c.name.toLowerCase().includes(input.toLowerCase().replace("/", "")),
                  ).map((c) => (
                    <button
                      key={c.name}
                      onClick={() => selectSlash(c)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs hover:bg-[var(--panel)]"
                    >
                      <span className="font-mono text-[var(--accent)]">{c.name}</span>
                      <span className="truncate text-[var(--muted)]">{c.description}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <button
                  onClick={() => setSlashOpen((o) => !o)}
                  className="mb-1 rounded-lg px-2 py-1 font-mono text-sm text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--accent)]"
                  title="Slash commands"
                >
                  /
                </button>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    if (input.trim().startsWith("/")) setSlashOpen(true);
                    else setSlashOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                    if (e.key === "Escape") setSlashOpen(false);
                  }}
                  placeholder={
                    busy
                      ? "Claude Code is working…"
                      : slashCmd
                        ? `${slashCmd.name} ${slashCmd.needsArg ? "…" : ""}`
                        : "Ask Claude Code to build something…"
                  }
                  rows={1}
                  disabled={busy}
                  className="max-h-40 flex-1 resize-none rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] disabled:opacity-50"
                />
                <button
                  onClick={send}
                  disabled={!input.trim() || busy}
                  className="rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-40"
                >
                  {busy ? "Working…" : "Send"}
                </button>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--muted)]">
                <span>Enter to send · Shift+Enter for newline</span>
                {usageState && (
                  <span className="flex items-center gap-3">
                    {usageState.input !== undefined && (
                      <span>{usageState.input.toLocaleString()} in</span>
                    )}
                    {usageState.output !== undefined && (
                      <span>{usageState.output.toLocaleString()} out</span>
                    )}
                    {usageState.cost !== undefined && (
                      <span className="text-[var(--accent)]">${usageState.cost.toFixed(4)}</span>
                    )}
                  </span>
                )}
              </div>
            </div>
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
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--user-bubble)] px-4 py-2.5 text-sm text-white">
          {item.text}
        </div>
      </div>
    );
  }
  if (item.kind === "assistant") {
    return (
      <div className="md mt-4 max-w-[92%] text-[14px] text-[var(--foreground)]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
      </div>
    );
  }
  if (item.kind === "thinking") {
    return (
      <details className="mt-3 max-w-[92%] text-xs text-[var(--muted)]">
        <summary className="cursor-pointer select-none text-[var(--muted)]">
          💭 thinking
        </summary>
        <div className="mt-1.5 whitespace-pre-wrap border-l-2 border-[var(--border)] pl-3">
          {item.text}
        </div>
      </details>
    );
  }
  if (item.kind === "tool") {
    const inputStr = JSON.stringify(item.input, null, 2);
    return (
      <details className="mt-3 max-w-[92%] overflow-hidden rounded-xl border border-[var(--border)] text-xs">
        <summary className="cursor-pointer select-none bg-[var(--panel)] px-3 py-2 text-[var(--foreground)]">
          <span className="font-mono text-[var(--accent)]">⚙ {item.name}</span>
          {item.isError && <span className="ml-2 text-red-600">error</span>}
        </summary>
        <div className="bg-white px-3 py-2">
          <pre className="overflow-x-auto text-[var(--muted)]">{inputStr}</pre>
          {item.result && (
            <pre
              className={`mt-2 max-h-60 overflow-auto border-t border-[var(--border)] pt-2 ${
                item.isError ? "text-red-600" : "text-[var(--muted)]"
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
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
      {item.text}
    </div>
  );
}

function TerminalView({ sandboxId }: { sandboxId: string }) {
  const [lines, setLines] = useState<string[]>(["Remote shell in your sandbox."]);
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
    <div className="flex flex-1 flex-col bg-[#1f1e1c] p-4 font-mono text-xs">
      <div className="flex-1 overflow-y-auto rounded-xl border border-[var(--border)] bg-black/30 p-3">
        {lines.map((l, i) => (
          <pre key={i} className="whitespace-pre-wrap text-zinc-200">
            {l}
          </pre>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="mt-2 flex gap-2 text-zinc-200">
        <span className="py-2 text-emerald-400">$</span>
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="ls -la"
          disabled={running}
          className="flex-1 bg-transparent py-2 outline-none placeholder:text-zinc-600"
          autoFocus
        />
      </div>
    </div>
  );
}
