// Portable agents — the `.houstonagent` share format (a zip of an agent's
// shareable content: CLAUDE.md + skills + routines + learnings). v3 keeps the
// round-trip; the v1 LLM-anonymization + security-scan are separate concerns.

export const PORTABLE_FORMAT_VERSION = 1;

export interface PortableManifest {
  agentName: string;
  description?: string;
  exporter?: string;
  houstonVersion: string;
  createdAt: string;
  formatVersion: number;
}

/** What a `.houstonagent` contains, shown before install. */
export interface PortableInventory {
  hasClaudeMd: boolean;
  skills: { slug: string; description: string }[];
  routines: { id: string; name: string; schedule: string }[];
  learnings: { id: string; text: string }[];
}

export interface PortablePreview {
  packageId: string;
  manifest: PortableManifest;
  inventory: PortableInventory;
}

/** Which parts of an agent to export / install. */
export interface PortableSelection {
  includeClaudeMd: boolean;
  skillSlugs: string[];
  routineIds: string[];
  learningIds: string[];
}
