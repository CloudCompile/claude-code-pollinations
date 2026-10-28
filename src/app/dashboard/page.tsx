"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Sandbox = {
  sandboxId: string;
  templateId?: string;
  state?: string;
  metadata?: Record<string, string>;
  startedAt?: string;
  endAt?: string;
};

type Template = {
  id: string;
  cpuCount: number;
  memoryMB: number;
  pollenPerHour: number;
  provider: "e2b" | "azure";
};

export default function Dashboard() {
  const router = useRouter();
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [chosenSize, setChosenSize] = useState<string>("");

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/sandboxes");
    if (res.status === 401) {
      router.push("/api/auth/login");
      return;
    }
    const data = await res.json();
    if (data.error) setError(data.message ?? data.error);
    setSandboxes(data.sandboxes ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // initial load, guarded against unmount
      const res = await fetch("/api/sandboxes");
      if (cancelled) return;
      if (res.status === 401) {
        router.push("/api/auth/login");
        return;
      }
      const data = await res.json();
      if (!cancelled) {
        if (data.error) setError(data.message ?? data.error);
        setSandboxes(data.sandboxes ?? []);
        setLoading(false);
      }
      // pricing/templates
      const pr = await fetch("/api/sandbox-pricing").catch(() => null);
      if (!cancelled && pr?.ok) {
        const p = await pr.json();
        if (Array.isArray(p.templates)) setTemplates(p.templates);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { timeout: 300 };
      if (chosenSize) body.template = chosenSize;
      const res = await fetch("/api/sandboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? data.error ?? "create failed");
        return;
      }
      router.push(`/dashboard/sandbox/${data.sandbox.sandboxId}`);
    } finally {
      setCreating(false);
    }
  }

  async function action(id: string, verb: "pause" | "resume" | "delete") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/sandboxes/${id}${verb === "delete" ? "" : `/${verb}`}`, {
        method: verb === "delete" ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: verb === "resume" ? JSON.stringify({ timeout: 300 }) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message ?? `${verb} failed`);
        return;
      }
      if (verb === "delete") setSandboxes((s) => s.filter((x) => x.sandboxId !== id));
      else load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-serif text-2xl text-[var(--accent)]">⌾</span>
          <h1 className="font-serif text-xl font-semibold tracking-tight">Claude Code Cloud</h1>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.push("/");
            }}
            className="text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Your sandboxes</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* size picker */}
          <div className="relative">
            <button
              onClick={() => setSizeOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--foreground)] hover:border-[var(--accent)]"
            >
              <span>
                {chosenSize
                  ? (() => {
                      const t = templates.find((x) => x.id === chosenSize);
                      return t ? `${t.cpuCount} vCPU · ${t.memoryMB / 1024} GB` : chosenSize;
                    })()
                  : "Machine size"}
              </span>
              <span className="text-[var(--muted)]">▾</span>
            </button>
            {sizeOpen && (
              <div className="absolute right-0 z-20 mt-1 w-80 animate-fade-up rounded-xl border border-[var(--border)] bg-white shadow-2xl">
                <ul className="max-h-80 overflow-y-auto p-1">
                  {templates.map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => {
                          setChosenSize(t.id);
                          setSizeOpen(false);
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-[var(--panel)] ${
                          chosenSize === t.id ? "text-[var(--accent)]" : "text-[var(--foreground)]"
                        }`}
                      >
                        <span>
                          <span className="block font-medium">
                            {t.cpuCount} vCPU · {t.memoryMB / 1024} GB
                          </span>
                          <span className="block text-[10px] text-[var(--muted)]">
                            {t.provider === "azure" ? "Azure" : "E2B"} · {t.pollenPerHour.toFixed(3)} Pollen/hr
                          </span>
                        </span>
                        <span className="shrink-0 rounded bg-[var(--panel)] px-1.5 py-0.5 text-[9px] text-[var(--muted)]">
                          {t.id.replace("pollinations-", "").replace("pollinations", "standard")}
                        </span>
                      </button>
                    </li>
                  ))}
                  {templates.length === 0 && (
                    <li className="px-3 py-3 text-xs text-[var(--muted)]">Sizes unavailable</li>
                  )}
                </ul>
              </div>
            )}
          </div>

          <button
            onClick={load}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)] hover:border-[var(--accent)]"
          >
            Refresh
          </button>
          <button
            onClick={create}
            disabled={creating}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {creating ? "Creating…" : "New sandbox"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-[var(--muted)]">Loading…</p>
      ) : sandboxes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center text-[var(--muted)]">
          No sandboxes yet. Pick a size and create one to start a Claude Code session.
        </div>
      ) : (
        <ul className="space-y-3">
          {sandboxes.map((s) => {
            const running = s.state === "running";
            const t = templates.find((x) => x.id === s.templateId);
            return (
              <li
                key={s.sandboxId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-white px-5 py-4 shadow-sm"
              >
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/sandbox/${s.sandboxId}`}
                    className="font-mono text-sm text-[var(--accent)] hover:underline"
                  >
                    {s.sandboxId}
                  </Link>
                  <div className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${
                        running ? "bg-orange-100 text-orange-800" : "bg-[var(--panel)] text-[var(--muted)]"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          running ? "bg-orange-500 animate-pulse-dot" : "bg-[var(--muted)]"
                        }`}
                      />
                      {running ? "running" : s.state ?? "unknown"}
                    </span>
                    {t && (
                      <span>
                        {t.cpuCount} vCPU · {t.memoryMB / 1024} GB
                      </span>
                    )}
                    {s.endAt && <span>until {new Date(s.endAt).toLocaleTimeString()}</span>}
                  </div>
                </div>
                <div className="flex gap-2 text-sm">
                  {running ? (
                    <button
                      onClick={() => action(s.sandboxId, "pause")}
                      disabled={busyId === s.sandboxId}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[var(--foreground)] hover:border-[var(--accent)] disabled:opacity-50"
                    >
                      Pause
                    </button>
                  ) : (
                    <button
                      onClick={() => action(s.sandboxId, "resume")}
                      disabled={busyId === s.sandboxId}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[var(--foreground)] hover:border-[var(--accent)] disabled:opacity-50"
                    >
                      Resume
                    </button>
                  )}
                  <button
                    onClick={() => action(s.sandboxId, "delete")}
                    disabled={busyId === s.sandboxId}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                  <Link
                    href={`/dashboard/sandbox/${s.sandboxId}`}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 font-medium text-white hover:bg-[var(--accent-hover)]"
                  >
                    Open
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}