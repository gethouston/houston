import { expect, test } from "vitest";
import { sharedSkillsDirKey } from "./layout";
import { loadSkillsFromDir, skillKeyInDir } from "./skills";
import {
  EMPTY_SKILLS_MANIFEST,
  loadSkillsManifest,
  normalizeSkillsManifest,
  saveSkillsManifest,
  skillsManifestKey,
  withSharedSkill,
} from "./skills-manifest";
import type { FileStore } from "./store";

function memStore(): FileStore {
  const m = new Map<string, string>();
  return {
    async readText(key) {
      return m.get(key) ?? null;
    },
    async writeText(key, content) {
      m.set(key, content);
    },
    async list(prefix) {
      return [...m.keys()].filter((k) => k.startsWith(`${prefix}/`)).sort();
    },
  };
}

const ROOT = "ws/w1/a1/workspace";
const SHARED = "ws/w1/shared";

const SKILL = `---
name: brand-voice
description: Write like us
version: 1
---

## Procedure
`;

test("manifest: missing file means nothing enabled (valid degenerate state)", async () => {
  const store = memStore();
  expect(await loadSkillsManifest(store, ROOT)).toEqual(EMPTY_SKILLS_MANIFEST);
});

test("manifest round-trips sorted + deduped, at the .houston family-shaped key", async () => {
  const store = memStore();
  await saveSkillsManifest(store, ROOT, {
    version: 1,
    enabled: ["zeta", "brand-voice", "zeta"],
  });
  const raw = await store.readText(skillsManifestKey(ROOT));
  expect(skillsManifestKey(ROOT)).toBe(
    `${ROOT}/.houston/skills-manifest/skills-manifest.json`,
  );
  expect(raw).toContain('"brand-voice"');
  expect(await loadSkillsManifest(store, ROOT)).toEqual({
    version: 1,
    enabled: ["brand-voice", "zeta"],
  });
});

test("manifest tolerates per-field garbage but keeps loadJson's mangled-file throw", async () => {
  const store = memStore();
  await store.writeText(
    skillsManifestKey(ROOT),
    '{"version": 9, "enabled": ["ok", 42, null], "future": true}\n',
  );
  expect(await loadSkillsManifest(store, ROOT)).toEqual({
    version: 1,
    enabled: ["ok"],
  });
  expect(normalizeSkillsManifest("nonsense")).toEqual(EMPTY_SKILLS_MANIFEST);
  await store.writeText(skillsManifestKey(ROOT), "{not json");
  await expect(loadSkillsManifest(store, ROOT)).rejects.toThrow(
    "not valid JSON",
  );
});

test("withSharedSkill is pure and idempotent", () => {
  const on = withSharedSkill(EMPTY_SKILLS_MANIFEST, "brand-voice", true);
  expect(on.enabled).toEqual(["brand-voice"]);
  expect(EMPTY_SKILLS_MANIFEST.enabled).toEqual([]);
  expect(withSharedSkill(on, "brand-voice", true)).toEqual(on);
  expect(withSharedSkill(on, "brand-voice", false).enabled).toEqual([]);
});

test("shared skills load from the shared dir with the same loader as agent skills", async () => {
  const store = memStore();
  const dir = sharedSkillsDirKey(SHARED);
  await store.writeText(skillKeyInDir(dir, "brand-voice"), SKILL);
  const { items, diagnostics } = await loadSkillsFromDir(store, dir);
  expect(diagnostics).toEqual([]);
  expect(items.map((s) => s.name)).toEqual(["brand-voice"]);
  expect(skillKeyInDir(dir, "brand-voice")).toBe(
    "ws/w1/shared/skills/brand-voice/SKILL.md",
  );
});
