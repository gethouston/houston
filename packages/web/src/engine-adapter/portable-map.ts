/**
 * Pure mappings between the v1 client's portable-agent shapes (what the
 * wizards in app/src consume) and the host's v3 wire shapes / the domain
 * package model. No I/O — the network half lives in `portable.ts`.
 */

import { type PortablePackage, portableInventory } from "@houston/domain";
import type {
  PortableInventoryPreview,
  PortableManifestSummary,
} from "../../../../ui/engine-client/src/types";

/** The host's `PortableSelection` wire shape (packages/protocol). */
export interface WireSelection {
  includeClaudeMd: boolean;
  skillSlugs: string[];
  routineIds: string[];
  learningIds: string[];
}

/** Map the v1 client's selection field names onto the v3 wire shape. */
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

/** The unpacked package → the wizard's upload-preview shape. */
export function packagePreview(pkg: PortablePackage): {
  manifest: PortableManifestSummary;
  preview: PortableInventoryPreview;
} {
  const inventory = portableInventory(pkg);
  return {
    manifest: {
      // v3 manifests don't carry the source agent id; the wizard only reads
      // agentName/exporter/anonymized.
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
        description: r.description,
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

/** btoa chokes on one giant fromCharCode spread; encode in chunks. */
export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
