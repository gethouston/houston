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
  grants?: string[] | null;
  allowlist?: string[] | null;
}): EffectiveAccess =>
  effectiveAccess({
    toolkit: input.toolkit,
    connections: input.connections ?? [],
    grants: input.grants ?? null,
    allowlist: input.allowlist ?? null,
  });

describe("effectiveAccess", () => {
  it("usable: connected, granted, inside the allowlist", () => {
    deepStrictEqual(
      access({
        toolkit: "slack",
        connections: [conn("slack")],
        grants: ["slack"],
        allowlist: ["slack"],
      }),
      { state: "usable" },
    );
  });

  it("usable: null grants (unsupported host) counts as granted", () => {
    deepStrictEqual(
      access({ toolkit: "slack", connections: [conn("slack")], grants: null }),
      { state: "usable" },
    );
  });

  it("usable: null allowlist (unrestricted) is not blocked", () => {
    deepStrictEqual(
      access({
        toolkit: "slack",
        connections: [conn("slack")],
        grants: ["slack"],
        allowlist: null,
      }),
      { state: "usable" },
    );
  });

  it("notConnected: no connection for the toolkit", () => {
    deepStrictEqual(
      access({ toolkit: "slack", connections: [conn("gmail")], grants: [] }),
      { state: "notConnected" },
    );
  });

  it("notGrantedToAgent: connected but not in the grant set", () => {
    deepStrictEqual(
      access({
        toolkit: "slack",
        connections: [conn("slack")],
        grants: ["gmail"],
      }),
      { state: "notGrantedToAgent" },
    );
  });

  it("notGrantedToAgent: an empty grant record grants nothing", () => {
    deepStrictEqual(
      access({ toolkit: "slack", connections: [conn("slack")], grants: [] }),
      { state: "notGrantedToAgent" },
    );
  });

  it("blockedByAdmin: connected + granted but outside the allowlist", () => {
    deepStrictEqual(
      access({
        toolkit: "slack",
        connections: [conn("slack")],
        grants: ["slack"],
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
        grants: ["slack"],
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

  it("precedence: blocked beats notGrantedToAgent", () => {
    // Connected, ungranted, AND outside the allowlist → admin reason wins.
    deepStrictEqual(
      access({
        toolkit: "slack",
        connections: [conn("slack")],
        grants: [],
        allowlist: ["gmail"],
      }),
      { state: "blockedByAdmin" },
    );
  });

  it("precedence: notConnected beats notGrantedToAgent", () => {
    // Inside the allowlist, ungranted, but no connection → connection wins.
    deepStrictEqual(
      access({
        toolkit: "slack",
        connections: [],
        grants: [],
        allowlist: ["slack"],
      }),
      { state: "notConnected" },
    );
  });
});
