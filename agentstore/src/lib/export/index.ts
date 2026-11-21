import type { AgentIR, SecretFinding } from "@houston/agentstore-contract";
import { scanIrForSecrets } from "@houston/agentstore-contract";
import { buildClaudeSkillZip } from "./claude-skill-zip";
import { buildCopyPaste } from "./copy-paste";

export {
  buildAgentSkillMarkdown,
  buildClaudeSkillZip,
} from "./claude-skill-zip";
export { buildCopyPaste } from "./copy-paste";

export const EXPORT_TARGET_IDS = ["claude-skill-zip", "copy-paste"] as const;
export type ExportTargetId = (typeof EXPORT_TARGET_IDS)[number];

export const defaultExportTarget: ExportTargetId = "claude-skill-zip";

export function isExportTargetId(id: string): id is ExportTargetId {
  return (EXPORT_TARGET_IDS as readonly string[]).includes(id);
}

export type ExportResult =
  | {
      kind: "zip";
      target: ExportTargetId;
      bytes: Uint8Array;
      filename: string;
      contentType: "application/zip";
    }
  | {
      kind: "text";
      target: ExportTargetId;
      text: string;
      filename: string;
      contentType: "text/markdown; charset=utf-8";
    };

type Adapter = (ir: AgentIR) => Promise<ExportResult> | ExportResult;

const exportAdapters: Record<ExportTargetId, Adapter> = {
  "claude-skill-zip": async (ir) => {
    const { bytes, filename } = await buildClaudeSkillZip(ir);
    return {
      kind: "zip",
      target: "claude-skill-zip",
      bytes,
      filename,
      contentType: "application/zip",
    };
  },
  "copy-paste": (ir) => ({
    kind: "text",
    target: "copy-paste",
    text: buildCopyPaste(ir),
    filename: `${ir.identity.slug}.md`,
    contentType: "text/markdown; charset=utf-8",
  }),
};

export class ExportSecretLeakError extends Error {
  readonly findings: SecretFinding[];
  constructor(findings: SecretFinding[]) {
    super(
      `Export blocked: definition appears to contain ${findings.length} secret(s): ` +
        findings.map((f) => `${f.pattern} (${f.excerpt})`).join(", "),
    );
    this.name = "ExportSecretLeakError";
    this.findings = findings;
  }
}

export async function runExport(
  target: ExportTargetId,
  ir: AgentIR,
  opts: { block?: boolean } = {},
): Promise<{ result: ExportResult; findings: SecretFinding[] }> {
  const block = opts.block ?? true;
  const findings = scanIrForSecrets(ir);
  if (block && findings.length) {
    throw new ExportSecretLeakError(findings);
  }
  const result = await exportAdapters[target](ir);
  return { result, findings };
}
