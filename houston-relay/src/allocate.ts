// Tunnel allocation — first-boot engine POSTs here to get a stable
// {tunnelId, tunnelToken} pair.
//
// tunnelId: 22-char URL-safe random (sufficient for ~128 bits entropy).
// tunnelToken: HMAC-SHA256(tunnelId, TUNNEL_SHARED_SECRET) hex-encoded.
// Validation is stateless — the relay re-computes and constant-time compares.
// That way the DO doesn't need a central allocation record.

import type { AllocateResponse, Env } from "./types";

export async function handleAllocate(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST")
    return new Response("method not allowed", { status: 405 });
  if (!env.TUNNEL_SHARED_SECRET) {
    return Response.json({ error: "relay not configured" }, { status: 500 });
  }

  const tunnelId = generateTunnelId();
  const tunnelToken = await hmacHex(env.TUNNEL_SHARED_SECRET, tunnelId);

  const body: AllocateResponse = {
    tunnelId,
    tunnelToken,
    publicHost: env.RELAY_PUBLIC_HOST,
  };
  return Response.json(body);
}

/** True if the presented token matches HMAC(tunnelId, secret). */
export async function verifyTunnelToken(
  tunnelId: string,
  presented: string,
  secret: string,
): Promise<boolean> {
  const expected = await hmacHex(secret, tunnelId);
  return constantTimeEq(expected, presented);
}

/** Exported for tests: deterministic HMAC computation. */
export async function tunnelTokenFor(
  tunnelId: string,
  secret: string,
): Promise<string> {
  return hmacHex(secret, tunnelId);
}

function generateTunnelId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // base64url — 22 chars, no padding.
  let s = "";
  for (let i = 0; i < bytes.length; i++)
    s += String.fromCharCode(bytes[i] as number);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
