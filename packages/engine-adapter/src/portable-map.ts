import { type PortablePackage, portableInventory } from "@houston/domain";
import type {
  PortableInventoryPreview,
  PortableManifestSummary,
} from "@houston/wire-types";

export interface WireSelection {
  includeClaudeMd: boolean;
  skillSlugs: string[];
  routineIds: string[];
  learningIds: string[];
}

export function toWireSelection(sel: {
  includeClaudeMd: boolean;
  includeSkillSlugs: string[];
  includeRoutineIds: string[];
  includeLearningIds: string[];
}): WireSelection {
  return {
    includeClaudeMd: sel.includeClaudeMd,
    skillSlugs: sel.includeSkillSlugs,
    routineIds: sel.includeRoutineIds,
    learningIds: sel.includeLearningIds,
  };
}

function excerpt(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
}

export function packagePreview(pkg: PortablePackage): {
  manifest: PortableManifestSummary;
  preview: PortableInventoryPreview;
} {
  const inventory = portableInventory(pkg);
  return {
    manifest: {
      agentId: "",
      agentName: pkg.manifest.agentName,
      description: pkg.manifest.description ?? null,
      exporter: pkg.manifest.exporter ?? null,
      houstonVersion: pkg.manifest.houstonVersion,
      createdAt: pkg.manifest.createdAt,
      anonymized: pkg.manifest.anonymized ?? false,
      formatVersion: pkg.manifest.formatVersion,
    },
    preview: {
      claudeMd:
        pkg.claudeMd !== undefined
          ? {
              byteCount: new TextEncoder().encode(pkg.claudeMd).length,
              excerpt: excerpt(pkg.claudeMd),
            }
          : null,
      skills: inventory.skills.map((s) => ({
        slug: s.slug,
        description: s.description,
        category: null,
        image: null,
        integrations: [],
        featured: false,
      })),
      routines: pkg.routines.map((r) => ({
        id: r.id,
        name: r.name,
        promptExcerpt: excerpt(r.prompt),
        schedule: r.schedule,
        enabled: r.enabled,
        integrations: r.integrations,
      })),
      learnings: pkg.learnings.map((l) => ({
        id: l.id,
        text: l.text,
        createdAt: l.created_at,
      })),
    },
  };
}
