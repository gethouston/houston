import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { buildSystemPrompt } from "./system-prompt";

function freshWorkspace(withHouston = true): string {
  const dir = mkdtempSync(join(tmpdir(), "houston-sysprompt-"));
  if (withHouston) mkdirSync(join(dir, ".houston"), { recursive: true });
  return dir;
}

test("the workspace/user context section is appended to the system prompt", () => {
  const dir = freshWorkspace();
  writeFileSync(join(dir, "CLAUDE.md"), "# Role\nYou are the sales agent.");
  writeFileSync(join(dir, "WORKSPACE.md"), "Acme Corp.");
  writeFileSync(join(dir, "USER.md"), "Juan, sales lead.");

  const prompt = buildSystemPrompt(dir, "You are Houston.");
  // Base prompt, then the CLAUDE.md instructions, then the context section.
  expect(prompt).toContain("You are Houston.");
  expect(prompt).toContain("You are the sales agent.");
  expect(prompt).toContain("# Workspace Context");
  expect(prompt).toContain("Acme Corp.");
  expect(prompt).toContain("# User Context");
  expect(prompt).toContain("Juan, sales lead.");
});

test("the section renders with empty markers even when no context is written", () => {
  const dir = freshWorkspace();
  const prompt = buildSystemPrompt(dir, "You are Houston.");
  expect(prompt).toContain("# Workspace Context");
  expect(prompt).toContain("(empty so far");
});

test("a non-workspace cwd gets only the base prompt (no context section)", () => {
  const dir = freshWorkspace(false);
  const prompt = buildSystemPrompt(dir, "You are Houston.");
  expect(prompt).toBe("You are Houston.");
});

function writeSkill(dir: string, slug: string, frontmatter: string): void {
  const skillDir = join(dir, ".agents", "skills", slug);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\n${frontmatter}\n---\n\n## Procedure\nDo the thing.\n`,
  );
}

test("workspace skills are indexed with their SKILL.md locations (HOU-894)", () => {
  const dir = freshWorkspace();
  writeSkill(
    dir,
    "marketing-report",
    "name: marketing-report\ndescription: Weekly marketing report with brand guidelines",
  );

  const prompt = buildSystemPrompt(dir, "You are Houston.");
  expect(prompt).toContain("<available_skills>");
  expect(prompt).toContain("<name>marketing-report</name>");
  expect(prompt).toContain("Weekly marketing report with brand guidelines");
  // The location is the absolute path the Read tool loads the procedure from.
  expect(prompt).toContain(
    join(dir, ".agents", "skills", "marketing-report", "SKILL.md"),
  );
});

test("no skills directory means no skills section", () => {
  const dir = freshWorkspace();
  const prompt = buildSystemPrompt(dir, "You are Houston.");
  expect(prompt).not.toContain("<available_skills>");
});

test("a skill without a description is dropped (pi loader parity)", () => {
  const dir = freshWorkspace();
  writeSkill(dir, "bare-skill", "name: bare-skill");
  writeSkill(dir, "good-skill", "name: good-skill\ndescription: A real one");

  const prompt = buildSystemPrompt(dir, "You are Houston.");
  expect(prompt).toContain("<name>good-skill</name>");
  expect(prompt).not.toContain("bare-skill");
});

test("the skills index lands before the mode overlay", () => {
  const dir = freshWorkspace();
  writeSkill(dir, "plan-me", "name: plan-me\ndescription: Plan something");

  const prompt = buildSystemPrompt(dir, "You are Houston.", "plan");
  const skillsAt = prompt.indexOf("<available_skills>");
  const overlayAt = prompt.indexOf("You are in Plan mode.");
  expect(skillsAt).toBeGreaterThan(-1);
  expect(overlayAt).toBeGreaterThan(skillsAt);
});

test("group context is appended after the workspace/user section", () => {
  const dir = freshWorkspace();
  writeFileSync(join(dir, "WORKSPACE.md"), "Acme Corp.");
  writeFileSync(join(dir, "GROUP.md"), "Q3 launch squad.");

  const prompt = buildSystemPrompt(dir, "You are Houston.");
  expect(prompt).toContain("# Workspace Context");
  expect(prompt).toContain("# Group Context");
  expect(prompt).toContain("Q3 launch squad.");
  // Ordering: base prompt → workspace/user context → group context.
  expect(prompt.indexOf("# Group Context")).toBeGreaterThan(
    prompt.indexOf("# Workspace Context"),
  );
});
