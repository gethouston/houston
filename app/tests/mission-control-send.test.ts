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
    const overrides = resolveActivityOverride("activity-x", [
      { id: "x", provider: "anthropic" },
    ]);
    deepStrictEqual(overrides, {
      providerOverride: "anthropic",
      modelOverride: undefined,
    });
  });

  it("treats the leading 'activity-' as a literal prefix only", () => {
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
        effortOverride: "high",
        modeOverride: "plan",
      },
    );
  });

  it("drops the composer's effort when the row's model has no effort levels", () => {
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
