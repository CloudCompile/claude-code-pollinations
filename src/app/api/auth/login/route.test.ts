import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("auth login route", () => {
  it("redirects to authorize with PKCE and state", async () => {
    const req = new Request("http://localhost:3000/api/auth/login");
    const res = await GET(req);
    expect(res.status).toBe(307);
    const loc = res.headers.get("location")!;
    const u = new URL(loc);
    expect(u.origin).toBe("https://enter.pollinations.ai");
    expect(u.pathname).toBe("/authorize");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("scope")).toBe("profile usage machines");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBeTruthy();
    expect(u.searchParams.get("state")).toBeTruthy();
    // cookies set
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("ccp_oauth_state");
    expect(setCookie).toContain("ccp_oauth_verifier");
  });
});