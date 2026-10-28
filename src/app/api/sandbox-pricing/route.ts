import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

// Sandbox pricing + available templates/sizes from the Pollinations proxy.
// Cached 5 min in memory — pricing rarely changes.
type TemplateInfo = {
  id: string;
  cpuCount: number;
  memoryMB: number;
  // Pollen per hour, computed from per-second rates.
  pollenPerHour: number;
  provider: "e2b" | "azure";
};

type Pricing = {
  maxRunning: number;
  templates: TemplateInfo[];
};

let cache: { data: Pricing; expires: number } | null = null;
const TTL = 5 * 60 * 1000;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (cache && cache.expires > Date.now()) {
    return NextResponse.json(cache.data);
  }

  const res = await fetch("https://gen.pollinations.ai/alpha/e2b/pricing", {
    headers: { Authorization: `Bearer ${session.sk}` },
    cache: "no-store",
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: "pricing_error", message: `pricing fetch failed: ${res.status}` },
      { status: 502 },
    );
  }
  const raw = (await res.json()) as {
    maxRunning: number;
    vcpuSecond: number;
    gibSecond: number;
    templates: Record<string, { cpuCount: number; memoryMB: number; vcpuSecond?: number; gibSecond?: number }>;
  };

  const templates: TemplateInfo[] = Object.entries(raw.templates ?? {}).map(([id, t]) => {
    const vcpu = t.vcpuSecond ?? raw.vcpuSecond;
    const gib = t.gibSecond ?? raw.gibSecond;
    const pollenPerHour = (vcpu * t.cpuCount + gib * (t.memoryMB / 1024)) * 3600;
    return {
      id,
      cpuCount: t.cpuCount,
      memoryMB: t.memoryMB,
      pollenPerHour: Math.round(pollenPerHour * 1000) / 1000,
      provider: id.includes("azure") ? "azure" : "e2b",
    };
  });
  // sort: smallest first, E2B before Azure at same size
  templates.sort((a, b) => a.cpuCount - b.cpuCount || a.provider.localeCompare(b.provider));

  const data: Pricing = { maxRunning: raw.maxRunning ?? 8, templates };
  cache = { data, expires: Date.now() + TTL };
  return NextResponse.json(data);
}