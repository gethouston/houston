import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type EffectiveAccess,
  effectiveAccess,
} from "../src/components/integrations/effective-access.ts";

const conn = (toolkit: string) => ({ toolkit });

const access = (input: {
  toolkit: string;
  connections?: { toolkit: string }[];
  allowlist?: string[] | null;
}): EffectiveAccess =>
  effectiveAccess({
    toolkit: input.toolkit,
    connections: input.connections ?? [],
    allowlist: input.allowlist ?? null,
  });

describe("effectiveAccess", () => {
  it("usable: connected, inside the allowlist", () => {
    deepStrictEqual(
      access({
        toolkit: "slack",
        connections: [conn("slack")],
        allowlist: ["slack"],
      }),
      { state: "usable" },
    );
  });

  it("usable: null allowlist (unrestricted) is not blocked", () => {
    deepStrictEqual(
      access({
        toolkit: "slack",
        connections: [conn("slack")],
        allowlist: null,
      }),
      { state: "usable" },
    );
  });

  it("notConnected: no connection for the toolkit", () => {
    deepStrictEqual(
      access({ toolkit: "slack", connections: [conn("gmail")] }),
      { state: "notConnected" },
    );
  });

  it("blockedByAdmin: connected but outside the allowlist", () => {
    deepStrictEqual(
      access({
        toolkit: "slack",
        connections: [conn("slack")],
        allowlist: ["gmail"],
      }),
      { state: "blockedByAdmin" },
    );
  });

  it("blockedByAdmin: an empty allowlist ([]) blocks everything", () => {
    deepStrictEqual(
      access({
        toolkit: "slack",
        connections: [conn("slack")],
        allowlist: [],
      }),
      { state: "blockedByAdmin" },
    );
  });

  it("precedence: blocked beats notConnected", () => {
    // No connection AND outside the allowlist → the admin reason wins.
    deepStrictEqual(
      access({ toolkit: "slack", connections: [], allowlist: ["gmail"] }),
      { state: "blockedByAdmin" },
    );
  });
});
