import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LoadSkillsFromDirOptions } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test, vi } from "vitest";
import { buildSystemPrompt } from "./system-prompt";

const readOrder = vi.hoisted(() => ({ reversed: false }));

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return {
    ...actual,
    loadSkillsFromDir: (options: LoadSkillsFromDirOptions) => {
      const loaded = actual.loadSkillsFromDir(options);
      return readOrder.reversed
        ? { ...loaded, skills: [...loaded.skills].reverse() }
        : loaded;
    },
  };
});

afterEach(() => {
  readOrder.reversed = false;
});

function workspaceWithSkills(): string {
  const dir = mkdtempSync(join(tmpdir(), "houston-skill-order-"));
  mkdirSync(join(dir, ".houston"), { recursive: true });
  for (const [slug, name] of [
    ["a-folder", "zeta-report"],
    ["m-folder", "mid-intake"],
    ["z-folder", "alpha-brief"],
  ]) {
    const skillDir = join(dir, ".agents", "skills", slug);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      `---\nname: ${name}\ndescription: The ${name} procedure\n---\n\nDo it.\n`,
    );
  }
  return dir;
}

test("two directory read orders produce a byte-identical Claude system prompt", () => {
  const dir = workspaceWithSkills();
  const asRead = buildSystemPrompt(dir, "You are Houston.");
  readOrder.reversed = true;
  const reversed = buildSystemPrompt(dir, "You are Houston.");

  expect(reversed).toBe(asRead);
  const names = [...asRead.matchAll(/<name>([^<]+)<\/name>/g)].map(
    (match) => match[1],
  );
  expect(names).toEqual(["alpha-brief", "mid-intake", "zeta-report"]);
});
