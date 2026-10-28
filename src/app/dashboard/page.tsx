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

export default function Dashboard() {
  const router = useRouter();
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
    load();
  }, [load]);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/sandboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeout: 300 }),
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
          <span className="text-2xl">⌾</span>
          <h1 className="text-xl font-semibold">Claude Code Cloud</h1>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.push("/");
            }}
            className="text-zinc-400 hover:text-zinc-200"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-medium">Your sandboxes</h2>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
          >
            Refresh
          </button>
          <button
            onClick={create}
            disabled={creating}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-50"
          >
            {creating ? "Creating…" : "New sandbox"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : sandboxes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-zinc-500">
          No sandboxes yet. Create one to start a Claude Code session.
        </div>
      ) : (
        <ul className="space-y-3">
          {sandboxes.map((s) => {
            const running = s.state === "running";
            return (
              <li
                key={s.sandboxId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/sandbox/${s.sandboxId}`}
                    className="font-mono text-sm text-blue-400 hover:underline"
                  >
                    {s.sandboxId}
                  </Link>
                  <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${
                        running ? "bg-green-950 text-green-400" : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          running ? "bg-green-400 animate-pulse-dot" : "bg-zinc-500"
                        }`}
                      />
                      {running ? "running" : s.state ?? "unknown"}
                    </span>
                    {s.endAt && <span>until {new Date(s.endAt).toLocaleTimeString()}</span>}
                  </div>
                </div>
                <div className="flex gap-2 text-sm">
                  {running ? (
                    <button
                      onClick={() => action(s.sandboxId, "pause")}
                      disabled={busyId === s.sandboxId}
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      Pause
                    </button>
                  ) : (
                    <button
                      onClick={() => action(s.sandboxId, "resume")}
                      disabled={busyId === s.sandboxId}
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      Resume
                    </button>
                  )}
                  <button
                    onClick={() => action(s.sandboxId, "delete")}
                    disabled={busyId === s.sandboxId}
                    className="rounded-lg border border-red-900 px-3 py-1.5 text-red-400 hover:bg-red-950 disabled:opacity-50"
                  >
                    Delete
                  </button>
                  <Link
                    href={`/dashboard/sandbox/${s.sandboxId}`}
                    className="rounded-lg bg-white px-3 py-1.5 font-medium text-zinc-950 hover:bg-zinc-200"
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