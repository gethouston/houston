import { createHmac } from "node:crypto";
import { expect, test } from "vitest";
import { verifyComposioWebhook } from "./webhook-verify";

/**
 * The signature check is the ONLY trust boundary for the webhook ingress, so it
 * is pinned against a KNOWN-ANSWER vector (computed once, out of band) as well as
 * the replay-window and mismatch paths.
 */

const SECRET = "whsec_test_secret";
const ID = "msg_2abc";
const TS = "1720000000"; // Unix seconds
const BODY =
  '{"id":"msg_2abc","metadata":{"trigger_id":"ti_gmail_1","trigger_slug":"GMAIL_NEW_GMAIL_MESSAGE","connected_account_id":"ca_1","user_id":"local-owner"},"data":{"subject":"hi"},"timestamp":"1720000000"}';
// base64(HMAC-SHA256("msg_2abc.1720000000.<BODY>", SECRET)), computed by hand.
const KNOWN_SIG = "bdVncFkmQruilB9EPgx7qVJWPIrhHhglLzqsphQaxBk=";

const nowMs = Number(TS) * 1000; // clock pinned to the timestamp

test("accepts the hand-computed known-answer signature", () => {
  const r = verifyComposioWebhook({
    id: ID,
    timestamp: TS,
    signature: KNOWN_SIG,
    rawBody: BODY,
    secret: SECRET,
    nowMs,
  });
  expect(r).toEqual({ ok: true });
});

test("accepts a Svix-style `v1,<sig>` header (space-joined tokens)", () => {
  const r = verifyComposioWebhook({
    id: ID,
    timestamp: TS,
    signature: `v1,${KNOWN_SIG} v1,AAAA`,
    rawBody: BODY,
    secret: SECRET,
    nowMs,
  });
  expect(r.ok).toBe(true);
});

test("rejects a body tampered after signing (signature mismatch)", () => {
  const r = verifyComposioWebhook({
    id: ID,
    timestamp: TS,
    signature: KNOWN_SIG,
    rawBody: `${BODY} `, // one extra byte
    secret: SECRET,
    nowMs,
  });
  expect(r.ok).toBe(false);
});

test("rejects the wrong secret", () => {
  const sig = createHmac("sha256", "other")
    .update(`${ID}.${TS}.${BODY}`)
    .digest("base64");
  const r = verifyComposioWebhook({
    id: ID,
    timestamp: TS,
    signature: sig,
    rawBody: BODY,
    secret: SECRET,
    nowMs,
  });
  expect(r.ok).toBe(false);
});

test("rejects a stale timestamp outside the 300s replay window", () => {
  const r = verifyComposioWebhook({
    id: ID,
    timestamp: TS,
    signature: KNOWN_SIG,
    rawBody: BODY,
    secret: SECRET,
    nowMs: nowMs + 301_000,
  });
  expect(r).toEqual({ ok: false, reason: "timestamp outside replay window" });
});

test("a non-numeric timestamp is rejected before any HMAC work", () => {
  const r = verifyComposioWebhook({
    id: ID,
    timestamp: "not-a-number",
    signature: KNOWN_SIG,
    rawBody: BODY,
    secret: SECRET,
    nowMs,
  });
  expect(r).toEqual({ ok: false, reason: "bad timestamp" });
});
