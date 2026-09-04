import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  classifyCloudEgressRejection,
  cloudEgressBodyKey,
  isCloudEgressBlockedError,
} from "../src/lib/cloud-egress-blocked-error.ts";

// The surfacing-layer classifier that keeps the managed cloud host's
// deliberate "can't reach that address" 400 out of the red bug-toast + Sentry
// pipeline and lets the manual-connect form render rule-specific copy. It must
// key on the host's typed `code`, fall back to the reason throughline for a
// code-less older host, and NEVER match other 400s: a false positive here
// silently drops a real bug report.

const CLOUD_ONLY =
  "Cloud agents can only reach public HTTPS endpoints on port 443.";

/** The shape the engine adapter's `HoustonEngineError` mints. */
function engineError(status: number, body: unknown): Error {
  const reason = (body as { error?: unknown } | null)?.error;
  const err = new Error(
    typeof reason === "string"
      ? `${reason} (engine error ${status})`
      : `engine error ${status}`,
  ) as Error & { status: number; body: unknown };
  err.name = "HoustonEngineError";
  err.status = status;
  err.body = body;
  return err;
}

describe("classifyCloudEgressRejection", () => {
  it("maps each typed host code to its rule", () => {
    for (const [code, rule] of [
      ["endpoint_private_host", "private_host"],
      ["endpoint_not_https", "not_https"],
      ["endpoint_custom_port", "custom_port"],
    ] as const) {
      strictEqual(
        classifyCloudEgressRejection(
          engineError(400, { error: `${CLOUD_ONLY} …`, code }),
        ),
        rule,
      );
    }
  });

  it("classifies a code-less older host by the reason throughline", () => {
    strictEqual(
      classifyCloudEgressRejection(
        engineError(400, {
          error: `${CLOUD_ONLY} Use an https:// address (a tunnel or a directly hosted server).`,
        }),
      ),
      "unspecified",
    );
  });

  it("reads a raw JSON string body (runtime-client EngineError shape)", () => {
    const err = new Error("engine request failed (400)") as Error & {
      status: number;
      body: string;
    };
    err.name = "EngineError";
    err.status = 400;
    err.body = JSON.stringify({
      error: CLOUD_ONLY,
      code: "endpoint_custom_port",
    });
    strictEqual(classifyCloudEgressRejection(err), "custom_port");
  });

  it("ignores an unknown code but keeps the throughline fallback", () => {
    strictEqual(
      classifyCloudEgressRejection(
        engineError(400, { error: `${CLOUD_ONLY} x`, code: "something_else" }),
      ),
      "unspecified",
    );
  });

  it("never matches other 400s, other statuses, or non-errors", () => {
    strictEqual(
      classifyCloudEgressRejection(
        engineError(400, { error: "baseUrl is not a valid URL" }),
      ),
      null,
    );
    strictEqual(
      classifyCloudEgressRejection(
        engineError(400, { error: "missing 'model'" }),
      ),
      null,
    );
    strictEqual(
      classifyCloudEgressRejection(
        engineError(502, {
          error: `${CLOUD_ONLY} x`,
          code: "endpoint_not_https",
        }),
      ),
      null,
    );
    strictEqual(classifyCloudEgressRejection(engineError(400, null)), null);
    strictEqual(classifyCloudEgressRejection(new Error(CLOUD_ONLY)), null);
    strictEqual(classifyCloudEgressRejection("nope"), null);
    strictEqual(isCloudEgressBlockedError(engineError(400, null)), false);
  });

  it("pairs every rule with a providers copy key", () => {
    strictEqual(
      cloudEgressBodyKey("private_host"),
      "openaiCompatible.cloudOnly.privateHost",
    );
    strictEqual(
      cloudEgressBodyKey("not_https"),
      "openaiCompatible.cloudOnly.notHttps",
    );
    strictEqual(
      cloudEgressBodyKey("custom_port"),
      "openaiCompatible.cloudOnly.customPort",
    );
    strictEqual(
      cloudEgressBodyKey("unspecified"),
      "openaiCompatible.cloudOnly.unspecified",
    );
  });
});
