import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  importInstallRequest,
  lastUsedFromPin,
} from "../src/components/portable/import-install-request.ts";

/**
 * What the "From a friend" install actually decides, pinned away from the
 * engine round-trip that carries it out.
 */

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const args = {
  packageId: "pkg_1",
  workspaceName: "Houston",
  agentName: "Jerry",
  agentColor: "forest",
  include: {
    skillSlugs: ["invoicing"],
    routineIds: ["r1", "r2"],
    learningIds: [],
  },
};

describe("importInstallRequest", () => {
  it("always carries the instructions: there is no toggle for CLAUDE.md", () => {
    strictEqual(importInstallRequest(args).selection.includeClaudeMd, true);
    strictEqual(
      importInstallRequest({
        ...args,
        include: { skillSlugs: [], routineIds: [], learningIds: [] },
      }).selection.includeClaudeMd,
      true,
      "true even when the user unticked everything else",
    );
  });

  it("passes the user's selection through untouched", () => {
    deepStrictEqual(importInstallRequest(args), {
      packageId: "pkg_1",
      workspaceName: "Houston",
      agentName: "Jerry",
      agentColor: "forest",
      selection: {
        includeClaudeMd: true,
        includeSkillSlugs: ["invoicing"],
        includeRoutineIds: ["r1", "r2"],
        includeLearningIds: [],
      },
    });
  });
});

describe("lastUsedFromPin", () => {
  it("writes the sticky pair only when BOTH halves are pinned", () => {
    deepStrictEqual(lastUsedFromPin({ provider: "anthropic", model: "opus" }), {
      provider: "anthropic",
      model: "opus",
    });
    strictEqual(lastUsedFromPin({ provider: "anthropic" }), null);
    strictEqual(lastUsedFromPin({ model: "opus" }), null);
    strictEqual(lastUsedFromPin({}), null);
  });
});

describe("the portable install modules", () => {
  const owned = [
    "components/portable/import-install.ts",
    "components/portable/import-install-request.ts",
    "components/portable/import-kickoff-pin.ts",
    "components/portable/single-flight.ts",
    "components/portable/use-import-install-action.ts",
  ].map((rel) => ({ rel, src: readFileSync(join(SRC, rel), "utf8") }));

  const rest = sourceFiles(SRC)
    .filter((file) => !owned.some(({ rel }) => file === join(SRC, rel)))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

  it("export nothing that only their own file uses", () => {
    for (const { rel, src } of owned) {
      const outside = [
        rest,
        ...owned.filter((other) => other.rel !== rel).map((o) => o.src),
      ].join("\n");
      const names = [
        ...src.matchAll(
          /^export (?:async )?(?:function|interface|type|const) (\w+)/gm,
        ),
      ].map((match) => match[1]);
      ok(names.length > 0, `${rel} exports something`);
      for (const name of names) {
        ok(
          new RegExp(`\\b${name}\\b`).test(outside),
          `${rel} exports ${name} but nothing outside the file uses it`,
        );
      }
    }
  });
});
