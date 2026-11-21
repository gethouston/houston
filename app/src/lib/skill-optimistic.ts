import type { SkillsManifest } from "@houston/engine-adapter";
import type { QueryKey } from "@tanstack/react-query";
import type { OptimisticPatch } from "./optimistic-core.ts";
import { queryKeys } from "./query-keys.ts";
import type { SkillSummary } from "./types";

export function withoutSkillCopy(
  list: SkillSummary[] | undefined,
  slug: string,
): SkillSummary[] | undefined {
  if (!list?.some((skill) => skill.name === slug)) return list;
  return list.filter((skill) => skill.name !== slug);
}

export function withManifestEntry(
  manifest: SkillsManifest | undefined,
  slug: string,
  enabled: boolean,
): SkillsManifest | undefined {
  if (!manifest) return manifest;
  if (manifest.enabled.includes(slug) === enabled) return manifest;
  const rest = manifest.enabled.filter((entry) => entry !== slug);
  return {
    ...manifest,
    enabled: enabled ? [...rest, slug].sort() : rest,
  };
}

interface SharedSkillsList {
  items: SkillSummary[];
}

function isSharedSkillsList(data: unknown): data is SharedSkillsList {
  return (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as { items?: unknown }).items)
  );
}

export function withoutSharedSkill<T>(data: T, slug: string): T {
  if (!isSharedSkillsList(data)) return data;
  if (!data.items.some((skill) => skill.name === slug)) return data;
  return {
    ...data,
    items: data.items.filter((skill) => skill.name !== slug),
  };
}

export function copiesRemoved(
  agentPaths: readonly string[],
  slug: string,
): OptimisticPatch[] {
  return agentPaths.map((path) => ({
    queryKey: queryKeys.skills(path),
    apply: (list: SkillSummary[] | undefined) => withoutSkillCopy(list, slug),
  }));
}

export function manifestsSet(
  agentPaths: readonly string[],
  slug: string,
  enabled: boolean,
): OptimisticPatch[] {
  return agentPaths.map((path) => ({
    queryKey: queryKeys.skillsManifest(path),
    apply: (manifest: SkillsManifest | undefined) =>
      withManifestEntry(manifest, slug, enabled),
  }));
}

export function sharedRemoved(
  workspaceId: string,
  slug: string,
): OptimisticPatch {
  return {
    queryKey: queryKeys.sharedSkills(workspaceId),
    apply: (data: unknown) => withoutSharedSkill(data, slug),
  };
}

export function skillWriteRefresh(
  agentPaths: readonly string[],
  workspaceId: string | null,
): QueryKey[] {
  return [
    ...(workspaceId === null ? [] : [queryKeys.sharedSkills(workspaceId)]),
    ...agentPaths.flatMap((path) => [
      queryKeys.skillsManifest(path),
      queryKeys.skills(path),
      ["skill-detail", path],
    ]),
  ];
}
