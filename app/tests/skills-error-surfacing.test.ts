import { ok } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * A failed skill write is silent to the USER — the engine call already toasted
 * its real reason — but it must never be silent to US. An empty catch is the
 * one shape that loses the failure entirely, so the whole surface is scanned
 * for it rather than the two handlers that carried it.
 */
const dir = new URL("../src/components/skills-view/", import.meta.url);

const sources = readdirSync(dir)
  .filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"))
  .map((name) => [name, readFileSync(new URL(name, dir), "utf8")] as const);

describe("the Skills surface swallows nothing", () => {
  it("has no empty catch anywhere in it", () => {
    for (const [name, src] of sources)
      ok(
        !/\.catch\(\(\s*\)\s*=>\s*(\{\s*\}|null|\[\]|undefined)\s*\)/.test(src),
        `${name} drops a rejection on the floor`,
      );
  });

  it("names the two writes the save flow reports", () => {
    const save = readFileSync(new URL("use-skill-save.ts", dir), "utf8");
    ok(save.includes('logAndReportError("skill_delete"'), "the delete");
    ok(save.includes('logAndReportError("skill_unassign"'), "the unassign");
  });
});
