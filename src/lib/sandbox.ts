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
    const data = (await req({ apiKey }, "POST", "/v2/sandboxes", {
      templateID: templateId,
      timeout,
      metadata: { pollinations_sub: sub },
      envVars: {
        ANTHROPIC_BASE_URL: "https://gen.pollinations.ai",
        ANTHROPIC_AUTH_TOKEN: apiKey,
        ANTHROPIC_MODEL: model,
      },
    })) as Record<string, unknown> | null;
    const info: SandboxInfo = {
      sandboxId: (data?.sandboxID ?? data?.id ?? data?.sandboxId) as string,
      templateId: (data?.templateID ?? templateId) as string,
      state: data?.state as string | undefined,
      metadata: data?.metadata as Record<string, string> | undefined,
      startedAt: data?.startedAt as string | undefined,
      endAt: data?.endAt as string | undefined,
    };
    return info;
  },
  async list({ apiKey, sub }) {
    const data = (await req({ apiKey }, "GET", "/v2/sandboxes")) as
      | Record<string, unknown>
      | unknown[];
    const arr = Array.isArray(data) ? data : ((data as Record<string, unknown>)?.sandboxes as unknown[]) ?? [];
    return arr
      .map((d: unknown) => {
        const o = (d ?? {}) as Record<string, unknown>;
        return {
          sandboxId: (o.sandboxID ?? o.id ?? o.sandboxId) as string,
          templateId: o.templateID as string | undefined,
          state: o.state as string | undefined,
          metadata: o.metadata as Record<string, string> | undefined,
          startedAt: o.startedAt as string | undefined,
          endAt: o.endAt as string | undefined,
        };
      })
      .filter((s: SandboxInfo) => s.metadata?.pollinations_sub === sub);
  },
  async get({ apiKey, id }) {
    const data = (await req({ apiKey }, "GET", `/v2/sandboxes/${id}`)) as Record<string, unknown> | null;
    return {
      sandboxId: (data?.sandboxID ?? data?.id ?? id) as string,
      templateId: data?.templateID as string | undefined,
      state: data?.state as string | undefined,
      metadata: data?.metadata as Record<string, string> | undefined,
      startedAt: data?.startedAt as string | undefined,
      endAt: data?.endAt as string | undefined,
    };
  },
  async pause({ apiKey, id }) {
    await req({ apiKey }, "POST", `/v2/sandboxes/${id}/pause`);
  },
  async resume({ apiKey, id, timeout = 300 }) {
    const data = (await req({ apiKey }, "POST", `/v2/sandboxes/${id}/resume`, {
      timeout,
    })) as Record<string, unknown> | null;
    return {
      sandboxId: (data?.sandboxID ?? data?.id ?? id) as string,
      templateId: data?.templateID as string | undefined,
      state: data?.state as string | undefined,
      metadata: data?.metadata as Record<string, string> | undefined,
      startedAt: data?.startedAt as string | undefined,
      endAt: data?.endAt as string | undefined,
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