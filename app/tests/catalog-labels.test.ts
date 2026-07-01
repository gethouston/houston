import { strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import type { TFunction } from "i18next";
import { localizeCatalogCopy } from "../src/agents/catalog-labels.ts";

/**
 * Minimal i18next stub: returns the value in `table` for a known key,
 * otherwise the `defaultValue` (mirrors i18next's fallback contract).
 */
function fakeT(table: Record<string, string>): TFunction {
  const t = (key: string, opts?: { defaultValue?: string }) =>
    table[key] ?? opts?.defaultValue ?? key;
  return t as unknown as TFunction;
}

describe("localizeCatalogCopy", () => {
  it("translates a first-party (Houston) agent that has catalog entries", () => {
    const t = fakeT({
      "agents:catalog.personal-assistant.name": "Asistente personal",
      "agents:catalog.personal-assistant.description": "Descripción en español",
    });
    const result = localizeCatalogCopy(
      {
        id: "personal-assistant",
        name: "Personal assistant",
        description: "English",
        author: "Houston",
      },
      t,
    );
    strictEqual(result.name, "Asistente personal");
    strictEqual(result.description, "Descripción en español");
  });

  it("translates a bundled Houston store listing by id", () => {
    const t = fakeT({
      "agents:catalog.bookkeeping.name": "Contabilidad",
      "agents:catalog.bookkeeping.description": "Categoriza transacciones...",
    });
    const result = localizeCatalogCopy(
      {
        id: "bookkeeping",
        name: "Bookkeeping",
        description: "Categorize transactions...",
        author: "Houston",
      },
      t,
    );
    strictEqual(result.name, "Contabilidad");
    strictEqual(result.description, "Categoriza transacciones...");
  });

  it("falls back to the raw strings when a Houston agent has no catalog entry", () => {
    const t = fakeT({});
    const result = localizeCatalogCopy(
      {
        id: "future-agent",
        name: "Future",
        description: "Later",
        author: "Houston",
      },
      t,
    );
    strictEqual(result.name, "Future");
    strictEqual(result.description, "Later");
  });

  it("keeps a third-party agent in its author's language, ignoring catalog keys", () => {
    // Even if a catalog key collides by id, a non-Houston agent must never be
    // relabeled: author's language wins (App Store model).
    const t = fakeT({
      "agents:catalog.bookkeeping.name": "SHOULD NOT APPLY",
    });
    const result = localizeCatalogCopy(
      {
        id: "bookkeeping",
        name: "Community Bookkeeper",
        description: "By some author",
        author: "Jane Dev",
      },
      t,
    );
    strictEqual(result.name, "Community Bookkeeper");
    strictEqual(result.description, "By some author");
  });

  it("treats a missing author as third-party (no translation)", () => {
    const t = fakeT({ "agents:catalog.sales.name": "Ventas" });
    const result = localizeCatalogCopy(
      { id: "sales", name: "Sales", description: "Find leads" },
      t,
    );
    strictEqual(result.name, "Sales");
    strictEqual(result.description, "Find leads");
  });
});
