import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { isNetworkTransportError } from "../src/lib/network-transport-error.ts";

// HOU-1085: the surfacing-layer classifier that keeps connectivity drops out
// of the red bug-toast + Sentry pipeline. It must catch every browser engine's
// fetch transport message, and must NEVER catch a coding-bug TypeError — a
// false positive here silently drops a real bug report.
describe("isNetworkTransportError", () => {
  it("matches WebKit's transport failures, with and without the host suffix", () => {
    strictEqual(isNetworkTransportError(new TypeError("Load failed")), true);
    strictEqual(
      isNetworkTransportError(
        new TypeError("Load failed (gateway.gethouston.ai)"),
      ),
      true,
    );
    strictEqual(
      isNetworkTransportError(
        new TypeError("The network connection was lost."),
      ),
      true,
    );
    strictEqual(
      isNetworkTransportError(
        new TypeError("The Internet connection appears to be offline."),
      ),
      true,
    );
    strictEqual(
      isNetworkTransportError(
        new TypeError(
          "A server with the specified hostname could not be found.",
        ),
      ),
      true,
    );
    strictEqual(
      isNetworkTransportError(
        new TypeError("Could not connect to the server."),
      ),
      true,
    );
    strictEqual(
      isNetworkTransportError(new TypeError("The request timed out.")),
      true,
    );
  });

  it("matches Chromium, Firefox and undici transport failures", () => {
    strictEqual(
      isNetworkTransportError(new TypeError("Failed to fetch")),
      true,
    );
    strictEqual(
      isNetworkTransportError(
        new TypeError("NetworkError when attempting to fetch resource."),
      ),
      true,
    );
    strictEqual(isNetworkTransportError(new TypeError("fetch failed")), true);
  });

  it("matches the adapter's synthetic transient-session-refresh failure (HOU-1106)", () => {
    // packages/web/src/engine-adapter/session-refresh.ts mints exactly this
    // message when the token refresh loses to a settling reconnect. If the
    // classifier stops matching it, that failure regresses to a red bug toast
    // + Sentry report — keep the two in lockstep.
    strictEqual(
      isNetworkTransportError(new TypeError("Load failed (session refresh)")),
      true,
    );
  });

  it("never matches a coding-bug TypeError", () => {
    strictEqual(
      isNetworkTransportError(new TypeError("undefined is not a function")),
      false,
    );
    strictEqual(
      isNetworkTransportError(
        new TypeError("Cannot read properties of undefined"),
      ),
      false,
    );
  });

  it("requires the TypeError shape — same message on other errors stays a bug", () => {
    strictEqual(isNetworkTransportError(new Error("Load failed")), false);
    strictEqual(isNetworkTransportError("Load failed"), false);
    strictEqual(isNetworkTransportError({ status: 503 }), false);
    strictEqual(isNetworkTransportError(null), false);
    strictEqual(isNetworkTransportError(undefined), false);
  });
});
