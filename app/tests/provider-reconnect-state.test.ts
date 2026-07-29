import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  providerIsAuthenticated,
  providerReconnectSignalState,
  reconnectProviderForChat,
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
});

describe("provider is authenticated (the confirmed-connected predicate)", () => {
  it("treats authenticated as connected", () => {
    strictEqual(
      providerIsAuthenticated({
        cli_installed: true,
        auth_state: "authenticated",
      }),
      true,
    );
  });

  it("treats unknown as NOT connected (HOU-979)", () => {
    // Reversed deliberately. The old `providerAppearsConnected` counted an
    // unconfirmable probe as connected, which is how a team space whose
    // per-agent probe 404'd kept reporting "Connected" in the AI hub while the
    // chat picker showed no providers at all. `unknown` is now `checking`
    // everywhere: never Connected, never silently hidden.
    strictEqual(
      providerIsAuthenticated({ cli_installed: true, auth_state: "unknown" }),
      false,
    );
  });

  it("treats confirmed unauthenticated as disconnected", () => {
    strictEqual(
      providerIsAuthenticated({
        cli_installed: true,
        auth_state: "unauthenticated",
      }),
      false,
    );
  });

  it("is never connected when the CLI is missing", () => {
    strictEqual(
      providerIsAuthenticated({ cli_installed: false, auth_state: "unknown" }),
      false,
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

describe("reconnect provider for a chat (HOU-410 scoping)", () => {
  it("does NOT show a Claude reconnect in an OpenAI chat when Claude is logged out elsewhere", () => {
    // The exact bug: a Claude session (another agent / routine) set the global
    // authRequired to "anthropic"; the user is in an OpenAI chat with no auth
    // problem of its own. The card must stay hidden.
    strictEqual(
      reconnectProviderForChat({
        authRequired: "anthropic",
        chatProvider: "openai",
        signalNeedsAuth: false,
      }),
      null,
    );
  });

  it("shows the chat's own provider when the global flag names it", () => {
    strictEqual(
      reconnectProviderForChat({
        authRequired: "anthropic",
        chatProvider: "anthropic",
        signalNeedsAuth: false,
      }),
      "anthropic",
    );
    strictEqual(
      reconnectProviderForChat({
        authRequired: "openai",
        chatProvider: "openai",
        signalNeedsAuth: false,
      }),
      "openai",
    );
  });

  it("falls back to this chat's own feed signal when the global flag is unset or foreign", () => {
    // No global flag, but this chat's feed carried an auth signal and the
    // status probe confirmed it needs auth.
    strictEqual(
      reconnectProviderForChat({
        authRequired: null,
        chatProvider: "openai",
        signalNeedsAuth: true,
      }),
      "openai",
    );
    // Foreign global flag must not suppress this chat's own confirmed signal.
    strictEqual(
      reconnectProviderForChat({
        authRequired: "anthropic",
        chatProvider: "openai",
        signalNeedsAuth: true,
      }),
      "openai",
    );
  });

  it("shows nothing when neither the flag matches nor the feed signals auth", () => {
    strictEqual(
      reconnectProviderForChat({
        authRequired: null,
        chatProvider: "openai",
        signalNeedsAuth: false,
      }),
      null,
    );
  });

  it("shows nothing when the chat has no resolved provider", () => {
    strictEqual(
      reconnectProviderForChat({
        authRequired: "anthropic",
        chatProvider: null,
        signalNeedsAuth: true,
      }),
      null,
    );
  });
});
