import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  STORE_TEMPLATE_IDS,
  storeCatalogConfigs,
} from "../src/agents/builtin/store-catalog.ts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const STORE = join(REPO, "store", "agents");
const TEMPLATES = join(
  REPO,
  "app",
  "src",
  "agents",
  "builtin",
  "store-templates",
);

const storeIds = readdirSync(STORE)
  .filter((id) => statSync(join(STORE, id)).isDirectory())
  .sort();

function skillCount(id: string): number {
  const dir = join(STORE, id, ".agents", "skills");
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((s) => existsSync(join(dir, s, "SKILL.md")))
    .length;
}

describe("generated store catalog", () => {
  it("matches the store/agents directories exactly (regenerate if this fails)", () => {
    const catalogIds = storeCatalogConfigs.map((c) => c.id).sort();
    deepStrictEqual(
      catalogIds,
      storeIds,
      "run `node scripts/gen-agent-templates.mjs` after changing store/agents",
    );
    deepStrictEqual([...STORE_TEMPLATE_IDS].sort(), storeIds);
  });

  it("gives every card the fields the picker needs, authored by Houston", () => {
    for (const cfg of storeCatalogConfigs) {
      ok(cfg.name, `${cfg.id} has a name`);
      ok(cfg.description, `${cfg.id} has a description`);
      // author === "Houston" is what makes the card localize via agents.json.
      strictEqual(cfg.author, "Houston", `${cfg.id} is Houston-authored`);
      // Heavy content must NOT ride in the light card (bundle-size contract).
      strictEqual(cfg.claudeMd, undefined, `${cfg.id} card omits claudeMd`);
      strictEqual(cfg.agentSeeds, undefined, `${cfg.id} card omits agentSeeds`);
    }
  });

  it("ships a payload per agent with its CLAUDE.md and every skill seeded", () => {
    for (const id of storeIds) {
      const path = join(TEMPLATES, `${id}.json`);
      ok(existsSync(path), `${id}.json generated`);
      const tpl = JSON.parse(readFileSync(path, "utf8")) as {
        claudeMd?: string;
        seeds: Record<string, string>;
      };
      ok(tpl.claudeMd && tpl.claudeMd.length > 0, `${id} has CLAUDE.md`);
      const seededSkills = Object.keys(tpl.seeds).filter(
        (k) => k.startsWith(".agents/skills/") && k.endsWith("/SKILL.md"),
      ).length;
      strictEqual(
        seededSkills,
        skillCount(id),
        `${id} seeds all of its SKILL.md files`,
      );
    }
  });
});
