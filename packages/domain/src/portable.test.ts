import type { Learning, Routine } from "@houston/protocol";
import { expect, test } from "vitest";
import {
  type PortableContent,
  packAgent,
  portableInventory,
  unpackAgent,
} from "./portable";
import { filterPackage, packageSeed } from "./portable-edit";
import { createRoutine } from "./routines";

/**
 * The `.houstonagent` round-trip: what you pack is what you unpack, and the
 * preview reflects it. The format is the share contract — local↔cloud identical.
 */

const NOW = "2026-06-13T00:00:00.000Z";

const skillBody = (slug: string, desc: string) =>
  `---\nname: ${slug}\ndescription: ${desc}\n---\n\n## Procedure\nDo it.\n`;

function content(): PortableContent {
  return {
    claudeMd: "# Role\nYou are the sales agent.",
    skills: [
      {
        slug: "research",
        body: skillBody("research", "Deep-dive on a company"),
      },
      { slug: "weekly", body: skillBody("weekly", "Write the weekly report") },
    ],
    routines: [
      createRoutine(
        { name: "Daily", prompt: "check", schedule: "0 9 * * *" },
        "r1",
        NOW,
      ),
    ],
    learnings: [
      { id: "l1", text: "The user prefers concise updates.", created_at: NOW },
    ],
  };
}

const meta = {
  agentName: "Sales",
  description: "A sales helper",
  houstonVersion: "0.5.0",
};

test("pack → unpack round-trips every part", () => {
  const bytes = packAgent(content(), meta, NOW);
  const pkg = unpackAgent(bytes);

  expect(pkg.manifest).toMatchObject({
    agentName: "Sales",
    houstonVersion: "0.5.0",
    formatVersion: 1,
  });
  expect(pkg.claudeMd).toContain("sales agent");
  expect(pkg.skills.map((s) => s.slug)).toEqual(["research", "weekly"]);
  expect(pkg.routines.map((r) => r.id)).toEqual(["r1"]);
  expect(pkg.learnings.map((l) => l.id)).toEqual(["l1"]);
});

test("a shared routine carries its provider/model/effort pins", () => {
  const pinned: PortableContent = {
    skills: [],
    learnings: [],
    routines: [
      createRoutine(
        {
          name: "Nightly",
          prompt: "check",
          schedule: "0 2 * * *",
          provider: "openai",
          model: "gpt-5.5",
          effort: "high",
        },
        "r1",
        NOW,
      ),
    ],
  };
  const pkg = unpackAgent(packAgent(pinned, meta, NOW));
  expect(pkg.routines[0]).toMatchObject({
    provider: "openai",
    model: "gpt-5.5",
    effort: "high",
  });
});

test("the inventory preview reflects what's inside (skill descriptions from frontmatter)", () => {
  const pkg = unpackAgent(packAgent(content(), meta, NOW));
  const inv = portableInventory(pkg);
  expect(inv.hasClaudeMd).toBe(true);
  expect(inv.skills).toEqual([
    { slug: "research", description: "Deep-dive on a company" },
    { slug: "weekly", description: "Write the weekly report" },
  ]);
  expect(inv.routines).toEqual([
    { id: "r1", name: "Daily", schedule: "0 9 * * *" },
  ]);
  expect(inv.learnings).toEqual([
    { id: "l1", text: "The user prefers concise updates." },
  ]);
});

test("an empty selection packs just the manifest", () => {
  const empty: PortableContent = { skills: [], routines: [], learnings: [] };
  const pkg = unpackAgent(packAgent(empty, meta, NOW));
  expect(pkg.claudeMd).toBeUndefined();
  expect(pkg.skills).toEqual([]);
  expect(portableInventory(pkg).hasClaudeMd).toBe(false);
});

test("a CLAUDE.md-only agent (no skills/routines) round-trips", () => {
  const c: PortableContent = {
    claudeMd: "just instructions",
    skills: [],
    routines: [],
    learnings: [],
  };
  const pkg = unpackAgent(packAgent(c, meta, NOW));
  expect(pkg.claudeMd).toBe("just instructions");
});

test("unpacking junk bytes throws a clear error", () => {
  expect(() => unpackAgent(new Uint8Array([1, 2, 3, 4]))).toThrow(
    "not a valid .houstonagent",
  );
});

test("a future format version is rejected with an upgrade hint", () => {
  // Hand-build a zip whose manifest claims a newer format.
  const { zipSync, strToU8 } = require("fflate");
  const bytes = zipSync({
    "manifest.json": strToU8(
      JSON.stringify({
        agentName: "X",
        houstonVersion: "9",
        createdAt: NOW,
        formatVersion: 99,
      }),
    ),
  });
  expect(() => unpackAgent(bytes)).toThrow("newer Houston");
});

test("malformed routine/learning entries are dropped on unpack", () => {
  const { zipSync, strToU8 } = require("fflate");
  const bytes = zipSync({
    "manifest.json": strToU8(
      JSON.stringify({
        agentName: "X",
        houstonVersion: "1",
        createdAt: NOW,
        formatVersion: 1,
      }),
    ),
    "routines.json": strToU8(
      // Unpack applies the SAME normalization as the store's read path, so a
      // "valid" entry here is one normalizeRoutines keeps: identity (id, name,
      // prompt) plus exactly one wake mechanism.
      JSON.stringify([
        { id: "ok", name: "R", prompt: "p", schedule: "* * * * *" },
        { junk: true },
      ]),
    ),
    "learnings.json": strToU8(JSON.stringify(["not an object"])),
  });
  const pkg = unpackAgent(bytes);
  expect(pkg.routines.map((r: Routine) => r.id)).toEqual(["ok"]);
  expect(pkg.learnings as Learning[]).toEqual([]);
});

test("filterPackage keeps only the selected parts", () => {
  const pkg = unpackAgent(
    packAgent(content(), { agentName: "Sales", houstonVersion: "0.5.0" }, NOW),
  );
  const filtered = filterPackage(pkg, {
    includeClaudeMd: false,
    skillSlugs: ["weekly"],
    routineIds: [],
    learningIds: ["l1", "does-not-exist"],
  });
  expect(filtered.claudeMd).toBeUndefined();
  expect(filtered.skills.map((s) => s.slug)).toEqual(["weekly"]);
  expect(filtered.routines).toEqual([]);
  expect(filtered.learnings.map((l) => l.id)).toEqual(["l1"]);
  expect(filtered.manifest).toEqual(pkg.manifest);
});

test("filterPackage with everything selected is the identity", () => {
  const pkg = unpackAgent(
    packAgent(content(), { agentName: "Sales", houstonVersion: "0.5.0" }, NOW),
  );
  const filtered = filterPackage(pkg, {
    includeClaudeMd: true,
    skillSlugs: pkg.skills.map((s) => s.slug),
    routineIds: pkg.routines.map((r) => r.id),
    learningIds: pkg.learnings.map((l) => l.id),
  });
  expect(filtered).toEqual(pkg);
});

test("packageSeed lays content out exactly like a direct install", () => {
  const c = content();
  const seed = packageSeed(c);

  expect(seed.claudeMd).toBe(c.claudeMd);
  expect(Object.keys(seed.seeds).sort()).toEqual([
    ".agents/skills/research/SKILL.md",
    ".agents/skills/weekly/SKILL.md",
    ".houston/learnings/learnings.json",
    ".houston/routines/routines.json",
  ]);
  expect(seed.seeds[".agents/skills/research/SKILL.md"]).toBe(
    c.skills[0]?.body,
  );
  // The JSON docs are the canonical on-disk form and parse back to the items.
  expect(
    JSON.parse(seed.seeds[".houston/routines/routines.json"] ?? ""),
  ).toEqual(c.routines);
  expect(
    JSON.parse(seed.seeds[".houston/learnings/learnings.json"] ?? ""),
  ).toEqual(c.learnings);
  expect(seed.seeds[".houston/routines/routines.json"]?.endsWith("\n")).toBe(
    true,
  );
});

test("packageSeed omits what the package lacks (no empty docs, no CLAUDE.md key)", () => {
  const seed = packageSeed({ skills: [], routines: [], learnings: [] });
  expect(seed).toEqual({ seeds: {} });
  expect("claudeMd" in seed).toBe(false);
});

test("unpack drops an invalid imported routine instead of letting it install-then-vanish", () => {
  // An entry the store's read path would drop (here: no wake mechanism at all)
  // must not survive unpack — otherwise it shows in the install preview, gets
  // seeded to disk, and silently disappears on the first read after install.
  const wakeLess = {
    ...createRoutine(
      { name: "Broken", prompt: "p", schedule: "0 9 * * *" },
      "r-bad",
      NOW,
    ),
  } as Record<string, unknown>;
  delete wakeLess.schedule;
  const bytes = packAgent(
    {
      skills: [],
      learnings: [],
      routines: [
        createRoutine(
          { name: "Good", prompt: "p", schedule: "0 9 * * *" },
          "r-ok",
          NOW,
        ),
        wakeLess as unknown as Routine,
      ],
    },
    meta,
    NOW,
  );
  const pkg = unpackAgent(bytes);
  expect(pkg.routines.map((r) => r.id)).toEqual(["r-ok"]);
  expect(portableInventory(pkg).routines.map((r) => r.id)).toEqual(["r-ok"]);
});

test("machine/account-local routine keys never cross the share boundary", () => {
  // `setup_activity_id` points at an activity that only exists on the exporter's
  // machine; `created_by` is the exporter's account sub (who a fired routine
  // acts as). Both are stripped at pack AND at unpack (older packs carry them).
  const local = createRoutine(
    {
      name: "Daily",
      prompt: "check",
      schedule: "0 9 * * *",
      setup_activity_id: "act-1",
    },
    "r1",
    NOW,
    "exporter-sub",
  );
  const pkg = unpackAgent(
    packAgent({ skills: [], learnings: [], routines: [local] }, meta, NOW),
  );
  const shared = pkg.routines[0] as unknown as
    | Record<string, unknown>
    | undefined;
  expect(shared?.id).toBe("r1");
  expect(shared && "setup_activity_id" in shared).toBe(false);
  expect(shared && "created_by" in shared).toBe(false);
});
