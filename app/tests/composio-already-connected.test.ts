import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  COMPOSIO_ALREADY_CONNECTED_KIND,
  isAlreadyConnectedError,
} from "../src/lib/composio-already-connected.ts";

describe("composio already-connected classifier (HOU-463)", () => {
  it("matches the stable engine error kind", () => {
    // Mirrors StartLinkError::AlreadyConnected -> kind
    // "composio_already_connected" in
    // engine/houston-engine-server/src/routes/composio.rs.
    strictEqual(COMPOSIO_ALREADY_CONNECTED_KIND, "composio_already_connected");
  });

  it("recognizes a plain { kind } error body", () => {
    strictEqual(
      isAlreadyConnectedError({ kind: "composio_already_connected" }),
      true,
    );
  });

  it("recognizes an error exposing kind via a getter (HoustonEngineError shape)", () => {
    const err = new Error("gmail is already connected. Disconnect it first...");
    Object.defineProperty(err, "kind", {
      get: () => "composio_already_connected",
    });
    strictEqual(isAlreadyConnectedError(err), true);
  });

  it("does NOT match other engine error kinds (they still bug-toast + report)", () => {
    strictEqual(isAlreadyConnectedError({ kind: "internal" }), false);
    strictEqual(isAlreadyConnectedError({ kind: "composio_login_timeout" }), false);
    strictEqual(isAlreadyConnectedError({ kind: "rate_limited" }), false);
  });

  it("does NOT match untyped errors — a real connect failure must keep surfacing", () => {
    strictEqual(isAlreadyConnectedError(new Error("boom")), false);
    strictEqual(isAlreadyConnectedError("is already connected"), false);
    strictEqual(isAlreadyConnectedError(null), false);
    strictEqual(isAlreadyConnectedError(undefined), false);
    strictEqual(isAlreadyConnectedError({ message: "no kind here" }), false);
  });
});
