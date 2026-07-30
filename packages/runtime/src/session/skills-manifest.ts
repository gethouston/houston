import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SkillsManifest } from "@houston/protocol";

export const EMPTY_SKILLS_MANIFEST: SkillsManifest = {
  version: 1,
  enabled: [],
};

/** Normalize the user-editable manifest without rejecting per-field garbage. */
export function normalizeSkillsManifest(value: unknown): SkillsManifest {
  if (typeof value !== "object" || value === null) {
    return EMPTY_SKILLS_MANIFEST;
  }
  const enabled = (value as { enabled?: unknown }).enabled;
  return {
    version: 1,
    enabled: Array.isArray(enabled)
      ? [
          ...new Set(
            enabled.filter((slug): slug is string => typeof slug === "string"),
          ),
        ].sort()
      : [],
  };
}

export function loadSkillsManifest(
  cwd: string,
  logDiagnostic: (message: string) => void = console.warn,
): SkillsManifest {
  const path = join(cwd, ".houston", "skills-manifest", "skills-manifest.json");
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return EMPTY_SKILLS_MANIFEST;
    }
    throw error;
  }
  try {
    return normalizeSkillsManifest(JSON.parse(content));
  } catch (error) {
    logDiagnostic(
      `[skills] Ignoring invalid shared-skills manifest at ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return EMPTY_SKILLS_MANIFEST;
  }
}
