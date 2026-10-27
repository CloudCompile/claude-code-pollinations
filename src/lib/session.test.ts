import { describe, it, expect } from "vitest";
import { encryptSession, decryptSession } from "./session";

describe("session encryption round trip", () => {
  it("round trips", () => {
    const s = { sub: "user-123", sk: "sk_secret", expiresAt: Date.now() + 10000 };
    const token = encryptSession(s);
    const out = decryptSession(token);
    expect(out).toEqual(s);
  });

  it("rejects tampered token", () => {
    const s = { sub: "user-123", sk: "sk_secret", expiresAt: Date.now() + 10000 };
    const token = encryptSession(s);
    const tampered = token.slice(0, -4) + "AAAA";
    expect(decryptSession(tampered)).toBeNull();
  });

  it("rejects expired-ish malformed", () => {
    expect(decryptSession("not-base64!!!")).toBeNull();
  });
});