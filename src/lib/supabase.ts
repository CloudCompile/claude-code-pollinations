import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

export function supabaseAdmin() {
  const e = env();
  return createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const TOOL_OUTPUT_LIMIT = 8000;

export function truncateToolOutput(s: string): string {
  if (s.length <= TOOL_OUTPUT_LIMIT) return s;
  return s.slice(0, TOOL_OUTPUT_LIMIT) + "\n...[truncated]";
}