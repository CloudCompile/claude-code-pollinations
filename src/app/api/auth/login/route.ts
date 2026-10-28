
import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { env } from "@/lib/env";

const AUTH_BASE = "https://enter.pollinations.ai";
// `machines` is in scopes_supported on the discovery document and is required
// for the E2B sandbox proxy. Requesting it here means the user grants it once
// during consent; the issued sk_ key can then create sandboxes directly.
const SCOPES = "profile usage machines";

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function GET(req: Request) {
  const e = env();
  const clientId = e.POLLINATIONS_CLIENT_ID;
  const redirectUri =
    e.POLLINATIONS_REDIRECT_URI ??
    `${new URL(req.url).origin}/api/auth/callback`;

  const state = base64url(randomBytes(24));
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(
    createHash("sha256").update(verifier).digest(),
  );

  const url = new URL(`${AUTH_BASE}/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  const res = NextResponse.redirect(url.toString());
  // store verifier + state in short-lived cookies for callback verification
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
  };
  res.cookies.set("ccp_oauth_state", state, cookieOpts);
  res.cookies.set("ccp_oauth_verifier", verifier, cookieOpts);
  res.cookies.set("ccp_oauth_redirect", redirectUri, cookieOpts);
  return res;
}