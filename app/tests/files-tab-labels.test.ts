import { equal } from "node:assert";
import { it } from "node:test";
import type { TFunction } from "i18next";
import { buildBrowserLabels } from "../src/components/agent/files-tab-labels.ts";
import en from "../src/locales/en/agents.json" with { type: "json" };

it("resolves every Files browser label through the agents namespace", () => {
  const t = ((key: string) => {
    const value = key
      .split(".")
      .reduce<unknown>(
        (node, part) =>
          typeof node === "object" && node
            ? (node as Record<string, unknown>)[part]
            : undefined,
        en,
      );
    return typeof value === "string" ? value : key;
  }) as TFunction<"agents">;
  const labels = Object.values(buildBrowserLabels(t));
  equal(
    labels.some(
      (value) => typeof value === "string" && value.startsWith("files."),
    ),
    false,
  );
});
