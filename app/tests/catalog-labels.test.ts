import { strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import type { TFunction } from "i18next";
import { localizeCatalogEntry } from "../src/agents/catalog-labels.ts";
import type { AgentDefinition } from "../src/lib/types.ts";

/**
 * Minimal i18next stub: returns the value in `table` for a known key,
 * otherwise the `defaultValue` (mirrors i18next's fallback contract).
 */
function fakeT(table: Record<string, string>): TFunction {
  const t = (key: string, opts?: { defaultValue?: string }) =>
    table[key] ?? opts?.defaultValue ?? key;
  return t as unknown as TFunction;
}

function def(
  source: AgentDefinition["source"],
  config: Partial<AgentDefinition["config"]> & { id: string },
): AgentDefinition {
  return {
    source,
    config: {
      name: "English name",
      description: "English description",
      ...config,
    },
  };
}

describe("localizeCatalogEntry", () => {
  it("translates a builtin agent that has catalog entries", () => {
    const t = fakeT({
      "agents:catalog.personal-assistant.name": "Asistente personal",
      "agents:catalog.personal-assistant.description": "Descripción en español",
    });
    const result = localizeCatalogEntry(def("builtin", { id: "personal-assistant" }), t);
    strictEqual(result.name, "Asistente personal");
    strictEqual(result.description, "Descripción en español");
  });

  it("falls back to the config strings when a builtin has no catalog entry", () => {
    const t = fakeT({});
    const result = localizeCatalogEntry(
      def("builtin", { id: "future-agent", name: "Future", description: "Later" }),
      t,
    );
    strictEqual(result.name, "Future");
    strictEqual(result.description, "Later");
  });

  it("keeps an installed agent in its author's language, ignoring catalog keys", () => {
    // Even if a catalog key collides by id, an installed (non-builtin) agent
    // must never be relabeled — author's language wins (App Store model).
    const t = fakeT({
      "agents:catalog.personal-assistant.name": "SHOULD NOT APPLY",
    });
    const result = localizeCatalogEntry(
      def("installed", {
        id: "personal-assistant",
        name: "Community Agent",
        description: "By some author",
      }),
      t,
    );
    strictEqual(result.name, "Community Agent");
    strictEqual(result.description, "By some author");
  });
});
