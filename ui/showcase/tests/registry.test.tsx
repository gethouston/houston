import { strict as assert } from "node:assert";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import {
  componentCount,
  DEFAULT_SPECIMEN_ID,
  SPECIMEN_GROUPS,
  SPECIMEN_TIERS,
  specimenGroups,
  specimenIds,
  specimens,
  specimenTiers,
} from "../src/registry.ts";
import { SpecimenIdProvider } from "../src/used-in.tsx";

describe("the specimen registry", () => {
  it("gives every specimen a unique id", () => {
    const ids = specimens.map((one) => one.id);
    assert.deepEqual(
      ids.filter((id, index) => ids.indexOf(id) !== index),
      [],
      "duplicate specimen ids — the id is the URL hash, it has to be unique",
    );
  });

  it("keeps every id kebab-case, so review links stay readable", () => {
    for (const one of specimens) {
      assert.match(one.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, one.id);
    }
  });

  it("gives every specimen a title", () => {
    for (const one of specimens) {
      assert.notEqual(one.title.trim(), "", one.id);
    }
  });

  it("files every specimen under a declared group", () => {
    for (const one of specimens) {
      assert.ok(
        SPECIMEN_GROUPS.includes(one.group),
        `${one.id} is filed under "${one.group}", which is not a nav group`,
      );
    }
  });

  it("declares each group in exactly one tier", () => {
    const declared = SPECIMEN_TIERS.flatMap((tier) => tier.groups);
    assert.deepEqual(
      declared.filter((name, index) => declared.indexOf(name) !== index),
      [],
      "a group cannot sit under two tiers — the rail would show it twice",
    );
    assert.deepEqual([...SPECIMEN_GROUPS], declared);
  });

  it("renders the tiers and their groups in the declared order", () => {
    assert.deepEqual(
      specimenTiers.map((tier) => tier.name),
      SPECIMEN_TIERS.map((tier) => tier.name),
      "an extra tier means a specimen is filed under an undeclared group",
    );
    for (const [index, tier] of specimenTiers.entries()) {
      assert.deepEqual(
        tier.groups.map((group) => group.name),
        [...SPECIMEN_TIERS[index].groups],
        tier.name,
      );
    }
  });

  it("leaves no Primitives family empty", () => {
    const primitives = specimenTiers.find((tier) => tier.name === "Primitives");
    assert.ok(primitives, "the Primitives tier disappeared");
    for (const group of primitives.groups) {
      assert.notEqual(group.specimens.length, 0, group.name);
    }
  });

  it("flattens to exactly the non-empty groups, in rail order", () => {
    assert.deepEqual(
      specimenGroups.map((group) => group.name),
      specimenTiers
        .flatMap((tier) => tier.groups)
        .filter((group) => group.specimens.length > 0)
        .map((group) => group.name),
    );
    assert.equal(
      specimenGroups.reduce(
        (total, group) => total + group.specimens.length,
        0,
      ),
      specimens.length,
      "a specimen fell out of the rail",
    );
  });

  it("routes exactly the specimens the nav shows, in nav order", () => {
    assert.deepEqual(
      specimenIds,
      specimenGroups.flatMap((group) => group.specimens.map((one) => one.id)),
    );
    assert.equal(specimenIds.length, specimens.length);
  });

  it("opens on the Colors page, at the top of the rail", () => {
    assert.equal(DEFAULT_SPECIMEN_ID, "foundations-colors");
    assert.ok(
      specimenIds.includes(DEFAULT_SPECIMEN_ID),
      "the showcase opens on a page that is not routable",
    );
    assert.equal(SPECIMEN_TIERS[0].name, "Foundations");
    assert.equal(specimenIds[0], "foundations-colors");
  });

  it("counts components without counting the foundations pages", () => {
    const foundations = specimens.filter((one) => one.group === "Foundations");
    assert.notEqual(foundations.length, 0, "the Foundations group is empty");
    assert.equal(componentCount, specimens.length - foundations.length);
  });
});

function specimenModulePaths(): string[] {
  const root = fileURLToPath(new URL("../specimens", import.meta.url));
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name) && entry.name !== "index.ts")
        found.push(path);
    }
  };
  walk(root);
  return found.sort();
}

describe("the family folders", () => {
  it("leaves no specimen file out of the registry", async () => {
    const registered = new Set<unknown>(specimens);
    for (const path of specimenModulePaths()) {
      const module: Record<string, unknown> = await import(path);
      if (!("specimen" in module)) continue;
      assert.ok(
        registered.has(module.specimen),
        `${relative(process.cwd(), path)} exports a specimen that no family index.ts lists — add it to the index beside it`,
      );
    }
  });

  it("makes every specimen name the symbols it documents", async () => {
    for (const path of specimenModulePaths()) {
      const module: Record<string, unknown> = await import(path);
      if (!("specimen" in module)) continue;
      const where = relative(process.cwd(), path);
      const id = (module.specimen as { id: string }).id;
      const sources = module.sources;
      assert.ok(
        Array.isArray(sources),
        `${where} has no \`export const sources: string[]\``,
      );
      assert.ok(
        sources.length > 0 || id.startsWith("foundations-"),
        `${where} has an empty \`sources\` — name the @houston-ai symbols this page documents`,
      );
      for (const symbol of sources) {
        assert.equal(typeof symbol, "string", where);
        assert.notEqual(String(symbol).trim(), "", where);
      }
    }
  });
});

describe("every specimen renders", () => {
  for (const one of specimens) {
    it(`${one.group} → ${one.title}`, () => {
      const complaints: string[] = [];
      const consoleError = console.error;
      console.error = (...args: unknown[]) => {
        complaints.push(args.map(String).join(" "));
      };

      let html: string;
      try {
        html = renderToStaticMarkup(
          <SpecimenIdProvider id={one.id}>{one.render()}</SpecimenIdProvider>,
        );
      } finally {
        console.error = consoleError;
      }

      assert.deepEqual(complaints, [], `${one.id} warned while rendering`);
      assert.ok(
        html.length > 200,
        `${one.id} rendered ${html.length} characters — the page is empty`,
      );
    });
  }
});
