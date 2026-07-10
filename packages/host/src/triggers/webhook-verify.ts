import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Composio webhook signature verification (contract C9 #3). The signature is the
 * ONLY thing between the public internet and "run a prompt as any user's agent",
 * so this is deliberately strict: a constant-time compare over a raw-body HMAC
 * with a replay window. Everything here is pure (clock injected) so it is pinned
 * against a hand-computed vector in the tests.
 */

export interface WebhookVerifyInput {
  /** `webhook-id` header. */
  id: string;
  /** `webhook-timestamp` header (Unix SECONDS). */
  timestamp: string;
  /** `webhook-signature` header — base64, optionally Svix `v1,<sig>` space-joined. */
  signature: string;
  /** The exact bytes received, before any JSON parse. */
  rawBody: string;
  secret: string;
  /** Injected clock (ms epoch). Defaults to Date.now(). */
  nowMs?: number;
  /** Replay tolerance (s). Default 300. */
  toleranceSec?: number;
}

export type WebhookVerifyResult = { ok: true } | { ok: false; reason: string };

/**
 * Constant-time equality. The expected base64 length is fixed and public (a
 * SHA-256 digest is always 44 base64 chars), so an early length-mismatch return
 * leaks nothing about the secret — it is timingSafeEqual over equal-length bytes
 * that guards the actual comparison. Mirrors Svix's own verifier.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function verifyComposioWebhook(
  input: WebhookVerifyInput,
): WebhookVerifyResult {
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad timestamp" };
  const nowSec = (input.nowMs ?? Date.now()) / 1000;
  const tolerance = input.toleranceSec ?? 300;
  if (Math.abs(nowSec - ts) > tolerance) {
    return { ok: false, reason: "timestamp outside replay window" };
  }

  const expected = createHmac("sha256", input.secret)
    .update(`${input.id}.${input.timestamp}.${input.rawBody}`)
    .digest("base64");

  // A header may carry one plain base64 signature or several Svix-style
  // `v1,<sig>` tokens (space-separated) — accept a constant-time match on any.
  const candidates = input.signature
    .split(" ")
    .map((t) => (t.startsWith("v1,") ? t.slice(3) : t))
    .filter((t) => t.length > 0);
  for (const candidate of candidates) {
    if (safeEqual(expected, candidate)) return { ok: true };
  }
  return { ok: false, reason: "signature mismatch" };
}
