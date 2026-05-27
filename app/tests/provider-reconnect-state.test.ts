import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  providerAppearsConnected,
  providerIsAuthenticated,
  providerReconnectSignalState,
} from "../src/components/shell/provider-reconnect-state.ts";

describe("provider reconnect signal state", () => {
  it("shows reconnect only for confirmed unauthenticated status", () => {
    strictEqual(
      providerReconnectSignalState({
        cli_installed: true,
        auth_state: "unauthenticated",
      }),
      "needs_auth",
    );
  });

  it("resolves unknown Anthropic status instead of blinking card", () => {
    strictEqual(
      providerReconnectSignalState({
        cli_installed: true,
        auth_state: "unknown",
      }),
      "resolved",
    );
  });

  it("resolves missing CLI status because reconnect cannot fix install state", () => {
    strictEqual(
      providerReconnectSignalState({
        cli_installed: false,
        auth_state: "unauthenticated",
      }),
      "resolved",
    );
  });

  it("treats connected only as installed plus authenticated", () => {
    strictEqual(
      providerIsAuthenticated({
        cli_installed: true,
        auth_state: "authenticated",
      }),
      true,
    );
    strictEqual(
      providerIsAuthenticated({
        cli_installed: false,
        auth_state: "authenticated",
      }),
      false,
    );
  });
});

describe("provider appears connected (settings card)", () => {
  it("treats authenticated as connected", () => {
    strictEqual(
      providerAppearsConnected({ cli_installed: true, auth_state: "authenticated" }),
      true,
    );
  });

  it("treats unknown as connected so a working provider keeps its connected state", () => {
    strictEqual(
      providerAppearsConnected({ cli_installed: true, auth_state: "unknown" }),
      true,
    );
  });

  it("treats confirmed unauthenticated as disconnected", () => {
    strictEqual(
      providerAppearsConnected({ cli_installed: true, auth_state: "unauthenticated" }),
      false,
    );
  });

  it("is never connected when the CLI is missing", () => {
    strictEqual(
      providerAppearsConnected({ cli_installed: false, auth_state: "unknown" }),
      false,
    );
    strictEqual(
      providerAppearsConnected({ cli_installed: false, auth_state: "authenticated" }),
      false,
    );
  });
});
