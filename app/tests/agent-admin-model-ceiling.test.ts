import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  ceilingMode,
  ceilingValue,
} from "../src/components/tabs/agent-admin/agent-admin-row-values.ts";
import {
  allowedListView,
  allowedModelCount,
  modelChecked,
  toggleModel,
} from "../src/components/tabs/agent-admin/model-allowlist.ts";
import type { CatalogModel } from "../src/lib/ai-hub/catalog-types.ts";

/** A minimal `CatalogModel` fixture: only the fields the allowlist helpers read. */
function model(
  key: string,
  offerIds: string[],
  extra: Partial<CatalogModel> = {},
): CatalogModel {
  return {
    key,
    name: key,
    lab: "other",
    reasoning: false,
    toolCall: false,
    imageGen: false,
    inputModalities: ["text"],
    offers: offerIds.map((modelId, i) => ({
      providerId: `p${i}`,
      modelId,
      subscription: false,
    })),
    ...extra,
  };
}

// Two labs' worth of models, one single-offer and one multi-offer, so the
// helpers exercise the "one model spans several ids" path.
const OPUS = model("opus", ["anthropic/claude-opus", "bedrock/opus"]);
const SONNET = model("sonnet", ["anthropic/claude-sonnet"]);
const GPT = model("gpt", ["openai/gpt-5", "openrouter/gpt-5"]);
const MODELS = [OPUS, SONNET, GPT];

describe("ceilingValue — inline row state for a ceiling", () => {
  it("undefined (loading / non-Teams host) yields null → show no value yet", () => {
    strictEqual(ceilingValue(undefined), null);
  });

  it("null ceiling means everything is allowed", () => {
    deepStrictEqual(ceilingValue(null), { kind: "all" });
  });

  it("an explicit set reports its count (including empty = 0)", () => {
    deepStrictEqual(ceilingValue([]), { kind: "count", count: 0 });
    deepStrictEqual(ceilingValue(["gpt-5.5", "claude-opus-4-8"]), {
      kind: "count",
      count: 2,
    });
  });
});

describe("ceilingMode — the always-visible two-option choice", () => {
  it("a null ceiling maps to the 'any' (allow-all) option", () => {
    strictEqual(ceilingMode(null), "any");
  });

  it("any explicit set (including empty) maps to the 'picked' option", () => {
    strictEqual(ceilingMode([]), "picked");
    strictEqual(ceilingMode(["claude-opus-4-8"]), "picked");
  });
});

describe("modelChecked — a model is allowed when ANY offer id is present", () => {
  it("false when none of the model's offer ids are in the set", () => {
    strictEqual(modelChecked(OPUS, new Set()), false);
    strictEqual(modelChecked(OPUS, new Set(["openai/gpt-5"])), false);
  });

  it("true when at least one offer id is present (partial set counts)", () => {
    strictEqual(modelChecked(OPUS, new Set(["bedrock/opus"])), true);
    strictEqual(
      modelChecked(OPUS, new Set(["anthropic/claude-opus", "bedrock/opus"])),
      true,
    );
  });
});

describe("toggleModel — flips ALL of a model's offer ids at once", () => {
  it("turning a model ON adds every one of its offer ids", () => {
    deepStrictEqual(toggleModel(OPUS, []), [
      "anthropic/claude-opus",
      "bedrock/opus",
    ]);
  });

  it("turning a model OFF removes every one of its offer ids", () => {
    deepStrictEqual(
      toggleModel(OPUS, ["anthropic/claude-opus", "bedrock/opus"]),
      [],
    );
  });

  it("a partial set counts as ON, so toggling clears all its offer ids", () => {
    deepStrictEqual(toggleModel(OPUS, ["bedrock/opus"]), []);
  });

  it("leaves other models' ids and unknown ids untouched", () => {
    deepStrictEqual(toggleModel(OPUS, ["openai/gpt-5", "stale-id"]), [
      "anthropic/claude-opus",
      "bedrock/opus",
      "openai/gpt-5",
      "stale-id",
    ]);
  });

  it("returns a de-duplicated, stable-sorted array", () => {
    const out = toggleModel(GPT, ["openai/gpt-5"]);
    // GPT was partially on, so it clears; only the untouched entries remain.
    deepStrictEqual(out, []);
    const on = toggleModel(SONNET, ["z-id", "a-id"]);
    deepStrictEqual(on, ["a-id", "anthropic/claude-sonnet", "z-id"]);
  });
});

describe("allowedListView — which empty-state variant the allowed list shows", () => {
  it("renders the list whenever any model is visible after the lab filter", () => {
    strictEqual(
      allowedListView({ visibleCount: 2, hasPicked: true, labFiltered: false }),
      "list",
    );
    // A visible list wins even while a lab filter is active.
    strictEqual(
      allowedListView({ visibleCount: 1, hasPicked: true, labFiltered: true }),
      "list",
    );
  });

  it("shows the plain empty copy when nothing is picked at all", () => {
    strictEqual(
      allowedListView({
        visibleCount: 0,
        hasPicked: false,
        labFiltered: false,
      }),
      "empty",
    );
    // Even with a lab filter active, "nothing picked" stays the plain empty.
    strictEqual(
      allowedListView({ visibleCount: 0, hasPicked: false, labFiltered: true }),
      "empty",
    );
  });

  it("shows the lab-aware copy when models are picked but the filter hides them all", () => {
    strictEqual(
      allowedListView({ visibleCount: 0, hasPicked: true, labFiltered: true }),
      "empty-lab",
    );
  });

  it("without a lab filter, an empty visible list means nothing is picked", () => {
    // hasPicked cannot be true here (no filter to hide picks), but guard anyway:
    strictEqual(
      allowedListView({
        visibleCount: 0,
        hasPicked: true,
        labFiltered: false,
      }),
      "empty",
    );
  });
});

describe("allowedModelCount — counts models, surfacing unknown ids", () => {
  it("counts each model with at least one allowed offer once", () => {
    strictEqual(allowedModelCount(["bedrock/opus"], MODELS), 1);
    strictEqual(
      allowedModelCount(
        ["anthropic/claude-opus", "bedrock/opus", "openai/gpt-5"],
        MODELS,
      ),
      2,
    );
  });

  it("adds unknown ids (matching no catalog offer) so they are never dropped", () => {
    strictEqual(allowedModelCount(["stale-id"], MODELS), 1);
    strictEqual(allowedModelCount(["bedrock/opus", "stale-id"], MODELS), 2);
  });

  it("an empty ceiling counts zero", () => {
    strictEqual(allowedModelCount([], MODELS), 0);
  });

  it("counts a model once even when several of its offers are allowed", () => {
    strictEqual(
      allowedModelCount(["anthropic/claude-opus", "bedrock/opus"], MODELS),
      1,
    );
  });
});
