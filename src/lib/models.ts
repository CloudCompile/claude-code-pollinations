import { env } from "./env";

const POLLINATIONS_BASE = "https://gen.pollinations.ai";

export type ModelInfo = {
  id: string;
  name?: string;
  description?: string;
  supported_endpoints?: string[];
  input_modalities?: string[];
  output_modalities?: string[];
  reasoning?: boolean;
  preview?: boolean;
  experimental?: boolean;
  [key: string]: unknown;
};

type CacheEntry = { data: ModelInfo[]; expires: number };
const cache = new Map<string, CacheEntry>();
const TTL = 5 * 60 * 1000;

async function fetchModels(path: string): Promise<ModelInfo[]> {
  const cached = cache.get(path);
  if (cached && cached.expires > Date.now()) return cached.data;
  const res = await fetch(`${POLLINATIONS_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`models fetch failed: ${res.status}`);
  const json = await res.json();
  const data = Array.isArray(json) ? json : json?.data ?? json?.models ?? [];
  cache.set(path, { data, expires: Date.now() + TTL });
  return data;
}

export async function getTextModels(): Promise<ModelInfo[]> {
  const a = await fetchModels("/text/models");
  const b = await fetchModels("/v1/models");
  // merge by id
  const map = new Map<string, ModelInfo>();
  for (const m of [...a, ...b]) {
    if (!m?.id) continue;
    const prev = map.get(m.id);
    map.set(m.id, prev ? { ...prev, ...m } : m);
  }
  return [...map.values()];
}

export function supportsEndpoint(m: ModelInfo, endpoint: string): boolean {
  if (!m.supported_endpoints) return true;
  return m.supported_endpoints.includes(endpoint);
}

export type ModelClientRequest = {
  model: string;
  endpoint: string; // e.g. /v1/messages, /v1/chat/completions
  body: unknown;
  apiKey: string;
};

export async function modelClientCall(req: ModelClientRequest): Promise<Response> {
  const url = `${POLLINATIONS_BASE}${req.endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${req.apiKey}`,
    },
    body: JSON.stringify(req.body),
  });
  return res;
}

export function normalizeError(res: Response, text: string): string {
  try {
    const j = JSON.parse(text);
    return j?.error?.message ?? j?.message ?? text;
  } catch {
    return text;
  }
}