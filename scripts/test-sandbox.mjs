// Manual sandbox smoke test. Requires env vars and a valid sk_ key.
// Usage: SK=sk_... node scripts/test-sandbox.mjs
import process from "node:process";

const sk = process.env.SK;
const base = process.env.E2B_API_URL ?? "https://gen.pollinations.ai/alpha/e2b";
const templateId = process.env.E2B_TEMPLATE_ID;
if (!sk || !templateId) {
  console.error("Set SK and E2B_TEMPLATE_ID");
  process.exit(1);
}

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", "X-API-Key": sk, Authorization: `Bearer ${sk}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  console.log(method, path, res.status, text.slice(0, 500));
  return res.ok ? (text ? JSON.parse(text) : null) : null;
}

const created = await call("POST", "/v2/sandboxes", {
  templateID: templateId,
  timeout: 120,
  metadata: { pollinations_sub: "manual-test" },
});
if (!created) process.exit(1);
const id = created.sandboxID ?? created.id ?? created.sandboxId;
console.log("created", id);

await call("GET", `/v2/sandboxes/${id}`);
await call("POST", `/v2/sandboxes/${id}/pause`);
await call("POST", `/v2/sandboxes/${id}/resume`, { timeout: 120 });
await call("DELETE", `/v2/sandboxes/${id}`);
console.log("done");