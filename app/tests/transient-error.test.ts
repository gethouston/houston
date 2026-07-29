import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { isTransientPushError } from "../src/lib/claude-push-retry.ts";
import { isTransientEngineError } from "../src/lib/transient-error.ts";

/**
 * The ONE retry classifier. Everything that retries an engine/gateway read
 * (the cross-agent mission sweep, the workspace list, the Claude credential
 * push) must agree on what "worth another attempt" means, or one surface
 * hammers a dead 404 while another gives up on a waking pod.
 */
describe("isTransientEngineError", () => {
  it("retries a 5xx — a pod waking or a gateway rolling", () => {
    strictEqual(isTransientEngineError({ status: 500 }), true);
    strictEqual(isTransientEngineError({ status: 502 }), true);
    strictEqual(isTransientEngineError({ status: 503 }), true);
    strictEqual(isTransientEngineError({ status: 504 }), true);
  });

  it("gives up on a 4xx — auth, not-found and bad-request never heal", () => {
    strictEqual(isTransientEngineError({ status: 400 }), false);
    strictEqual(isTransientEngineError({ status: 401 }), false);
    strictEqual(isTransientEngineError({ status: 403 }), false);
    strictEqual(isTransientEngineError({ status: 404 }), false);
    strictEqual(isTransientEngineError({ status: 429 }), false);
  });

  it("retries a bare network drop (fetch's TypeError, no status)", () => {
    strictEqual(isTransientEngineError(new TypeError("Load failed")), true);
  });

  it("gives up on anything else", () => {
    strictEqual(isTransientEngineError(new Error("boom")), false);
    strictEqual(isTransientEngineError("boom"), false);
    strictEqual(isTransientEngineError(null), false);
    strictEqual(isTransientEngineError(undefined), false);
  });

  it("is the same rule the credential push retries on", () => {
    strictEqual(isTransientPushError, isTransientEngineError);
  });
});
