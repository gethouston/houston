import type { SkillsManifest } from "@houston/protocol";
import { loadJson, saveJson, type TextStore } from "./store";

/**
 * The per-agent shared-skills manifest (ADR 0003): which workspace-shared
 * skills THIS agent loads. Lives in agent data (hydrates with the agent,
 * survives moves, works offline). A missing file means "nothing enabled" —
 * the copy-based world is the valid degenerate state the migration starts
 * from, so absence is never an error.
 */
export const skillsManifestKey = (root: string) =>
  `${root}/.houston/skills-manifest/skills-manifest.json`;

export const EMPTY_SKILLS_MANIFEST: SkillsManifest = {
  version: 1,
  enabled: [],
};

/**
 * Normalize an untrusted parsed value into a valid manifest. Files-first: the
 * file is agent- and user-editable, so tolerate garbage per-field (drop it)
 * rather than rejecting the document — but keep `loadJson`'s throw for
 * unparseable JSON (a mangled file must surface, not silently reset).
 */
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

/** Pure enable/disable — returns a new manifest, never mutates. */
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
