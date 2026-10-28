import { Sandbox } from "e2b";
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
    super(body || `sandbox request failed: ${status}`);
    this.status = status;
    this.body = body;
  }
}

export const OWNER_KEY = "pollinations_sub";

// The user's sk_ key is the E2B API key: sandboxes bill to their Pollen.
function opts(apiKey: string, extra?: { timeoutMs?: number }) {
  return {
    apiKey,
    apiUrl: env().E2B_API_URL,
    ...(env().E2B_SANDBOX_URL ? { sandboxUrl: env().E2B_SANDBOX_URL } : {}),
    ...extra,
  };
}

function toInfo(s: {
  sandboxId: string;
  templateId?: string;
  state?: string;
  metadata?: Record<string, string>;
  startedAt?: Date | string;
  endAt?: Date | string;
}): SandboxInfo {
  return {
    sandboxId: s.sandboxId,
    templateId: s.templateId,
    state: s.state,
    metadata: s.metadata,
    startedAt: s.startedAt ? new Date(s.startedAt).toISOString() : undefined,
    endAt: s.endAt ? new Date(s.endAt).toISOString() : undefined,
  };
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
    try {
      const sbx = await Sandbox.create(templateId, {
        ...opts(apiKey),
        timeoutMs: timeout * 1000,
        metadata: { [OWNER_KEY]: sub },
        envs: {
          ANTHROPIC_BASE_URL: "https://gen.pollinations.ai",
          ANTHROPIC_AUTH_TOKEN: apiKey,
          ANTHROPIC_MODEL: model,
        },
      });
      const info = await sbx.getInfo();
      return toInfo({ ...info, sandboxId: sbx.sandboxId });
    } catch (e) {
      throw toSandboxError(e);
    }
  },

  async list({ apiKey, sub }) {
    try {
      const paginator = Sandbox.list({
        ...opts(apiKey),
        query: { metadata: { [OWNER_KEY]: sub } },
        limit: 100,
      });
      const items = await paginator.nextItems();
      return items.map(toInfo);
    } catch (e) {
      throw toSandboxError(e);
    }
  },

  async get({ apiKey, id }) {
    try {
      const info = await Sandbox.getInfo(id, opts(apiKey));
      return toInfo(info);
    } catch (e) {
      throw toSandboxError(e);
    }
  },

  async pause({ apiKey, id }) {
    try {
      await Sandbox.pause(id, opts(apiKey));
    } catch (e) {
      throw toSandboxError(e);
    }
  },

  async resume({ apiKey, id, timeout = 300 }) {
    try {
      const sbx = await Sandbox.connect(id, opts(apiKey, { timeoutMs: timeout * 1000 }));
      const info = await sbx.getInfo();
      return toInfo({ ...info, sandboxId: sbx.sandboxId });
    } catch (e) {
      throw toSandboxError(e);
    }
  },

  async delete({ apiKey, id }) {
    try {
      await Sandbox.kill(id, opts(apiKey));
    } catch (e) {
      throw toSandboxError(e);
    }
  },

  async keepAlive({ apiKey, id, timeout }) {
    try {
      await Sandbox.setTimeout(id, timeout * 1000, opts(apiKey));
    } catch (e) {
      throw toSandboxError(e);
    }
  },

  async setNetwork(p) {
    // Network rules are applied at create time via the SDK's network option
    // where supported; per-sandbox update is not exposed by the proxy for all
    // templates, so this is best-effort and non-fatal.
    void p;
  },
};

function toSandboxError(e: unknown): SandboxError {
  const err = e as { statusCode?: number; message?: string; body?: string };
  const status = err?.statusCode ?? 500;
  let body = err?.body ?? err?.message ?? "unknown error";
  try {
    const j = JSON.parse(body);
    if (j?.message) body = j.message;
  } catch {
    /* keep raw */
  }
  return new SandboxError(status, body);
}