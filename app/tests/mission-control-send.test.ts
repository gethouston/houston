import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type ActivityOverrideSource,
  resolveActivityOverride,
} from "../src/components/mission-control-send.ts";

const opus47Activity: ActivityOverrideSource = {
  id: "2792471e-1cca-4c75-addb-1259f3dd638b",
  provider: "anthropic",
  model: "claude-opus-4-7",
};

const legacyOpusActivity: ActivityOverrideSource = {
  id: "abc",
  provider: "anthropic",
  model: "opus",
};

const legacySonnetActivity: ActivityOverrideSource = {
  id: "def",
  provider: "anthropic",
  model: "sonnet",
};

const codexActivity: ActivityOverrideSource = {
  id: "ghi",
  provider: "openai",
  model: "gpt-5.5",
};

const routineActivity: ActivityOverrideSource = {
  id: "activity-row-for-routine",
  session_key: "routine-routine-id",
  provider: "anthropic",
  model: "claude-opus-4-7",
};

describe("resolveActivityOverride (Mission Control send-path override drop fix)", () => {
  it("returns the activity's provider+model when the activity is found", () => {
    const overrides = resolveActivityOverride(`activity-${opus47Activity.id}`, [
      opus47Activity,
      codexActivity,
    ]);
    deepStrictEqual(overrides, {
      providerOverride: "anthropic",
      modelOverride: "claude-opus-4-7",
    });
  });

  it("matches routine chats by their stored session key", () => {
    // Mission Control card ids are activity ids, but routine chat history and
    // follow-up sends address the stable `routine-{id}` session. Matching only
    // `activity-{id}` makes Mission Control silently drop the routine's model
    // override even though the per-agent board sends correctly.
    const overrides = resolveActivityOverride("routine-routine-id", [
      opus47Activity,
      routineActivity,
    ]);
    deepStrictEqual(overrides, {
      providerOverride: "anthropic",
      modelOverride: "claude-opus-4-7",
    });
  });

  it("normalizes the legacy 'opus' alias to claude-opus-5", () => {
    // Activity records created before catalog version-pinning hold bare
    // aliases on disk and are NOT migrated by the engine (only config.json
    // is). The frontend must normalize on read so the send doesn't ship
    // "opus" to a CLI that no longer accepts it.
    const overrides = resolveActivityOverride(
      `activity-${legacyOpusActivity.id}`,
      [legacyOpusActivity],
    );
    deepStrictEqual(overrides, {
      providerOverride: "anthropic",
      modelOverride: "claude-opus-5",
    });
  });

  it("normalizes the legacy 'sonnet' alias to claude-sonnet-4-6", () => {
    const overrides = resolveActivityOverride(
      `activity-${legacySonnetActivity.id}`,
      [legacySonnetActivity],
    );
    deepStrictEqual(overrides, {
      providerOverride: "anthropic",
      modelOverride: "claude-sonnet-4-6",
    });
  });

  it("returns an empty object when the activity is not in the list", () => {
    // Activity deleted between render and send, or sessionKey for a different
    // agent's activity. Empty override lets the engine fall back to the agent
    // config — the only safe default with no activity context.
    deepStrictEqual(
      resolveActivityOverride("activity-missing", [opus47Activity]),
      {},
    );
  });

  it("returns an empty object when the activities list is undefined", () => {
    deepStrictEqual(
      resolveActivityOverride("activity-anything", undefined),
      {},
    );
  });

  it("returns model=undefined (not null) when the activity has no model", () => {
    // tauriChat.send opts type uses string | undefined; null would type-error.
    const overrides = resolveActivityOverride("activity-x", [
      { id: "x", provider: "anthropic" },
    ]);
    deepStrictEqual(overrides, {
      providerOverride: "anthropic",
      modelOverride: undefined,
    });
  });

  it("treats the leading 'activity-' as a literal prefix only", () => {
    // The activity id itself might start with characters that look like the
    // prefix; the helper must only strip the FIRST occurrence at position 0.
    const weird: ActivityOverrideSource = {
      id: "activity-inside-id",
      provider: "anthropic",
      model: "claude-opus-4-8",
    };
    const overrides = resolveActivityOverride(`activity-${weird.id}`, [weird]);
    deepStrictEqual(overrides, {
      providerOverride: "anthropic",
      modelOverride: "claude-opus-4-8",
    });
  });
});
