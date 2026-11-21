import type { SkillsManifest } from "@houston/protocol";
import { loadJson, saveJson, type TextStore } from "./store";

export const skillsManifestKey = (root: string) =>
  `${root}/.houston/skills-manifest/skills-manifest.json`;

export const EMPTY_SKILLS_MANIFEST: SkillsManifest = {
  version: 1,
  enabled: [],
};

export function normalizeSkillsManifest(value: unknown): SkillsManifest {
  if (typeof value !== "object" || value === null) return EMPTY_SKILLS_MANIFEST;
  const raw = (value as { enabled?: unknown }).enabled;
  const enabled = Array.isArray(raw)
    ? [...new Set(raw.filter((s): s is string => typeof s === "string"))].sort()
    : [];
  return { version: 1, enabled };
}

export async function loadSkillsManifest(
  store: TextStore,
  root: string,
): Promise<SkillsManifest> {
  const value = await loadJson<unknown>(
    store,
    skillsManifestKey(root),
    EMPTY_SKILLS_MANIFEST,
  );
  return normalizeSkillsManifest(value);
}

export async function saveSkillsManifest(
  store: TextStore,
  root: string,
  manifest: SkillsManifest,
): Promise<void> {
  await saveJson(store, skillsManifestKey(root), {
    version: 1,
    enabled: [...new Set(manifest.enabled)].sort(),
  });
}

export function withSharedSkill(
  manifest: SkillsManifest,
  slug: string,
  enabled: boolean,
): SkillsManifest {
  const set = new Set(manifest.enabled);
  if (enabled) set.add(slug);
  else set.delete(slug);
  return { version: 1, enabled: [...set].sort() };
}
