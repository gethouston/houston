import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { isIntegrationConnectionGoneError } from "../src/lib/integration-connection-gone.ts";

describe("isIntegrationConnectionGoneError", () => {
  it("matches the host's 404 on the connection read", () => {
    const err = Object.assign(new Error("connection not found"), {
      status: 404,
    });
    strictEqual(isIntegrationConnectionGoneError(err), true);
  });

  it("stays loud for every other status and shape", () => {
    strictEqual(
      isIntegrationConnectionGoneError(
        Object.assign(new Error("upstream"), { status: 502 }),
      ),
      false,
    );
    strictEqual(
      isIntegrationConnectionGoneError(
        Object.assign(new Error("gone"), { status: "404" }),
      ),
      false,
    );
    strictEqual(isIntegrationConnectionGoneError(new Error("x")), false);
    strictEqual(isIntegrationConnectionGoneError("404"), false);
    strictEqual(isIntegrationConnectionGoneError(null), false);
  });
});
