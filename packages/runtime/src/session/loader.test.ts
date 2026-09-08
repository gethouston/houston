import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ASSISTANT_AGENT_NAME } from "@houston/host/src/routes/assistant";
import { expect, test, vi } from "vitest";
import { learningsDocPath } from "./learnings-context";
import { buildAgentLoader, makeAgentLoader } from "./resource-loader";

/**
 * The loader is the seam deciding what an agent sees: OUR system prompt, the
 * workspace's OWN context file, and SKILL.md skills from the workspace's
 * skills dir — and nothing else from disk. Two invariants matter:
 *  - Houston's existing .agents/skills/<slug>/SKILL.md layout loads AS-IS
 *    (the convergence bet: no skills migration).
 *  - Context files come from the workspace root ONLY. pi's own discovery walks
 *    every ancestor up to /, which would leak files from outside the clamp.
 */

function freshWorkspace(): { parent: string; ws: string } {
  const parent = mkdtempSync(join(tmpdir(), "houston-loader-"));
  const ws = join(parent, "agent-ws");
  mkdirSync(ws, { recursive: true });
  return { parent, ws };
}

function seedSkill(
  ws: string,
  slug: string,
  name: string,
  description: string,
) {
  seedSkillAt(join(ws, ".agents", "skills"), slug, name, description);
}

function seedSkillAt(
  skillsDir: string,
  slug: string,
  name: string,
  description: string,
) {
  const dir = join(skillsDir, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      `description: ${description}`,
      "category: research", // Houston-specific frontmatter must be tolerated
      "featured: yes",
      "image: magnifying-glass-tilted-left",
      "---",
      "",
      "## Procedure",
      "Step one. Step two.",
    ].join("\n"),
  );
}

const loaderFor = (ws: string, sharedSkillsDir?: string) =>
  buildAgentLoader({
    cwd: ws,
    skillsDir: join(ws, ".agents", "skills"),
    sharedSkillsDir,
    systemPrompt: "You are Houston.",
  });

function writeManifest(ws: string, enabled: unknown) {
  const dir = join(ws, ".houston", "skills-manifest");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "skills-manifest.json"),
    JSON.stringify({ version: 1, enabled }),
  );
}

test("Houston's existing .agents/skills SKILL.md layout loads as-is", async () => {
  const { ws } = freshWorkspace();
  seedSkill(
    ws,
    "research-company",
    "research-company",
    "Deep-dive on a company",
  );
  seedSkill(ws, "weekly-report", "weekly-report", "Write the weekly report");

  const loader = loaderFor(ws);
  await loader.reload();

  const { skills, diagnostics } = loader.getSkills();
  const names = skills.map((s) => s.name).sort();
  expect(names).toEqual(["research-company", "weekly-report"]);
  expect(skills[0]?.description).toBeTruthy();
  expect(diagnostics).toHaveLength(0);
});

test("workspace CLAUDE.md is the context file; ancestor context files do NOT leak", async () => {
  const { parent, ws } = freshWorkspace();
  writeFileSync(join(ws, "CLAUDE.md"), "# Role\nYou are the sales agent.");
  // A context file OUTSIDE the workspace — pi's own walk would pick this up.
  writeFileSync(join(parent, "CLAUDE.md"), "LEAKED ancestor context");

  const loader = loaderFor(ws);
  await loader.reload();

  const { agentsFiles } = loader.getAgentsFiles();
  expect(agentsFiles).toHaveLength(1);
  expect(agentsFiles[0]?.path).toBe(join(ws, "CLAUDE.md"));
  expect(agentsFiles[0]?.content).toContain("sales agent");
  expect(JSON.stringify(agentsFiles)).not.toContain("LEAKED");
});

test("AGENTS.md wins over CLAUDE.md (pi's own precedence), root only", async () => {
  const { ws } = freshWorkspace();
  writeFileSync(join(ws, "AGENTS.md"), "agents-file");
  writeFileSync(join(ws, "CLAUDE.md"), "claude-file");

  const loader = loaderFor(ws);
  await loader.reload();

  const { agentsFiles } = loader.getAgentsFiles();
  expect(agentsFiles).toHaveLength(1);
  expect(agentsFiles[0]?.content).toBe("agents-file");
});

test("no skills dir, no context file: loader stays empty (nothing discovered from disk)", async () => {
  const { ws } = freshWorkspace();
  const loader = loaderFor(ws);
  await loader.reload();

  expect(loader.getSkills().skills).toHaveLength(0);
  expect(loader.getAgentsFiles().agentsFiles).toHaveLength(0);
  expect(loader.getSystemPrompt()).toBe("You are Houston.");
});

test("the compaction guard loads as an inline extension despite noExtensions (HOU-709)", async () => {
  const { ws } = freshWorkspace();
  const loader = loaderFor(ws);
  await loader.reload();

  const { extensions, errors } = loader.getExtensions();
  expect(errors).toHaveLength(0);
  // The guard is the ONE inline factory; it must survive noExtensions (which
  // only gates on-disk discovery) and register the compaction handler.
  expect(extensions).toHaveLength(1);
  expect(extensions[0]?.handlers.has("session_before_compact")).toBe(true);
});

test("an enabled workspace-shared skill loads", async () => {
  const { parent, ws } = freshWorkspace();
  const sharedSkillsDir = join(parent, ".shared", "skills");
  seedSkillAt(
    sharedSkillsDir,
    "research-company",
    "research-company",
    "Shared company research",
  );
  writeManifest(ws, ["research-company"]);

  const loader = loaderFor(ws, sharedSkillsDir);
  await loader.reload();

  expect(loader.getSkills().skills.map((skill) => skill.name)).toEqual([
    "research-company",
  ]);
});

test("a workspace-shared skill not enabled in the manifest is dropped", async () => {
  const { parent, ws } = freshWorkspace();
  const sharedSkillsDir = join(parent, ".shared", "skills");
  seedSkillAt(
    sharedSkillsDir,
    "research-company",
    "research-company",
    "Shared company research",
  );
  writeManifest(ws, ["another-skill"]);

  const loader = loaderFor(ws, sharedSkillsDir);
  await loader.reload();

  expect(loader.getSkills().skills).toEqual([]);
});

test("an agent-local skill shadows an enabled shared skill with the same name", async () => {
  const { parent, ws } = freshWorkspace();
  const sharedSkillsDir = join(parent, ".shared", "skills");
  seedSkill(
    ws,
    "research-company",
    "research-company",
    "Agent-local company research",
  );
  seedSkillAt(
    sharedSkillsDir,
    "research-company",
    "research-company",
    "Shared company research",
  );
  writeManifest(ws, ["research-company"]);

  const loader = loaderFor(ws, sharedSkillsDir);
  await loader.reload();

  const { skills } = loader.getSkills();
  expect(skills).toHaveLength(1);
  expect(skills[0]?.description).toBe("Agent-local company research");
  expect(skills[0]?.filePath).toContain(join(ws, ".agents", "skills"));
});

test("a missing manifest loads no workspace-shared skills", async () => {
  const { parent, ws } = freshWorkspace();
  const sharedSkillsDir = join(parent, ".shared", "skills");
  seedSkillAt(
    sharedSkillsDir,
    "research-company",
    "research-company",
    "Shared company research",
  );

  const loader = loaderFor(ws, sharedSkillsDir);
  await loader.reload();

  expect(loader.getSkills().skills).toEqual([]);
});

test("a mangled manifest logs a diagnostic and does not crash loader reload", async () => {
  const { parent, ws } = freshWorkspace();
  const sharedSkillsDir = join(parent, ".shared", "skills");
  seedSkillAt(
    sharedSkillsDir,
    "research-company",
    "research-company",
    "Shared company research",
  );
  const manifestDir = join(ws, ".houston", "skills-manifest");
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(join(manifestDir, "skills-manifest.json"), "{not-json");
  const diagnostic = vi.spyOn(console, "warn").mockImplementation(() => {});

  try {
    const loader = loaderFor(ws, sharedSkillsDir);
    await expect(loader.reload()).resolves.toBeUndefined();
    expect(loader.getSkills().skills).toEqual([]);
    expect(diagnostic).toHaveBeenCalledOnce();
  } finally {
    diagnostic.mockRestore();
  }
});

/**
 * The assistant's memory injection, pinned on the pi side of the prompt-assembly
 * parity pair (its twin is backends/claude/system-prompt.test.ts).
 */
function agentDirNamed(name: string): string {
  const dir = join(mkdtempSync(join(tmpdir(), "houston-loader-")), name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function seedLearnings(cwd: string, text: string): void {
  const path = learningsDocPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify([
      { id: "l1", text, created_at: "2026-01-01T00:00:00.000Z" },
    ]),
  );
}

async function promptFor(cwd: string, mode?: "plan"): Promise<string> {
  const loader = makeAgentLoader(cwd, mode);
  await loader.reload();
  return loader.getSystemPrompt() ?? "";
}

test("makeAgentLoader injects the assistant's memory, with the mode overlay LAST", async () => {
  const cwd = agentDirNamed(ASSISTANT_AGENT_NAME);
  seedLearnings(cwd, "Julian prefers short replies.");

  const prompt = await promptFor(cwd, "plan");
  const memoryAt = prompt.indexOf("# What you remember about this user");
  expect(memoryAt).toBeGreaterThan(-1);
  expect(prompt).toContain("- Julian prefers short replies.");
  // Ordering: workspace/user context → memory → mode overlay.
  expect(memoryAt).toBeGreaterThan(prompt.indexOf("# Workspace Context"));
  expect(prompt.indexOf("You are in Plan mode.")).toBeGreaterThan(memoryAt);
});

test("makeAgentLoader puts the assistant's operating rules after its memory", async () => {
  const cwd = agentDirNamed(ASSISTANT_AGENT_NAME);
  seedLearnings(cwd, "Julian prefers short replies.");

  const prompt = await promptFor(cwd, "plan");
  const memoryAt = prompt.indexOf("# What you remember about this user");
  const rulesAt = prompt.indexOf("# How you operate in Houston");
  expect(rulesAt).toBeGreaterThan(memoryAt);
  expect(prompt.indexOf("You are in Plan mode.")).toBeGreaterThan(rulesAt);
});

test("the rules are injected for the assistant with no memory yet", async () => {
  const prompt = await promptFor(agentDirNamed(ASSISTANT_AGENT_NAME));
  expect(prompt).toContain("# How you operate in Houston");
});

test("makeAgentLoader omits the operating rules for a normal agent", async () => {
  const prompt = await promptFor(agentDirNamed("Helper"));
  expect(prompt).not.toContain("# How you operate in Houston");
});

test("makeAgentLoader omits the memory section for a normal agent", async () => {
  const cwd = agentDirNamed("Helper");
  seedLearnings(cwd, "Julian prefers short replies.");

  const prompt = await promptFor(cwd);
  expect(prompt).not.toContain("# What you remember about this user");
  expect(prompt).not.toContain("Julian prefers short replies.");
});

test("the shared-skills manifest is read once when the loader is built", async () => {
  const { parent, ws } = freshWorkspace();
  const sharedSkillsDir = join(parent, ".shared", "skills");
  seedSkillAt(
    sharedSkillsDir,
    "research-company",
    "research-company",
    "Shared company research",
  );
  writeManifest(ws, ["research-company"]);

  const loader = loaderFor(ws, sharedSkillsDir);
  writeManifest(ws, []);
  await loader.reload();

  expect(loader.getSkills().skills.map((skill) => skill.name)).toEqual([
    "research-company",
  ]);
});
