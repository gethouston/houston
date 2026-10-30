import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  formatSkillsForPrompt,
  type LoadSkillsResult,
  loadSkillsFromDir,
} from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import {
  agentSkillsOverride,
  indexLine,
  skillsForPrompt,
} from "./prompt-skills";
import { buildAgentLoader } from "./resource-loader";

function seedSkill(skillsDir: string, slug: string, name: string): void {
  const dir = join(skillsDir, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: The ${name} procedure\n---\n\nDo it.\n`,
  );
}

/** Folder names sort opposite to skill names, so neither order is an accident. */
function seedSkills(skillsDir: string): void {
  seedSkill(skillsDir, "a-folder", "zeta-report");
  seedSkill(skillsDir, "m-folder", "mid-intake");
  seedSkill(skillsDir, "z-folder", "alpha-brief");
}

const reversed = (result: LoadSkillsResult): LoadSkillsResult => ({
  ...result,
  skills: [...result.skills].reverse(),
});

test("two directory read orders give pi a byte-identical skills section", () => {
  const skillsDir = join(mkdtempSync(join(tmpdir(), "prompt-skills-")), "s");
  seedSkills(skillsDir);
  const loaded = loadSkillsFromDir({ dir: skillsDir, source: "path" });
  const override = agentSkillsOverride(null, new Set());

  const asRead = override(loaded);
  const otherOrder = override(reversed(loaded));

  // pi renders its <available_skills> section with exactly this formatter.
  expect(formatSkillsForPrompt(otherOrder.skills)).toBe(
    formatSkillsForPrompt(asRead.skills),
  );
  expect(asRead.skills.map((skill) => skill.name)).toEqual([
    "alpha-brief",
    "mid-intake",
    "zeta-report",
  ]);
});

test("the shared-skill filter still applies before the sort", () => {
  const parent = mkdtempSync(join(tmpdir(), "prompt-skills-"));
  const localDir = join(parent, "local");
  const sharedDir = join(parent, "shared");
  seedSkill(localDir, "local-one", "zeta-local");
  seedSkill(localDir, "local-two", "dup-name");
  seedSkill(sharedDir, "shared-on", "alpha-shared");
  seedSkill(sharedDir, "shared-off", "beta-shared");
  seedSkill(sharedDir, "shared-dup", "dup-name");
  const loaded: LoadSkillsResult = {
    skills: [
      ...loadSkillsFromDir({ dir: localDir, source: "path" }).skills,
      ...loadSkillsFromDir({ dir: sharedDir, source: "path" }).skills,
    ],
    diagnostics: [],
  };
  // The loader hands the override a realpath, as buildAgentLoader does.
  const override = agentSkillsOverride(
    realpathSync(sharedDir),
    new Set(["alpha-shared", "dup-name"]),
  );

  const kept = override(reversed(loaded)).skills;
  // Enabled shared skills load; a disabled one and one a local skill shadows
  // do not.
  expect(kept.map((skill) => [skill.name, skill.filePath])).toEqual([
    ["alpha-shared", join(sharedDir, "shared-on", "SKILL.md")],
    ["dup-name", join(localDir, "local-two", "SKILL.md")],
    ["zeta-local", join(localDir, "local-one", "SKILL.md")],
  ]);
  expect(override(loaded).skills).toEqual(kept);
});

test("skills that share a name are ordered by path", () => {
  const skills = [
    { name: "same", filePath: "/b/SKILL.md", description: "B." },
    { name: "same", filePath: "/a/SKILL.md", description: "A." },
  ];
  expect(skillsForPrompt(skills).map((skill) => skill.filePath)).toEqual([
    "/a/SKILL.md",
    "/b/SKILL.md",
  ]);
  // The input is left as the loader returned it.
  expect(skills[0]?.filePath).toBe("/b/SKILL.md");
});

test("the agent loader hands pi its skills in name order", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "prompt-skills-ws-"));
  const skillsDir = join(cwd, ".agents", "skills");
  seedSkills(skillsDir);
  const loader = buildAgentLoader({
    cwd,
    skillsDir,
    systemPrompt: "You are Houston.",
  });
  await loader.reload();

  expect(loader.getSkills().skills.map((skill) => skill.name)).toEqual([
    "alpha-brief",
    "mid-intake",
    "zeta-report",
  ]);
});

test("the index carries a skill's first sentence, its full text left on disk", () => {
  const skills = [
    {
      name: "close-my-month",
      filePath: "/s/close-my-month/SKILL.md",
      description:
        "Run a full monthly close end-to-end.\n  Reconciles every account. Drafts entries.",
    },
  ];
  expect(skillsForPrompt(skills)[0]?.description).toBe(
    "Run a full monthly close end-to-end.",
  );
  expect(skills[0]?.description).toContain("Drafts entries.");
});

test("a sentence break needs a capital after it, so abbreviations and lists stay whole", () => {
  expect(
    indexLine("Tag spend for Section 174 (e.g. contractors). Then file."),
  ).toBe("Tag spend for Section 174 (e.g. contractors).");
  expect(indexLine("Revisa tus gastos. ¿Qué cambió?")).toBe(
    "Revisa tus gastos.",
  );
});

test("an overlong first sentence is cut at a word boundary under 200 characters", () => {
  const long = `Assemble a board-ready pack: ${"cash, burn, runway, revenue, ".repeat(10)}and more.`;
  const line = indexLine(long);
  expect(line.length).toBeLessThanOrEqual(201);
  expect(line.endsWith("…")).toBe(true);
  expect(line).toMatch(
    /^Assemble a board-ready pack: cash, burn, runway, revenue/,
  );
  expect(line).not.toMatch(/[\s,]…$/);
});
