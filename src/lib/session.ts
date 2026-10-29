import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";

export type Session = {
  sub: string;
  sk: string;
  name?: string;
  expiresAt: number; // epoch ms
};

const COOKIE_NAME = "ccp_session";

function keyBytes(): Buffer {
  return createHash("sha256").update(env().KEY_ENCRYPTION_SECRET).digest();
}

export function encryptSession(s: Session): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const plaintext = Buffer.from(JSON.stringify(s), "utf8");
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64url");
}

export function decryptSession(token: string): Session | null {
  try {
    const buf = Buffer.from(token, "base64url");
    if (buf.length < 12 + 16) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", keyBytes(), iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    const parsed = JSON.parse(pt.toString("utf8")) as Session;
    if (!parsed?.sub || !parsed?.sk || !parsed?.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const c = store.get(COOKIE_NAME);
  if (!c?.value) return null;
  const s = decryptSession(c.value);
  if (!s) return null;
  if (Date.now() >= s.expiresAt) return null;
  return s;
}

export async function setSessionCookie(s: Session): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, encryptSession(s), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(s.expiresAt),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export { COOKIE_NAME };