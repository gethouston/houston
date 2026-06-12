import { test, expect } from "bun:test";
import { SignJWT } from "jose";
import { DevTokenVerifier, SupabaseTokenVerifier } from "./verify";

const SECRET = "test-shared-secret-which-is-suitably-long-for-hs256";
const ISSUER = "https://proj.supabase.co/auth/v1";

function key(secret = SECRET): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** Mint an HS256 Supabase-style access token. */
async function mintHs256(opts: {
  sub?: string;
  secret?: string;
  issuer?: string;
  expSecondsFromNow?: number;
}): Promise<string> {
  const builder = new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt();
  if (opts.sub !== undefined) builder.setSubject(opts.sub);
  if (opts.issuer) builder.setIssuer(opts.issuer);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (opts.expSecondsFromNow ?? 3600);
  builder.setExpirationTime(exp);
  return builder.sign(key(opts.secret));
}

test("HS256: valid token resolves to its sub as userId", async () => {
  const v = new SupabaseTokenVerifier({ jwtSecret: SECRET, jwksUrl: "", issuer: "" });
  const token = await mintHs256({ sub: "u123" });
  expect(await v.verify(token)).toEqual({ userId: "u123" });
});

test("HS256: accepts a token carrying the 'Bearer ' scheme prefix", async () => {
  const v = new SupabaseTokenVerifier({ jwtSecret: SECRET, jwksUrl: "", issuer: "" });
  const token = await mintHs256({ sub: "u456" });
  expect(await v.verify(`Bearer ${token}`)).toEqual({ userId: "u456" });
});

test("HS256: tampered signature returns null", async () => {
  const v = new SupabaseTokenVerifier({ jwtSecret: SECRET, jwksUrl: "", issuer: "" });
  const token = await mintHs256({ sub: "u123" });
  // Flip the last character of the signature segment.
  const parts = token.split(".");
  const sig = parts[2] ?? "";
  const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
  const tampered = `${parts[0]}.${parts[1]}.${flipped}`;
  expect(await v.verify(tampered)).toBeNull();
});

test("HS256: wrong secret returns null", async () => {
  const v = new SupabaseTokenVerifier({ jwtSecret: SECRET, jwksUrl: "", issuer: "" });
  const token = await mintHs256({ sub: "u123", secret: "a-totally-different-secret-value-xyz" });
  expect(await v.verify(token)).toBeNull();
});

test("HS256: expired token returns null", async () => {
  const v = new SupabaseTokenVerifier({ jwtSecret: SECRET, jwksUrl: "", issuer: "" });
  const token = await mintHs256({ sub: "u123", expSecondsFromNow: -60 });
  expect(await v.verify(token)).toBeNull();
});

test("HS256: malformed token returns null", async () => {
  const v = new SupabaseTokenVerifier({ jwtSecret: SECRET, jwksUrl: "", issuer: "" });
  expect(await v.verify("not-a-jwt")).toBeNull();
  expect(await v.verify("")).toBeNull();
  expect(await v.verify("a.b.c")).toBeNull();
});

test("HS256: token without a sub returns null", async () => {
  const v = new SupabaseTokenVerifier({ jwtSecret: SECRET, jwksUrl: "", issuer: "" });
  const token = await mintHs256({});
  expect(await v.verify(token)).toBeNull();
});

test("HS256: matching issuer passes, mismatched issuer returns null", async () => {
  const v = new SupabaseTokenVerifier({ jwtSecret: SECRET, jwksUrl: "", issuer: ISSUER });
  const good = await mintHs256({ sub: "u789", issuer: ISSUER });
  expect(await v.verify(good)).toEqual({ userId: "u789" });

  const wrongIssuer = await mintHs256({ sub: "u789", issuer: "https://evil.example/auth" });
  expect(await v.verify(wrongIssuer)).toBeNull();

  const noIssuer = await mintHs256({ sub: "u789" });
  expect(await v.verify(noIssuer)).toBeNull();
});

test("SupabaseTokenVerifier with neither secret nor JWKS throws (misconfig, not auth)", () => {
  expect(() => new SupabaseTokenVerifier({ jwtSecret: "", jwksUrl: "", issuer: "" })).toThrow(
    /requires CP_SUPABASE_JWT_SECRET .* or CP_SUPABASE_JWKS_URL/,
  );
});

test("DevTokenVerifier parses 'dev:<userId>'", async () => {
  const v = new DevTokenVerifier();
  expect(await v.verify("dev:u123")).toEqual({ userId: "u123" });
  expect(await v.verify("Bearer dev:u123")).toEqual({ userId: "u123" });
});

test("DevTokenVerifier rejects non-dev and empty-id tokens", async () => {
  const v = new DevTokenVerifier();
  expect(await v.verify("u123")).toBeNull();
  expect(await v.verify("dev:")).toBeNull();
  expect(await v.verify("")).toBeNull();
  expect(await v.verify("bearer:u123")).toBeNull();
});
