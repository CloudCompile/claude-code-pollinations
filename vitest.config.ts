import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    env: {
      POLLINATIONS_CLIENT_ID: "pk_test",
      KEY_ENCRYPTION_SECRET: "a".repeat(32),
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      E2B_TEMPLATE_ID: "tmpl_test",
      NODE_ENV: "test",
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});