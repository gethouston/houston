import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { modelCatalog } from "../src/components/tabs/agent-admin/agent-admin-models-catalog.ts";
import { ceilingValue } from "../src/components/tabs/agent-admin/agent-admin-row-values.ts";

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

describe("modelCatalog — the allowed-models picker source", () => {
  const catalog = modelCatalog();

  it("is non-empty and deduped by model id", () => {
    ok(catalog.length > 0);
    const ids = catalog.map((m) => m.id);
    strictEqual(new Set(ids).size, ids.length);
  });

  it("is sorted A-Z by label (then id) for a stable picker order", () => {
    for (let i = 1; i < catalog.length; i++) {
      const prev = catalog[i - 1];
      const cur = catalog[i];
      ok(
        prev.label.localeCompare(cur.label) < 0 ||
          (prev.label === cur.label && prev.id.localeCompare(cur.id) <= 0),
      );
    }
  });

  it("every entry carries a human label", () => {
    for (const entry of catalog) {
      ok(entry.id.length > 0);
      ok(entry.label.length > 0);
    }
  });
});
