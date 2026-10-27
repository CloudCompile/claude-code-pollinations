import { env } from "./env";

export type SandboxInfo = {
  sandboxId: string;
  templateId?: string;
  state?: string;
  metadata?: Record<string, string>;
  startedAt?: string;
  endAt?: string;
};

export class SandboxError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`sandbox request failed: ${status} ${body}`);
    this.status = status;
    this.body = body;
  }
}

type Ctx = { apiKey: string; apiUrl?: string };

function base(ctx: Ctx): string {
  return (ctx.apiUrl ?? env().E2B_API_URL).replace(/\/$/, "");
}

async function req(ctx: Ctx, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base(ctx)}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": ctx.apiKey,
      Authorization: `Bearer ${ctx.apiKey}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new SandboxError(res.status, text);
  return text ? JSON.parse(text) : null;
}

export interface SandboxProvider {
  create(p: {
    apiKey: string;
    templateId: string;
    timeout: number;
    sub: string;
    model: string;
  }): Promise<SandboxInfo>;
  list(p: { apiKey: string; sub: string }): Promise<SandboxInfo[]>;
  get(p: { apiKey: string; id: string }): Promise<SandboxInfo>;
  pause(p: { apiKey: string; id: string }): Promise<void>;
  resume(p: { apiKey: string; id: string; timeout?: number }): Promise<SandboxInfo>;
  delete(p: { apiKey: string; id: string }): Promise<void>;
  keepAlive(p: { apiKey: string; id: string; timeout: number }): Promise<void>;
  setNetwork(p: { apiKey: string; id: string }): Promise<void>;
}

export const e2bProvider: SandboxProvider = {
  async create({ apiKey, templateId, timeout, sub, model }) {
    const data = await req({ apiKey }, "POST", "/v2/sandboxes", {
      templateID: templateId,
      timeout,
      metadata: { pollinations_sub: sub },
      envVars: {
        ANTHROPIC_BASE_URL: "https://gen.pollinations.ai",
        ANTHROPIC_AUTH_TOKEN: apiKey,
        ANTHROPIC_MODEL: model,
      },
    });
    const info: SandboxInfo = {
      sandboxId: data?.sandboxID ?? data?.id ?? data?.sandboxId,
      templateId: data?.templateID ?? templateId,
      state: data?.state,
      metadata: data?.metadata,
      startedAt: data?.startedAt,
      endAt: data?.endAt,
    };
    return info;
  },
  async list({ apiKey, sub }) {
    const data = await req({ apiKey }, "GET", "/v2/sandboxes");
    const arr = Array.isArray(data) ? data : data?.sandboxes ?? [];
    return arr
      .map((d: any) => ({
        sandboxId: d?.sandboxID ?? d?.id ?? d?.sandboxId,
        templateId: d?.templateID,
        state: d?.state,
        metadata: d?.metadata,
        startedAt: d?.startedAt,
        endAt: d?.endAt,
      }))
      .filter((s: SandboxInfo) => s.metadata?.pollinations_sub === sub);
  },
  async get({ apiKey, id }) {
    const data = await req({ apiKey }, "GET", `/v2/sandboxes/${id}`);
    return {
      sandboxId: data?.sandboxID ?? data?.id ?? id,
      templateId: data?.templateID,
      state: data?.state,
      metadata: data?.metadata,
      startedAt: data?.startedAt,
      endAt: data?.endAt,
    };
  },
  async pause({ apiKey, id }) {
    await req({ apiKey }, "POST", `/v2/sandboxes/${id}/pause`);
  },
  async resume({ apiKey, id, timeout = 300 }) {
    const data = await req({ apiKey }, "POST", `/v2/sandboxes/${id}/resume`, {
      timeout,
    });
    return {
      sandboxId: data?.sandboxID ?? data?.id ?? id,
      templateId: data?.templateID,
      state: data?.state,
      metadata: data?.metadata,
      startedAt: data?.startedAt,
      endAt: data?.endAt,
    };
  },
  async delete({ apiKey, id }) {
    await req({ apiKey }, "DELETE", `/v2/sandboxes/${id}`);
  },
  async keepAlive({ apiKey, id, timeout }) {
    await req({ apiKey }, "POST", `/v2/sandboxes/${id}/timeout`, { timeout });
  },
  async setNetwork({ apiKey, id }) {
    await req({ apiKey }, "PUT", `/v2/sandboxes/${id}/network`, {
      denyOut: ["0.0.0.0/0"],
      allowOut: [
        "gen.pollinations.ai",
        "enter.pollinations.ai",
        "registry.npmjs.org",
        "github.com",
      ],
    });
  },
};