/**
 * Export orchestration for the Agent Store.
 *
 * Maps an export target id -> adapter and provides `runExport`, which runs a
 * blocking secret scan over the IR (via the contract's `scanIrForSecrets`) BEFORE
 * any payload is produced. A finding aborts the export with a typed
 * `ExportSecretLeakError` so a leaking bundle never leaves the platform.
 *
 * v1 targets EXACTLY: "claude-skill-zip" (default) + "copy-paste".
 */
import type { AgentIR, SecretFinding } from "@houston/agentstore-contract";
import { scanIrForSecrets } from "@houston/agentstore-contract";
import { buildClaudeSkillZip } from "./claude-skill-zip";
import { buildCopyPaste } from "./copy-paste";

export {
  buildAgentSkillMarkdown,
  buildClaudeSkillZip,
} from "./claude-skill-zip";
export { buildCopyPaste } from "./copy-paste";

/** The export target ids the store serves (also the `?target=` query values). */
export const EXPORT_TARGET_IDS = ["claude-skill-zip", "copy-paste"] as const;
export type ExportTargetId = (typeof EXPORT_TARGET_IDS)[number];

/** The default export target id. */
export const defaultExportTarget: ExportTargetId = "claude-skill-zip";

/** Type guard for an arbitrary string against the allowed target ids. */
export function isExportTargetId(id: string): id is ExportTargetId {
  return (EXPORT_TARGET_IDS as readonly string[]).includes(id);
}

/** A finished export payload. ZIP exports carry bytes; text exports carry a
 *  string. `contentType`/`filename` drive the download response. */
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

/** Raised when an export is blocked because the IR appears to contain secrets. */
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

/**
 * Run an export for a target. Scans the IR's user-authored text first; if secrets
 * are found (and `block` is not disabled) it throws `ExportSecretLeakError` so the
 * caller never ships a leaking payload.
 */
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
