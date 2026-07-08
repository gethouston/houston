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

// ── Anonymize (heuristic redaction before sharing) ───────────────────────

export interface PortableAnonymizeRequest {
  claudeMd: boolean;
  skillSlugs: string[];
  routineIds: string[];
  learningIds: string[];
}

/** A redacted text with the diff the wizard renders side-by-side. */
export interface AnonymizedText {
  before: string;
  after: string;
  summary: string;
  /** Nothing meaningful left after redaction — the UI nudges "exclude instead?". */
  becameEmpty: boolean;
}

export interface AnonymizedItem extends AnonymizedText {
  id: string;
}

export interface RoutineFieldOverride {
  name?: string | null;
  prompt?: string | null;
}

export interface RoutineFieldDiff {
  field: string;
  before: string;
  after: string;
}

export interface AnonymizedRoutine {
  id: string;
  fieldDiffs: RoutineFieldDiff[];
  overridePayload: RoutineFieldOverride;
}

export interface PortableAnonymizeResponse {
  claudeMd: AnonymizedText | null;
  skills: AnonymizedItem[];
  routines: AnonymizedRoutine[];
  learnings: AnonymizedItem[];
}

/** Accepted anonymize diffs, applied at export-pack time. */
export interface PortableExportOverrides {
  claudeMd?: string | null;
  skillBodies?: Record<string, string>;
  routineFields?: Record<string, RoutineFieldOverride>;
  learningTexts?: Record<string, string>;
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
