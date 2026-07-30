import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { loadSkillsManifest, normalizeSkillsManifest } from "./skills-manifest";

test("normalizes untrusted manifest fields into sorted unique slugs", () => {
  expect(
    normalizeSkillsManifest({
      version: 999,
      enabled: ["weekly-report", 42, "research-company", "weekly-report", null],
    }),
  ).toEqual({
    version: 1,
    enabled: ["research-company", "weekly-report"],
  });
  expect(normalizeSkillsManifest(null)).toEqual({ version: 1, enabled: [] });
  expect(normalizeSkillsManifest({ enabled: "research-company" })).toEqual({
    version: 1,
    enabled: [],
  });
});

test("a missing manifest loads as empty without a diagnostic", () => {
  const cwd = mkdtempSync(join(tmpdir(), "houston-manifest-"));
  const diagnostics: string[] = [];

  expect(
    loadSkillsManifest(cwd, (message) => diagnostics.push(message)),
  ).toEqual({
    version: 1,
    enabled: [],
  });
  expect(diagnostics).toEqual([]);
});

test("mangled JSON loads as empty and logs a diagnostic", () => {
  const cwd = mkdtempSync(join(tmpdir(), "houston-manifest-"));
  const manifestDir = join(cwd, ".houston", "skills-manifest");
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(join(manifestDir, "skills-manifest.json"), "{not-json");
  const diagnostics: string[] = [];

  expect(
    loadSkillsManifest(cwd, (message) => diagnostics.push(message)),
  ).toEqual({
    version: 1,
    enabled: [],
  });
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]).toContain("Ignoring invalid shared-skills manifest");
});
