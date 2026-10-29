
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { setSessionCookie } from "@/lib/session";
import { env } from "@/lib/env";

const AUTH_BASE = "https://enter.pollinations.ai";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const store = await cookies();
  const savedState = store.get("ccp_oauth_state")?.value;
  const verifier = store.get("ccp_oauth_verifier")?.value;
  const redirectUri = store.get("ccp_oauth_redirect")?.value;

  // clear oauth cookies
  store.delete("ccp_oauth_state");
  store.delete("ccp_oauth_verifier");
  store.delete("ccp_oauth_redirect");

  if (error) {
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(error)}`, url.origin),
    );
  }
  if (!code || !state || !savedState || state !== savedState || !verifier) {
    return NextResponse.redirect(
      new URL("/?error=invalid_state", url.origin),
    );
  }

  const e = env();
  const clientId = e.POLLINATIONS_CLIENT_ID;
  const finalRedirect = redirectUri ?? `${url.origin}/api/auth/callback`;

  const tokenRes = await fetch(`${AUTH_BASE}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: finalRedirect,
      code_verifier: verifier,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error("token exchange failed", tokenRes.status, text);
    return NextResponse.redirect(
      new URL("/?error=token_exchange_failed", url.origin),
    );
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
  };
  const sk = tokenJson.access_token;
  if (!sk) {
    return NextResponse.redirect(new URL("/?error=no_access_token", url.origin));
  }

  const userRes = await fetch(`${AUTH_BASE}/api/device/userinfo`, {
    headers: { Authorization: `Bearer ${sk}` },
  });
  if (!userRes.ok) {
    console.error("userinfo failed", userRes.status, await userRes.text());
    return NextResponse.redirect(new URL("/?error=userinfo_failed", url.origin));
  }
  const userJson = (await userRes.json()) as { sub?: string; name?: string; email?: string; github_username?: string };
  const sub = userJson.sub;
  if (!sub) {
    return NextResponse.redirect(new URL("/?error=no_sub", url.origin));
  }
  const name = userJson.name ?? userJson.github_username ?? userJson.email ?? undefined;

  // The user's sk_ key may be long-lived ("never expires"), so do NOT tie the
  // session cookie to the token's expires_in (which can be short/missing and
  // cause frequent "logged out" errors). Use a generous, stable lifetime; the
  // key itself is validated lazily on API calls.
  const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  await setSessionCookie({
    sub,
    sk,
    name,
    expiresAt: Date.now() + SESSION_LIFETIME_MS,
  });

  return NextResponse.redirect(new URL("/dashboard", url.origin));
}