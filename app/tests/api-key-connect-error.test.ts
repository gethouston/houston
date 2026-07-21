import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { apiKeyConnectReason } from "../src/lib/api-key-connect-error.ts";

// The two adapter error shapes the connect dialog can catch: the cloud control
// plane throws with a PARSED JSON body (HoustonEngineError), the local
// runtime-client with the RAW response text (EngineError). Both must yield the
// engine's typed reason; anything else must yield null (generic copy).

const cloudError = (body: unknown) => Object.assign(new Error("x"), { body });
const localError = (text: string) =>
  Object.assign(new Error("x"), { body: text });

describe("apiKeyConnectReason", () => {
  it("reads the reason off a parsed cloud error body", () => {
    strictEqual(
      apiKeyConnectReason(
        cloudError({ error: "blocked", reason: "key_restricted" }),
      ),
      "key_restricted",
    );
  });

  it("reads the reason out of a raw local error body", () => {
    strictEqual(
      apiKeyConnectReason(
        localError('{"error":"rejected","reason":"invalid_key"}'),
      ),
      "invalid_key",
    );
    strictEqual(
      apiKeyConnectReason(
        localError('{"error":"down","reason":"provider_unavailable"}'),
      ),
      "provider_unavailable",
    );
  });

  it("yields null when no reason rode along", () => {
    strictEqual(apiKeyConnectReason(cloudError({ error: "nope" })), null);
    strictEqual(apiKeyConnectReason(localError('{"error":"nope"}')), null);
  });

  it("yields null for unknown reasons, non-JSON bodies, and non-errors", () => {
    strictEqual(
      apiKeyConnectReason(cloudError({ reason: "made_up_reason" })),
      null,
    );
    strictEqual(apiKeyConnectReason(localError("Bad Gateway")), null);
    strictEqual(apiKeyConnectReason(new Error("plain")), null);
    strictEqual(apiKeyConnectReason(undefined), null);
    strictEqual(apiKeyConnectReason("string error"), null);
  });
});
