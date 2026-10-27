import { z } from "zod";

const schema = z.object({
  POLLINATIONS_CLIENT_ID: z.string().min(1, "POLLINATIONS_CLIENT_ID is required"),
  POLLINATIONS_REDIRECT_URI: z.string().url().optional(),
  KEY_ENCRYPTION_SECRET: z
    .string()
    .min(32, "KEY_ENCRYPTION_SECRET must be at least 32 chars"),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  E2B_API_URL: z
    .string()
    .url()
    .default("https://gen.pollinations.ai/alpha/e2b"),
  E2B_SANDBOX_URL: z
    .string()
    .url()
    .default("https://gen.pollinations.ai/alpha/e2b/sandbox"),
  E2B_TEMPLATE_ID: z.string().min(1, "E2B_TEMPLATE_ID is required"),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

// Fail-fast validation happens on first call to env() at runtime.
// We intentionally do not throw at module load so that `next build`
// can collect route handlers without production env vars present.