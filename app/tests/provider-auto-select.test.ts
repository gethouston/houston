import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  resolveAutoSelect,
  type StatusSnapshot,
} from "../src/components/provider-browser/auto-select.ts";
import type { ProviderInfo } from "../src/lib/providers.ts";
import type { ProviderStatus } from "../src/lib/tauri.ts";

function provider(id: string, defaultModel = ""): ProviderInfo {
  return { id, name: id, defaultModel } as ProviderInfo;
}

function connected(id: string, activeModel?: string): ProviderStatus {
  return {
    provider: id,
    cli_installed: true,
    auth_state: "authenticated",
    authenticated: true,
    cli_name: "",
    active_model: activeModel,
  };
}

function disconnected(id: string): ProviderStatus {
  return {
    provider: id,
    cli_installed: true,
    auth_state: "unauthenticated",
    authenticated: false,
    cli_name: "",
  };
}

describe("resolveAutoSelect", () => {
  it("fires on a not-connected -> connected transition with the defaultModel", () => {
    const anthropic = provider("anthropic", "claude-sonnet-4-6");
    const prev: StatusSnapshot = { anthropic: disconnected("anthropic") };
    const next: StatusSnapshot = { anthropic: connected("anthropic") };
    deepStrictEqual(
      resolveAutoSelect(prev, next, [anthropic], { selectOnMount: false }),
      {
        providerId: "anthropic",
        model: "claude-sonnet-4-6",
      },
    );
  });

  it("falls back to the engine active_model when the card has no defaultModel", () => {
    const local = provider("openai-compatible"); // no static defaultModel
    const prev: StatusSnapshot = {};
    const next: StatusSnapshot = {
      "openai-compatible": connected("openai-compatible", "llama-3.3-70b"),
    };
    deepStrictEqual(
      resolveAutoSelect(prev, next, [local], { selectOnMount: false }),
      { providerId: "openai-compatible", model: "llama-3.3-70b" },
    );
  });

  it("does not fire for an already-connected provider on first load (selectOnMount=false)", () => {
    const anthropic = provider("anthropic", "claude-sonnet-4-6");
    const next: StatusSnapshot = { anthropic: connected("anthropic") };
    strictEqual(
      resolveAutoSelect(null, next, [anthropic], { selectOnMount: false }),
      null,
    );
  });

  it("fires for an already-connected provider on first load when selectOnMount=true", () => {
    const anthropic = provider("anthropic", "claude-sonnet-4-6");
    const next: StatusSnapshot = { anthropic: connected("anthropic") };
    deepStrictEqual(
      resolveAutoSelect(null, next, [anthropic], { selectOnMount: true }),
      { providerId: "anthropic", model: "claude-sonnet-4-6" },
    );
  });

  it("does not fire when a provider was already connected in the previous snapshot", () => {
    const anthropic = provider("anthropic", "claude-sonnet-4-6");
    const prev: StatusSnapshot = { anthropic: connected("anthropic") };
    const next: StatusSnapshot = { anthropic: connected("anthropic") };
    strictEqual(
      resolveAutoSelect(prev, next, [anthropic], { selectOnMount: false }),
      null,
    );
  });

  it("does not fire when nothing is connected", () => {
    const anthropic = provider("anthropic", "claude-sonnet-4-6");
    const prev: StatusSnapshot = { anthropic: disconnected("anthropic") };
    const next: StatusSnapshot = { anthropic: disconnected("anthropic") };
    strictEqual(
      resolveAutoSelect(prev, next, [anthropic], { selectOnMount: false }),
      null,
    );
  });

  it("skips a transition with no resolvable model (no defaultModel, no active_model)", () => {
    const local = provider("openai-compatible");
    const prev: StatusSnapshot = {
      "openai-compatible": disconnected("openai-compatible"),
    };
    const next: StatusSnapshot = {
      "openai-compatible": connected("openai-compatible"),
    };
    strictEqual(
      resolveAutoSelect(prev, next, [local], { selectOnMount: false }),
      null,
    );
  });

  // The local-connect double-fire guard: the LocalModelDialog hands the typed
  // model to onSelect directly, then patchAuthState commits a connected status
  // WITHOUT active_model (skipped above), and the later loadStatuses reconcile
  // fills active_model in on an ALREADY-connected card. That reconcile must not
  // read as a second transition.
  it("does not fire when the reconcile adds active_model to an already-connected card", () => {
    const local = provider("openai-compatible");
    const prev: StatusSnapshot = {
      "openai-compatible": connected("openai-compatible"),
    };
    const next: StatusSnapshot = {
      "openai-compatible": connected("openai-compatible", "llama3:8b"),
    };
    strictEqual(
      resolveAutoSelect(prev, next, [local], { selectOnMount: false }),
      null,
    );
  });

  // "unknown" = the engine was unreachable (cold pod waking after a
  // relaunch/update). Auto-select needs a CONFIRMED authenticated state: an
  // unknown probe must never advance onboarding as if the provider connected.
  function unknown(id: string): ProviderStatus {
    return {
      provider: id,
      cli_installed: true,
      auth_state: "unknown",
      authenticated: false,
      cli_name: "",
    };
  }

  it("does not fire for an unknown status on first load, even with selectOnMount", () => {
    const anthropic = provider("anthropic", "claude-sonnet-4-6");
    const next: StatusSnapshot = { anthropic: unknown("anthropic") };
    strictEqual(
      resolveAutoSelect(null, next, [anthropic], { selectOnMount: true }),
      null,
    );
  });

  it("does not fire on an unauthenticated -> unknown transition", () => {
    const anthropic = provider("anthropic", "claude-sonnet-4-6");
    const prev: StatusSnapshot = { anthropic: disconnected("anthropic") };
    const next: StatusSnapshot = { anthropic: unknown("anthropic") };
    strictEqual(
      resolveAutoSelect(prev, next, [anthropic], { selectOnMount: false }),
      null,
    );
  });

  it("fires on an unknown -> authenticated transition (engine woke up connected)", () => {
    const anthropic = provider("anthropic", "claude-sonnet-4-6");
    const prev: StatusSnapshot = { anthropic: unknown("anthropic") };
    const next: StatusSnapshot = { anthropic: connected("anthropic") };
    deepStrictEqual(
      resolveAutoSelect(prev, next, [anthropic], { selectOnMount: false }),
      { providerId: "anthropic", model: "claude-sonnet-4-6" },
    );
  });
});
