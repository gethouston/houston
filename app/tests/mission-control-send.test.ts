import { deepStrictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import { DEFAULT_MODEL } from "@houston/sdk/provider-catalog";
import {
  type ActivityOverrideSource,
  resolveActivityOverride,
  resolveFollowUpOverrides,
  resolveMissionControlSendOverrides,
} from "../src/components/mission-control-send.ts";
import { hydrateProviderCatalog } from "../src/lib/providers.ts";
import { SAMPLE_CATALOG } from "./fixtures/sample-catalog.ts";

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
  model: "gpt-6-astra",
};

const routineActivity: ActivityOverrideSource = {
  id: "activity-row-for-routine",
  session_key: "routine-routine-id",
  provider: "anthropic",
  model: "claude-opus-4-7",
};

describe("resolveActivityOverride (Mission Control send-path override drop fix)", () => {
  it("returns the activity's provider+model when the activity is found", () => {
    // Opus 4.7 left the Claude lineup, so the pin reads as the lineup's Opus
    // (never a Sonnet downgrade).
    const overrides = resolveActivityOverride(`activity-${opus47Activity.id}`, [
      opus47Activity,
      codexActivity,
    ]);
    deepStrictEqual(overrides, {
      providerOverride: "anthropic",
      modelOverride: "claude-opus-5-5",
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
      modelOverride: "claude-opus-5-5",
    });
  });

  it("normalizes the legacy 'opus' alias to the lineup's Opus", () => {
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
      modelOverride: "claude-opus-5-5",
    });
  });

  it("normalizes the legacy 'sonnet' alias to the provider's current default", () => {
    // The alias derives from `DEFAULT_MODEL.anthropic` (`@houston/domain`
    // model-aliases.ts) so that a stored "sonnet" and an unpinned send land on
    // the same model. Read from that table rather than restated, or this pin
    // silently outlives the next default.
    const overrides = resolveActivityOverride(
      `activity-${legacySonnetActivity.id}`,
      [legacySonnetActivity],
    );
    deepStrictEqual(overrides, {
      providerOverride: "anthropic",
      modelOverride: DEFAULT_MODEL.anthropic,
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
      model: "claude-opus-5-5",
    };
    const overrides = resolveActivityOverride(`activity-${weird.id}`, [weird]);
    deepStrictEqual(overrides, {
      providerOverride: "anthropic",
      modelOverride: "claude-opus-5-5",
    });
  });
});

describe("resolveMissionControlSendOverrides", () => {
  it("pins caller-assembled sends to Ask First", () => {
    deepStrictEqual(
      resolveMissionControlSendOverrides(`activity-${opus47Activity.id}`, [
        opus47Activity,
      ]),
      {
        providerOverride: "anthropic",
        modelOverride: "claude-opus-5-5",
        modeOverride: "execute",
      },
    );
  });
});

describe("resolveFollowUpOverrides (no pod read before the bubble)", () => {
  // Effort is validated against the model it rides, which needs the catalog.
  before(() => hydrateProviderCatalog(SAMPLE_CATALOG));
  const composer = {
    providerOverride: "openai",
    modelOverride: "gpt-6-astra",
    effortOverride: "high",
    modeOverride: "plan" as const,
  };

  it("prefers the cached row's own pin when the list is cached", () => {
    deepStrictEqual(
      resolveFollowUpOverrides(
        `activity-${opus47Activity.id}`,
        [opus47Activity, codexActivity],
        composer,
      ),
      {
        providerOverride: "anthropic",
        modelOverride: "claude-opus-5-5",
        // A row stores no effort: the picker's effort rides the row's model.
        effortOverride: "high",
        modeOverride: "plan",
      },
    );
  });

  it("drops the composer's effort when the row's model has no effort levels", () => {
    // The panel can still show the agent default while the row pins another
    // model; an effort validated for the former must not ride the latter.
    const nonReasoning: ActivityOverrideSource = {
      id: "nr",
      provider: "github-copilot",
      model: "gpt-4.1",
    };
    deepStrictEqual(
      resolveFollowUpOverrides("activity-nr", [nonReasoning], composer),
      {
        providerOverride: "github-copilot",
        modelOverride: "gpt-4.1",
        effortOverride: undefined,
        modeOverride: "plan",
      },
    );
  });

  it("falls back to the composer's pick when nothing is cached", () => {
    // Cold open against an asleep pod: the activity read is held for the
    // whole wake, and awaiting it froze the composer. The picker shows the
    // agent default meanwhile, so the wire ships exactly that.
    deepStrictEqual(
      resolveFollowUpOverrides("activity-anything", undefined, composer),
      {
        providerOverride: "openai",
        modelOverride: "gpt-6-astra",
        effortOverride: "high",
        modeOverride: "plan",
      },
    );
  });

  it("falls back to the composer's pick when the row is not in the cache", () => {
    deepStrictEqual(
      resolveFollowUpOverrides("activity-missing", [opus47Activity], composer),
      {
        providerOverride: "openai",
        modelOverride: "gpt-6-astra",
        effortOverride: "high",
        modeOverride: "plan",
      },
    );
  });

  it("falls back to the composer's pick when the cached row has no pin", () => {
    // A row without a stored pin means "the agent default" — which is what
    // the picker resolved and shows; the wire must agree with the picker.
    deepStrictEqual(
      resolveFollowUpOverrides("activity-x", [{ id: "x" }], composer),
      {
        providerOverride: "openai",
        modelOverride: "gpt-6-astra",
        effortOverride: "high",
        modeOverride: "plan",
      },
    );
  });

  it("runs a Mission Control follow-up in the conversation's mode", () => {
    // The composer's mode is the conversation's kept one (HOU-205): forcing
    // Ask first here dropped the person's Autopilot on every follow-up.
    for (const modeOverride of ["auto", "plan", "execute"] as const) {
      deepStrictEqual(
        resolveFollowUpOverrides(
          `activity-${legacyOpusActivity.id}`,
          [legacyOpusActivity],
          { ...composer, modeOverride },
        ).modeOverride,
        modeOverride,
      );
      deepStrictEqual(
        resolveFollowUpOverrides("activity-missing", undefined, {
          ...composer,
          modeOverride,
        }).modeOverride,
        modeOverride,
      );
    }
  });
});
