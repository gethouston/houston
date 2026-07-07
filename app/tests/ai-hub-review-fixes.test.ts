import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  fewModels,
  formatReleaseDate,
  roundedModelCount,
} from "../src/components/ai-hub/format.ts";
import {
  addCandidate,
  type Draft,
  finalize,
} from "../src/lib/ai-hub/catalog-merge.ts";
import type { RawModel } from "../src/lib/ai-hub/catalog-snapshot.ts";
import {
  loadCachedProviderStatuses,
  saveCachedProviderStatuses,
} from "../src/lib/provider-status-cache.ts";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// Finding 8 — capability-flag merge (logic bug, failing-test-first)
// ---------------------------------------------------------------------------
describe("catalog merge preserves a dropped variant's capabilities", () => {
  const raw = (id: string, extra: Partial<RawModel> = {}): RawModel => ({
    key: "qwen plus 0728",
    id,
    name: "Qwen Plus 0728",
    ...extra,
  });

  it("keeps reasoning=true when the shorter-id variant lacks it (openrouter Qwen Plus 0728)", () => {
    const drafts = new Map<string, Draft>();
    // The plain id is shorter, so addCandidate would keep it; the ":thinking"
    // variant (longer id) carries reasoning=true and used to be dropped whole.
    addCandidate(drafts, {
      providerId: "openrouter",
      raw: raw("qwen/qwen-plus-0728"),
      subscription: false,
      lab: "qwen",
    });
    addCandidate(drafts, {
      providerId: "openrouter",
      raw: raw("qwen/qwen-plus-0728:thinking", { reasoning: true }),
      subscription: false,
      lab: "qwen",
    });
    const model = finalize(
      "qwen plus 0728",
      drafts.get("qwen plus 0728") as Draft,
    );
    strictEqual(model.reasoning, true);
    strictEqual(model.offers.length, 1, "still one merged offer per provider");
    // The surviving offer keeps the cleaner (shorter, region/variant-free) id.
    strictEqual(model.offers[0]?.modelId, "qwen/qwen-plus-0728");
  });

  it("merges tool/attachment support across dropped variants too", () => {
    const drafts = new Map<string, Draft>();
    addCandidate(drafts, {
      providerId: "openrouter",
      raw: raw("qwen/qwen-plus-0728", { toolCall: true }),
      subscription: false,
      lab: "qwen",
    });
    addCandidate(drafts, {
      providerId: "openrouter",
      raw: raw("qwen/qwen-plus-0728:thinking", { attachment: true }),
      subscription: false,
      lab: "qwen",
    });
    const survivor = drafts.get("qwen plus 0728")?.byProvider.get("openrouter");
    ok(survivor?.raw.toolCall, "tool support survives");
    ok(survivor?.raw.attachment, "attachment support survives");
  });
});

// ---------------------------------------------------------------------------
// Finding 6 — count fallback rounding helper (shared, unit-tested)
// ---------------------------------------------------------------------------
describe("roundedModelCount / fewModels", () => {
  it("rounds down to the nearest 50", () => {
    strictEqual(roundedModelCount(438), 400);
    strictEqual(roundedModelCount(99), 50);
    strictEqual(roundedModelCount(40), 0);
    strictEqual(roundedModelCount(0), 0);
  });

  it("flags a count too small for a confident '{{n}}+' claim", () => {
    ok(fewModels(0), "0 models is few");
    ok(fewModels(40), "rounds to 0, so few");
    ok(fewModels(99), "rounds to 50, still few");
    ok(!fewModels(100), "100 rounds to 100, not few");
    ok(!fewModels(438), "438 is plenty");
  });
});

// ---------------------------------------------------------------------------
// Status-cache instant paint — ported from main's provider-settings work into
// the hub's extracted `use-provider-statuses` hook (localStorage seeds the
// cards so they paint their last-known state instead of a skeleton; the probe
// reconciles and re-persists).
// ---------------------------------------------------------------------------
function memStore(): Pick<Storage, "getItem" | "setItem"> {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v);
    },
  };
}

const connectedStatus = (over: Record<string, unknown> = {}) => ({
  provider: "anthropic",
  cli_installed: true,
  auth_state: "authenticated",
  authenticated: true,
  cli_name: "claude",
  ...over,
});

describe("provider status cache seeds instant paint", () => {
  it("round-trips a confirmed scan for the next visit's first paint", () => {
    const store = memStore();
    saveCachedProviderStatuses({ anthropic: connectedStatus() }, store);
    const seeded = loadCachedProviderStatuses(store);
    strictEqual(Object.keys(seeded).length, 1, "one card seeded");
    strictEqual(seeded.anthropic?.authenticated, true);
  });

  it("drops malformed entries rather than trusting a bad paint hint", () => {
    const store = memStore();
    store.setItem(
      "houston.providerStatusCache.v1",
      JSON.stringify({ good: connectedStatus(), bad: { provider: 1 } }),
    );
    const seeded = loadCachedProviderStatuses(store);
    ok(seeded.good, "valid entry kept");
    ok(!seeded.bad, "invalid entry dropped");
  });

  it("an empty cache seeds nothing, so the hook shows the skeleton until the first probe", () => {
    const seeded = loadCachedProviderStatuses(memStore());
    strictEqual(Object.keys(seeded).length, 0);
  });

  it("the extracted hook seeds from the cache and derives ready from the seed", () => {
    const hook = read(
      "../src/hooks/provider-connections/use-provider-statuses.ts",
    );
    ok(
      hook.includes("loadCachedProviderStatuses"),
      "statuses state seeds from the cache",
    );
    ok(
      hook.includes("saveCachedProviderStatuses"),
      "the confirmed scan is persisted for the next visit",
    );
    ok(
      hook.includes("checkAllStatuses") && hook.includes("mergeGatewayStatus"),
      "one engine round-trip per scan, merged per card",
    );
    ok(
      hook.includes("Object.keys(statuses).length === 0"),
      "loading (=> !ready) is false immediately when the cache seeded a snapshot",
    );
  });
});

// ---------------------------------------------------------------------------
// Finding 7 — knowledge cutoff formatted like a release date
// ---------------------------------------------------------------------------
describe("formatReleaseDate parses a YYYY-MM-DD knowledge cutoff", () => {
  it("renders month + year for a day-precision date", () => {
    strictEqual(formatReleaseDate("2026-01-31", "en-US"), "Jan 2026");
    strictEqual(formatReleaseDate("2026-12-01", "en-US"), "Dec 2026");
  });
});

// ---------------------------------------------------------------------------
// Findings 1, 2, 4, 9, 10, 11 — component contracts (source assertions, the
// repo's React-test idiom; the node runner has no DOM — see card-unification).
// ---------------------------------------------------------------------------
describe("AI Hub review fixes (component source contracts)", () => {
  it("Finding 1: connections expose a `ready` flag gating the list", () => {
    const hook = read("../src/hooks/use-provider-connections.ts");
    ok(hook.includes("ready"), "hook returns a ready flag");
    ok(hook.includes("loading"), "reads the status loading flag");
    const types = read("../src/hooks/provider-connections/types.ts");
    ok(types.includes("ready"), "ready is on the ProviderConnections type");
    // The card grid was extracted into the reusable `ProviderBrowser`; the ready
    // gate moved with it (renders a skeleton list before the first status probe
    // resolves).
    const list = read(
      "../src/components/provider-browser/provider-browser.tsx",
    );
    ok(
      list.includes("connections.ready"),
      "the browser gates on ready (renders skeletons before the first probe)",
    );
  });

  it("Finding 4/9: SpecChip is the shared chip primitive, no local HubChip", () => {
    const badges = read("../src/components/ai-hub/hub-badges.tsx");
    ok(
      badges.includes("export function SpecChip"),
      "SpecChip is the primitive",
    );
    // `provider-card.tsx` (which once carried the local HubChip) was deleted in
    // the list redesign; the provider detail surface is now `provider-modal`.
    // It consumes the shared SpecChip and declares no local chip primitive.
    const providerModal = read("../src/components/ai-hub/provider-modal.tsx");
    ok(
      providerModal.includes("SpecChip"),
      "the provider surface uses the shared SpecChip",
    );
    ok(
      !providerModal.includes("function HubChip"),
      "no local HubChip primitive",
    );
  });

  it("Finding 10: provider/model detail now open as centered modals (ModalShell)", () => {
    const provider = read("../src/components/ai-hub/provider-modal.tsx");
    ok(
      provider.includes("ModalShell"),
      "provider detail is a ModalShell modal",
    );
    const model = read("../src/components/ai-hub/model-modal.tsx");
    ok(model.includes("ModalShell"), "model detail is a ModalShell modal");
  });

  it("Finding 3: the duplicate formatters stay out of provider-grouping", () => {
    const grouping = read(
      "../src/components/provider-browser/provider-grouping.ts",
    );
    ok(!grouping.includes("formatCost"), "formatCost deleted from grouping");
    ok(
      !grouping.includes("formatContext"),
      "formatContext deleted from grouping",
    );
  });
});
