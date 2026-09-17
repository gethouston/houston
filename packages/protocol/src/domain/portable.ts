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
  /** True when the exporter ran the anonymize pass before sharing. */
  anonymized?: boolean;
  formatVersion: number;
}

/** What a `.houstonagent` contains, shown before install. */
export interface PortableInventory {
  hasClaudeMd: boolean;
  skills: { slug: string; description: string }[];
  routines: {
    id: string;
    name: string;
    /** Cron wake; absent on trigger routines (exactly one of schedule/trigger). */
    schedule?: string;
    /** Event wake; absent on cron routines. Discriminated on `kind`: a Composio
     *  trigger (kind absent/"composio") carries its toolkit + slug; a webhook
     *  wake carries only `kind` (its URL/secret never live in shareable data). */
    trigger?:
      | { kind?: "composio"; toolkit: string; trigger_slug: string }
      | { kind: "webhook" };
  }[];
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

// ── Threat scan (heuristic review of an uploaded package) ────────────────

export type PortableScanSeverity = "low" | "medium" | "high";

export type PortableScanCategory =
  | "exfiltration"
  | "prompt_injection"
  | "tool_abuse"
  | "suspicious_shell"
  | "external_callback";

export type PortableScanItemKind =
  | "claude_md"
  | "skill"
  | "routine"
  | "learning";

export interface PortableScanFinding {
  category: PortableScanCategory;
  severity: PortableScanSeverity;
  excerpt: string;
  why: string;
}

export interface PortableScanItem {
  kind: PortableScanItemKind;
  id: string;
  findings: PortableScanFinding[];
}

export interface PortableScanResponse {
  disclaimer: string;
  items: PortableScanItem[];
}
