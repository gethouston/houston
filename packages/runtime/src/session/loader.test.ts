import { test, expect } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAgentLoader } from "./resource-loader";

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
  const dir = join(ws, ".agents", "skills", slug);
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

const loaderFor = (ws: string) =>
  buildAgentLoader({
    cwd: ws,
    skillsDir: join(ws, ".agents", "skills"),
    systemPrompt: "You are Houston.",
  });

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
