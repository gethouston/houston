import { describe, expect, test } from "bun:test";
import { EngineError } from "@houston/runtime-client";
import { configWriteToSettings } from "./synthetic";
import {
  historyToFeed,
  isNotConnectedError,
  isStoppedByUser,
  turnErrorMessage,
} from "./translate";

test("turnErrorMessage unwraps the engine's plain message from a rejected send", () => {
  // The runtime refuses a not-connected turn with 409 + a JSON body; the user must
  // see the plain sentence, never the status code or the JSON wrapper.
  const err = new EngineError(
    409,
    JSON.stringify({
      error: "No provider connected. Log in with Claude or Codex first.",
    }),
  );
  expect(turnErrorMessage(err)).toBe(
    "No provider connected. Log in with Claude or Codex first.",
  );
});

test("turnErrorMessage falls back to the raw message for a non-JSON engine body", () => {
  const err = new EngineError(500, "upstream exploded");
  expect(turnErrorMessage(err)).toBe(err.message);
});

test("turnErrorMessage handles plain errors and non-errors", () => {
  expect(turnErrorMessage(new Error("boom"))).toBe("boom");
  expect(turnErrorMessage("just a string")).toBe("just a string");
});

test("isNotConnectedError matches every runtime 'no provider connected' variant", () => {
  // Both verbatim messages the runtime raises when the provider is logged out.
  expect(
    isNotConnectedError(
      "No provider connected. Log in with Claude or Codex first.",
    ),
  ).toBe(true);
  expect(
    isNotConnectedError(
      "No provider connected. Connect your subscription first.",
    ),
  ).toBe(true);
  // A real turn failure is NOT treated as the handled reconnect state.
  expect(isNotConnectedError("upstream exploded")).toBe(false);
  expect(isNotConnectedError("rate limit exceeded")).toBe(false);
});

test("isStoppedByUser matches the verbatim stop message from the runtime + relay", () => {
  // The exact string the runtime's cancelTurn and the relay's abort path emit.
  expect(isStoppedByUser("Stopped by user")).toBe(true);
  // A real failure is never mistaken for an intentional stop.
  expect(isStoppedByUser("upstream exploded")).toBe(false);
  expect(isStoppedByUser("rate limit exceeded")).toBe(false);
});

describe("configWriteToSettings (model-pick → engine settings bridge)", () => {
  const CONFIG = ".houston/config/config.json";

  test("carries the reasoning effort through to the settings update", () => {
    // opencode is an open-catalog gateway — its arbitrary model passes through.
    expect(
      configWriteToSettings(
        CONFIG,
        JSON.stringify({
          provider: "opencode",
          model: "deepseek-v4-pro",
          effort: "high",
        }),
      ),
    ).toEqual({
      activeProvider: "opencode",
      model: "deepseek-v4-pro",
      effort: "high",
    });
    // Provider-only write (no effort) omits effort; the model defaults to the
    // provider's default (the runtime needs a concrete settings.models entry).
    expect(
      configWriteToSettings(CONFIG, JSON.stringify({ provider: "opencode" })),
    ).toEqual({ activeProvider: "opencode", model: "claude-sonnet-4-6" });
  });

  test("maps a config write with provider+model to a settings update", () => {
    expect(
      configWriteToSettings(
        CONFIG,
        JSON.stringify({ provider: "opencode-go", model: "deepseek-v4-pro" }),
      ),
    ).toEqual({ activeProvider: "opencode-go", model: "deepseek-v4-pro" });
    // The old desktop "openai" id is remapped to the engine's "openai-codex".
    expect(
      configWriteToSettings(
        CONFIG,
        JSON.stringify({ provider: "openai", model: "gpt-5.5" }),
      ),
    ).toEqual({ activeProvider: "openai-codex", model: "gpt-5.5" });
    // GitHub Copilot shares one id across frontend and engine: a picked
    // (non-default) Copilot model must mirror to the runtime, or every turn runs
    // the provider default. Copilot uses DOTTED model ids (claude-opus-4.8).
    expect(
      configWriteToSettings(
        CONFIG,
        JSON.stringify({
          provider: "github-copilot",
          model: "claude-opus-4.8",
        }),
      ),
    ).toEqual({ activeProvider: "github-copilot", model: "claude-opus-4.8" });
    // A bare legacy tier name is migrated to a real pi id at the same tier.
    expect(
      configWriteToSettings(
        CONFIG,
        JSON.stringify({ provider: "anthropic", model: "opus" }),
      ),
    ).toEqual({ activeProvider: "anthropic", model: "claude-opus-4-8" });
  });

  test("migrates an unknown provider to the default instead of dropping it", () => {
    // Gemini was dropped — a stored gemini agent must NOT silently no-op (every
    // turn would then run the active provider's default with no record). It
    // migrates to the default provider + model so the turn still runs.
    expect(
      configWriteToSettings(CONFIG, JSON.stringify({ provider: "gemini" })),
    ).toEqual({ activeProvider: "openai-codex", model: "gpt-5.5" });
  });

  test("skips non-config files, missing provider, and bad JSON", () => {
    expect(
      configWriteToSettings(".houston/learnings/learnings.json", "{}"),
    ).toBeNull();
    expect(configWriteToSettings("CLAUDE.md", "# hi")).toBeNull();
    expect(
      configWriteToSettings(CONFIG, JSON.stringify({ model: "x" })),
    ).toBeNull(); // no provider
    expect(configWriteToSettings(CONFIG, "not json")).toBeNull();
  });
});

describe("historyToFeed (persisted history → feed replay)", () => {
  test("replays a provider-switch marker as a divider before the turn, mapping the runtime id to the app id", () => {
    const feed = historyToFeed([
      { role: "user", content: "hi", ts: 1 },
      {
        role: "assistant",
        content: "on anthropic",
        ts: 2,
        usage: { context_tokens: 300_000, output_tokens: 1, cached_tokens: 0 },
      },
      { role: "user", content: "keep going", ts: 3 },
      {
        role: "assistant",
        content: "now on codex",
        ts: 4,
        providerSwitch: {
          provider: "openai-codex",
          summarized: true,
          pre_tokens: 300_000,
        },
      },
    ]);

    const idx = feed.findIndex((f) => f.feed_type === "provider_switched");
    expect(idx).toBeGreaterThan(-1);
    // openai-codex → openai so the divider resolves the provider NAME.
    expect(feed[idx]?.data).toEqual({
      provider: "openai",
      summarized: true,
      pre_tokens: 300_000,
    });
    // The divider precedes that turn's assistant text (it marks the boundary).
    const textIdx = feed.findIndex(
      (f, i) =>
        i > idx &&
        f.feed_type === "assistant_text" &&
        f.data === "now on codex",
    );
    expect(textIdx).toBeGreaterThan(idx);
  });

  test("a normal assistant turn replays no divider", () => {
    const feed = historyToFeed([
      { role: "user", content: "hi", ts: 1 },
      { role: "assistant", content: "hello", ts: 2 },
    ]);
    expect(feed.some((f) => f.feed_type === "provider_switched")).toBe(false);
  });

  test("replays a persisted provider_error card, mapping the runtime id to the app id", () => {
    const feed = historyToFeed([
      { role: "user", content: "do a thing", ts: 1 },
      {
        role: "assistant",
        content: "",
        ts: 2,
        providerError: {
          kind: "unauthenticated",
          provider: "openai-codex",
          cause: "token_revoked",
          message: "Your session has ended. Please log in again.",
        },
      },
    ]);
    const card = feed.find((f) => f.feed_type === "provider_error");
    expect(card?.data).toEqual({
      kind: "unauthenticated",
      // openai-codex → openai so the card resolves the provider name.
      provider: "openai",
      cause: "token_revoked",
      message: "Your session has ended. Please log in again.",
    });
  });

  test("a normal assistant turn replays no provider_error card", () => {
    const feed = historyToFeed([
      { role: "user", content: "hi", ts: 1 },
      { role: "assistant", content: "hello", ts: 2 },
    ]);
    expect(feed.some((f) => f.feed_type === "provider_error")).toBe(false);
  });
});
