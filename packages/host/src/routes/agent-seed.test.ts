import { expect, test } from "vitest";
import { MemoryVfs } from "../vfs";
import { asSeedRecord, safeSeedKey, writeAgentSeeds } from "./agent-seed";

test("safeSeedKey accepts normal relative keys", () => {
  expect(safeSeedKey(".agents/skills/categorize/SKILL.md")).toBe(
    ".agents/skills/categorize/SKILL.md",
  );
  expect(safeSeedKey("outputs.json")).toBe("outputs.json");
  expect(safeSeedKey(".houston/routines/routines.json")).toBe(
    ".houston/routines/routines.json",
  );
});

test("safeSeedKey rejects anything that could escape the root", () => {
  for (const bad of [
    "",
    "/etc/passwd",
    "../secrets",
    "a/../../b",
    "a/./b",
    "a//b",
    "a\\b",
    "a\0b",
  ]) {
    expect(safeSeedKey(bad), bad).toBeNull();
  }
});

test("writeAgentSeeds writes CLAUDE.md and every seed under the root", async () => {
  const vfs = new MemoryVfs();
  await writeAgentSeeds(vfs, "Work/Bookkeeping", {
    claudeMd: "# Bookkeeper",
    seeds: {
      "outputs.json": "[]",
      ".agents/skills/close-the-books/SKILL.md": "---\nname: Close\n---\nbody",
    },
  });
  expect(await vfs.readText("Work/Bookkeeping/CLAUDE.md")).toBe("# Bookkeeper");
  expect(await vfs.readText("Work/Bookkeeping/outputs.json")).toBe("[]");
  expect(
    await vfs.readText(
      "Work/Bookkeeping/.agents/skills/close-the-books/SKILL.md",
    ),
  ).toContain("name: Close");
});

test("writeAgentSeeds throws on a traversal key and does not write it", async () => {
  const vfs = new MemoryVfs();
  await expect(
    writeAgentSeeds(vfs, "Work/A", { seeds: { "../../evil": "x" } }),
  ).rejects.toThrow(/unsafe seed path/);
  expect(await vfs.readText("Work/evil")).toBeNull();
});

test("writeAgentSeeds is a no-op when nothing is supplied", async () => {
  const vfs = new MemoryVfs();
  await writeAgentSeeds(vfs, "Work/A", {});
  expect(await vfs.readText("Work/A/CLAUDE.md")).toBeNull();
});

test("writeAgentSeeds stamps the creator on seeded routines that carry none", async () => {
  const vfs = new MemoryVfs();
  const routines = [
    { id: "r1", name: "Brief", prompt: "p", schedule: "0 9 * * *" },
    { id: "r2", name: "Kept", prompt: "p", created_by: "someone-else" },
  ];
  await writeAgentSeeds(
    vfs,
    "Work/A",
    {
      seeds: { ".houston/routines/routines.json": JSON.stringify(routines) },
    },
    "creator-sub",
  );
  const written = JSON.parse(
    (await vfs.readText("Work/A/.houston/routines/routines.json")) ?? "",
  ) as { created_by?: string }[];
  expect(written.map((r) => r.created_by)).toEqual([
    "creator-sub",
    "someone-else",
  ]);
});

test("writeAgentSeeds leaves non-routine seeds and malformed routine docs verbatim", async () => {
  const vfs = new MemoryVfs();
  await writeAgentSeeds(
    vfs,
    "Work/A",
    {
      seeds: {
        // Not the routines doc: never parsed, never stamped.
        "outputs.json": JSON.stringify([{ id: "x" }]),
        // Malformed routines doc: stored verbatim so the read path reports it.
        ".houston/routines/routines.json": "{not json",
      },
    },
    "creator-sub",
  );
  expect(await vfs.readText("Work/A/outputs.json")).toBe(
    JSON.stringify([{ id: "x" }]),
  );
  expect(await vfs.readText("Work/A/.houston/routines/routines.json")).toBe(
    "{not json",
  );
});

test("writeAgentSeeds leaves routines untouched when no creator is known", async () => {
  const vfs = new MemoryVfs();
  const doc = JSON.stringify([{ id: "r1", name: "n", prompt: "p" }]);
  await writeAgentSeeds(vfs, "Work/A", {
    seeds: { ".houston/routines/routines.json": doc },
  });
  expect(await vfs.readText("Work/A/.houston/routines/routines.json")).toBe(
    doc,
  );
});

test("asSeedRecord accepts a string map and rejects non-string values", () => {
  expect(asSeedRecord({ a: "1", b: "2" })).toEqual({ a: "1", b: "2" });
  expect(asSeedRecord({ a: 1 })).toBeNull();
  expect(asSeedRecord(["a"])).toBeNull();
  expect(asSeedRecord(null)).toBeNull();
  expect(asSeedRecord("nope")).toBeNull();
});
