export const PORTABLE_FORMAT_VERSION = 1;

export interface PortableManifest {
  agentName: string;
  description?: string;
  exporter?: string;
  houstonVersion: string;
  createdAt: string;
  anonymized?: boolean;
  formatVersion: number;
}

export interface PortableInventory {
  hasClaudeMd: boolean;
  skills: { slug: string; description: string }[];
  routines: {
    id: string;
    name: string;
    schedule?: string;
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

export interface PortableSelection {
  includeClaudeMd: boolean;
  skillSlugs: string[];
  routineIds: string[];
  learningIds: string[];
}

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
