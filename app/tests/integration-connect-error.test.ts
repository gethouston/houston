import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  isUnconnectableToolkitError,
  TOOLKIT_OAUTH_UNMANAGED,
} from "../src/lib/integration-connect-error.ts";

describe("unconnectable-toolkit classifier (HOU-1116)", () => {
  it("matches a structured top-level code", () => {
    strictEqual(
      isUnconnectableToolkitError({ code: TOOLKIT_OAUTH_UNMANAGED }),
      true,
    );
  });

  it("matches a parsed JSON body carrying the code", () => {
    strictEqual(
      isUnconnectableToolkitError({
        status: 400,
        body: {
          error: "composio: toolkit 'twitter'…",
          code: TOOLKIT_OAUTH_UNMANAGED,
        },
      }),
      true,
    );
  });

  it("matches an EngineError whose body is the host's raw JSON string", () => {
    // packages/runtime-client EngineError keeps the response text verbatim.
    strictEqual(
      isUnconnectableToolkitError({
        status: 400,
        body: '{"error":"composio: toolkit \'twitter\' only offers OAuth…","code":"toolkit_oauth_unmanaged"}',
        message:
          'engine request failed (400): {"error":"…","code":"toolkit_oauth_unmanaged"}',
      }),
      true,
    );
  });

  it("matches the cloud gateway's re-wrapped detail (message only)", () => {
    // The prod shape from the HOU-1116 Sentry event: the gateway folds the
    // engine body into a `detail` string, so only the message carries the code.
    strictEqual(
      isUnconnectableToolkitError(
        new Error(
          'engine request failed (400): {"detail":"{\\"error\\":\\"composio: toolkit \\\\\\"twitter\\\\\\"…\\",\\"code\\":\\"toolkit_oauth_unmanaged\\"}","error":"integrations route failed"}',
        ),
      ),
      true,
    );
  });

  it("rejects other coded rejections and plain failures", () => {
    strictEqual(
      isUnconnectableToolkitError({
        status: 400,
        body: { code: "toolkit_no_auth" },
      }),
      false,
    );
    strictEqual(isUnconnectableToolkitError(new Error("network down")), false);
    strictEqual(isUnconnectableToolkitError(null), false);
    strictEqual(isUnconnectableToolkitError(undefined), false);
    strictEqual(isUnconnectableToolkitError("boom"), false);
  });
});
